import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, requireAdmin, httpError } from '../middleware/auth';
import { sendTeamsEvent } from '../services/notifications';

const router = Router();

const taskInclude = {
  createdBy: { select: { id: true, name: true } },
  assignments: { include: { user: { select: { id: true, name: true } } } },
  // One level of subtasks, each with their own contributors. Subtasks are a
  // lightweight breakdown of the parent (e.g. a proposal split into slides) but are
  // still backed by normal Task rows, so we pull:
  //   - createdBy → the "logged by" attribution shown on each subtask row,
  //   - assignments (+ the assigned user's id/name) → the per-contributor hours that
  //     roll up into the subtask's hours total and the board's subtask-progress chip.
  // submittedAt (the "entry date") is a scalar and comes back automatically. We order
  // by it ascending so the breakdown reads in the order pieces were added. parentId
  // is also scalar, so we don't need to (and shouldn't) recurse past this one level.
  subtasks: {
    include: {
      createdBy: { select: { id: true, name: true } },
      assignments: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { submittedAt: 'asc' },
  },
} as const;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, bucket, initiative, closedFrom, closedTo } = req.query;
    // Optional closedAt range, used by the Closed-tasks reporting view to pull a
    // single quarter's closed work. Both bounds are optional; when neither is
    // present we add no closedAt constraint at all (so the board's normal fetch is
    // unaffected). closedTo is treated as inclusive-to-end-of-day so a date-only
    // bound (e.g. the last day of a quarter) still captures rows closed that day.
    const closedRange: { gte?: Date; lte?: Date } = {};
    if (closedFrom) closedRange.gte = new Date(String(closedFrom));
    if (closedTo) {
      const to = new Date(String(closedTo));
      to.setHours(23, 59, 59, 999);
      closedRange.lte = to;
    }
    const tasks = await prisma.task.findMany({
      where: {
        ...(status ? { status: String(status) as any } : {}),
        ...(bucket ? { bucket: String(bucket) } : {}),
        ...(initiative ? { initiative: String(initiative) } : {}),
        ...(closedRange.gte || closedRange.lte ? { closedAt: closedRange } : {}),
      },
      include: taskInclude,
      orderBy: { submittedAt: 'desc' },
    });
    res.json(tasks);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      title, description, requestedBy, submittedAt, status, priority, isWip,
      estimatedDueDate, targetStartDate, estimatedHours,
      bucket, initiative, salesforceOpportunity, parentId,
    } = req.body || {};

    // When this task is being created as a subtask, resolve the parent up front so
    // we can (a) reject illegal nesting and (b) inherit the parent's bucket when the
    // caller didn't supply one. We only need parentId + bucket off the parent.
    let parentBucket: string | null = null;
    if (parentId) {
      const parent = await prisma.task.findUnique({
        where: { id: String(parentId) },
        select: { id: true, parentId: true, bucket: true },
      });
      if (!parent) throw httpError(400, 'Parent task not found');
      // One level only: a subtask cannot itself have a parent. Rejecting here keeps
      // the data model flat so the board/detail rendering never has to recurse.
      if (parent.parentId) throw httpError(400, 'Cannot nest a subtask under another subtask');
      parentBucket = parent.bucket;
    }

    // Subtasks inherit the parent's bucket when one isn't explicitly provided; only
    // top-level tasks (no parent) still require a bucket from the caller.
    const effectiveBucket = bucket || parentBucket;
    if (!title || !requestedBy || !effectiveBucket) {
      throw httpError(400, 'Title, requested by, and bucket are required');
    }

    const wip = Boolean(isWip);
    const task = await prisma.task.create({
      data: {
        title: String(title).trim(),
        description: description ? String(description) : null,
        requestedBy: String(requestedBy).trim(),
        submittedAt: submittedAt ? new Date(submittedAt) : undefined,
        status: status || 'not_started',
        // If a task is created already closed (unusual — e.g. an import or a direct
        // status), stamp the close time now so it buckets into the right quarter and
        // shows a date in the Closed-tasks report. The PUT path covers the normal
        // close-it-later flow.
        closedAt: status === 'closed' ? new Date() : null,
        priority: priority || 'medium',
        isWip: wip,
        estimatedDueDate: !wip && estimatedDueDate ? new Date(estimatedDueDate) : null,
        targetStartDate: targetStartDate ? new Date(targetStartDate) : null,
        estimatedHours: estimatedHours != null && estimatedHours !== '' ? Number(estimatedHours) : null,
        bucket: String(effectiveBucket),
        initiative: initiative ? String(initiative) : null,
        // Salesforce opportunity link/ID (optional) — trim so a pasted value with
        // stray whitespace still matches cleanly; an empty string stores as null.
        salesforceOpportunity: salesforceOpportunity ? String(salesforceOpportunity).trim() : null,
        // Link to the parent task when creating a subtask (null = top-level task).
        // Already validated above to exist and to itself be top-level.
        parentId: parentId ? String(parentId) : null,
        createdById: req.user!.id,
      },
      include: taskInclude,
    });
    res.status(201).json(task);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: taskInclude });
    if (!task) throw httpError(404, 'Task not found');
    res.json(task);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const {
      title, description, requestedBy, submittedAt, status, priority, isWip,
      estimatedDueDate, targetStartDate, estimatedHours,
      bucket, initiative, salesforceOpportunity,
    } = req.body || {};

    const data: any = {};
    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = description ? String(description) : null;
    if (requestedBy !== undefined) data.requestedBy = String(requestedBy).trim();
    if (submittedAt !== undefined) data.submittedAt = new Date(submittedAt);
    if (status !== undefined) {
      data.status = status;
      // Adjust the terminal-close timestamp ONLY on an actual transition, so the
      // recorded close time stays the FIRST time the task was closed. That date
      // drives the Closed-tasks report and its calendar-quarter bucketing, so a
      // later edit (or a no-op re-save) that still carries status === 'closed' must
      // not push it forward. One extra read is worth keeping the close date honest.
      const current = await prisma.task.findUnique({
        where: { id: req.params.id },
        select: { status: true },
      });
      const wasClosed = current?.status === 'closed';
      const willBeClosed = status === 'closed';
      if (!wasClosed && willBeClosed) {
        data.closedAt = new Date(); // newly closing → record when it closed
      } else if (wasClosed && !willBeClosed) {
        data.closedAt = null; // reopening → clear the close time
      }
      // closed-ness unchanged → leave closedAt exactly as it was
    }
    if (priority !== undefined) data.priority = priority;
    if (isWip !== undefined) {
      data.isWip = Boolean(isWip);
      if (data.isWip) data.estimatedDueDate = null; // WIP tasks never carry a due date
    }
    if (estimatedDueDate !== undefined && !data.isWip) {
      data.estimatedDueDate = estimatedDueDate ? new Date(estimatedDueDate) : null;
    }
    if (targetStartDate !== undefined) {
      data.targetStartDate = targetStartDate ? new Date(targetStartDate) : null;
    }
    if (estimatedHours !== undefined) {
      data.estimatedHours = estimatedHours != null && estimatedHours !== '' ? Number(estimatedHours) : null;
    }
    if (bucket !== undefined) data.bucket = String(bucket);
    if (initiative !== undefined) data.initiative = initiative ? String(initiative) : null;
    // Only touch the SF opportunity when the client actually sends the key; an
    // empty string clears it back to null (e.g. an erroneous link removed).
    if (salesforceOpportunity !== undefined) {
      data.salesforceOpportunity = salesforceOpportunity ? String(salesforceOpportunity).trim() : null;
    }

    const task = await prisma.task.update({ where: { id: req.params.id }, data, include: taskInclude });
    res.json(task);
  }),
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// --- Assignments nested under a task ---

router.get(
  '/:id/assignments',
  asyncHandler(async (req, res) => {
    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId: req.params.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(assignments);
  }),
);

/** Upserts the current user's own assignment on this task. */
router.post(
  '/:id/assignments',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw httpError(404, 'Task not found');

    const { startDate, endDate, hoursLogged, notes } = req.body || {};
    const hours = hoursLogged != null && hoursLogged !== '' ? Number(hoursLogged) : 0;
    if (Number.isNaN(hours) || hours < 0) throw httpError(400, 'Hours must be a non-negative number');

    const assignment = await prisma.taskAssignment.upsert({
      where: { taskId_userId: { taskId: task.id, userId: req.user!.id } },
      update: {
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined,
        hoursLogged: hours,
        notes: notes !== undefined ? (notes ? String(notes) : null) : undefined,
      },
      create: {
        taskId: task.id,
        userId: req.user!.id,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        hoursLogged: hours,
        notes: notes ? String(notes) : null,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    res.status(201).json(assignment);
  }),
);

/** Manual admin ping — notifies every contributor in Teams immediately, no cooldown. */
router.post(
  '/:id/ping',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { assignments: { include: { user: { select: { name: true, email: true } } } } },
    });
    if (!task) throw httpError(404, 'Task not found');

    // Contributors are unique per task (TaskAssignment @@unique[taskId,userId]).
    const recipients = task.assignments.map((a) => ({ name: a.user.name, email: a.user.email }));
    if (recipients.length === 0) {
      throw httpError(400, 'This task has no contributors to ping. Add a contributor first.');
    }

    // Bypasses the daily-ping toggle and the 20h check-in guard by design — this is
    // a deliberate admin action. sendTeamsEvent throws on failure so the admin gets
    // a real error (e.g. webhook not configured) rather than a silent no-op.
    await sendTeamsEvent({
      type: 'task_ping',
      task: {
        id: task.id,
        title: task.title,
        bucket: task.bucket,
        priority: task.priority,
        requestedBy: task.requestedBy,
      },
      recipients,
      pingedBy: req.user!.name,
    });

    res.json({
      ok: true,
      message: `Ping sent to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}`,
    });
  }),
);

export default router;
