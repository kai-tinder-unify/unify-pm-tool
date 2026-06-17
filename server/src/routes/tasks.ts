import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, requireAdmin, httpError } from '../middleware/auth';
import { notifyTeams, sendTeamsEvent } from '../services/notifications';

const router = Router();

const taskInclude = {
  createdBy: { select: { id: true, name: true } },
  assignments: { include: { user: { select: { id: true, name: true } } } },
} as const;

/** Fires a Teams "joined a task" notification when someone is newly added as a contributor. */
function fireTaskJoined(
  task: { id: string; title: string; bucket: string; priority: string; requestedBy: string },
  member: string,
) {
  void notifyTeams({
    type: 'task_joined',
    task: {
      id: task.id,
      title: task.title,
      bucket: task.bucket,
      priority: task.priority,
      requestedBy: task.requestedBy,
    },
    member,
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, bucket, initiative } = req.query;
    const tasks = await prisma.task.findMany({
      where: {
        ...(status ? { status: String(status) as any } : {}),
        ...(bucket ? { bucket: String(bucket) } : {}),
        ...(initiative ? { initiative: String(initiative) } : {}),
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
      bucket, initiative,
    } = req.body || {};
    if (!title || !requestedBy || !bucket) {
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
        priority: priority || 'medium',
        isWip: wip,
        estimatedDueDate: !wip && estimatedDueDate ? new Date(estimatedDueDate) : null,
        targetStartDate: targetStartDate ? new Date(targetStartDate) : null,
        estimatedHours: estimatedHours != null && estimatedHours !== '' ? Number(estimatedHours) : null,
        bucket: String(bucket),
        initiative: initiative ? String(initiative) : null,
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
      bucket, initiative,
    } = req.body || {};

    const data: any = {};
    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = description ? String(description) : null;
    if (requestedBy !== undefined) data.requestedBy = String(requestedBy).trim();
    if (submittedAt !== undefined) data.submittedAt = new Date(submittedAt);
    if (status !== undefined) data.status = status;
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

    // Detect a first-time join (vs. updating an existing assignment) so the "joined a
    // task" Teams card posts only once, not on every hours update.
    const existing = await prisma.taskAssignment.findUnique({
      where: { taskId_userId: { taskId: task.id, userId: req.user!.id } },
      select: { id: true },
    });

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

    if (!existing) fireTaskJoined(task, req.user!.name);
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
