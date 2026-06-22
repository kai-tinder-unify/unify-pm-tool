import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler } from '../middleware/auth';

const router = Router();

const NO_INITIATIVE = 'No initiative';

type Filters = {
  from?: Date;
  to?: Date;
  bucket?: string;
  initiative?: string;
};

function parseFilters(q: Record<string, unknown>): Filters {
  const f: Filters = {};
  if (q.from) f.from = new Date(String(q.from));
  if (q.to) {
    f.to = new Date(String(q.to));
    f.to.setHours(23, 59, 59, 999);
  }
  if (q.bucket) f.bucket = String(q.bucket);
  if (q.initiative) f.initiative = String(q.initiative);
  return f;
}

function taskWhere(f: Filters) {
  return {
    ...(f.bucket ? { bucket: f.bucket } : {}),
    ...(f.initiative ? { initiative: f.initiative } : {}),
  };
}

/** Assignments matching the filters; the basis for all hours math. */
async function filteredAssignments(f: Filters) {
  return prisma.taskAssignment.findMany({
    where: {
      ...(f.from || f.to
        ? { updatedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } }
        : {}),
      task: taskWhere(f),
    },
    include: {
      user: { select: { id: true, name: true } },
      task: true,
    },
  });
}

function weekKey(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - ((day + 6) % 7)); // back to Monday
  return date.toISOString().slice(0, 10);
}

// --- Dashboard summary cards ---
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [openTasks, tasksInProgress, completedThisWeek, monthAssignments] = await Promise.all([
      prisma.task.count({ where: { status: { not: 'closed' } } }),
      prisma.task.count({ where: { status: 'in_progress' } }),
      prisma.task.count({ where: { status: 'closed', updatedAt: { gte: weekAgo } } }),
      prisma.taskAssignment.findMany({ where: { updatedAt: { gte: monthStart } } }),
    ]);

    res.json({
      openTasks,
      tasksInProgress,
      completedThisWeek,
      hoursThisMonth: Math.round(monthAssignments.reduce((s, a) => s + a.hoursLogged, 0) * 10) / 10,
    });
  }),
);

// --- Capacity & effort ---
router.get(
  '/capacity',
  asyncHandler(async (req, res) => {
    const f = parseFilters(req.query as Record<string, unknown>);
    const assignments = await filteredAssignments(f);

    const byBucket = new Map<string, number>();
    const byInitiative = new Map<string, number>();
    const byWeek = new Map<string, number>();

    for (const a of assignments) {
      byBucket.set(a.task.bucket, (byBucket.get(a.task.bucket) || 0) + a.hoursLogged);
      const init = a.task.initiative || NO_INITIATIVE;
      byInitiative.set(init, (byInitiative.get(init) || 0) + a.hoursLogged);
      const wk = weekKey(a.startDate || a.createdAt);
      byWeek.set(wk, (byWeek.get(wk) || 0) + a.hoursLogged);
    }

    const toSorted = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
        .sort((a, b) => b.hours - a.hours);

    res.json({
      hoursByBucket: toSorted(byBucket),
      hoursByInitiative: toSorted(byInitiative),
      weeklyTrend: [...byWeek.entries()]
        .map(([week, hours]) => ({ week, hours: Math.round(hours * 10) / 10 }))
        .sort((a, b) => a.week.localeCompare(b.week)),
    });
  }),
);

// --- Task flow + supported leaders ---
router.get(
  '/flow',
  asyncHandler(async (req, res) => {
    const f = parseFilters(req.query as Record<string, unknown>);

    const tasks = await prisma.task.findMany({
      where: {
        ...taskWhere(f),
        ...(f.from || f.to
          ? { submittedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } }
          : {}),
      },
      include: { assignments: { include: { user: { select: { id: true, name: true } } } } },
    });

    // Tasks by status
    const byStatus: Record<string, number> = {};
    for (const t of tasks) byStatus[t.status] = (byStatus[t.status] || 0) + 1;

    // Avg intake-to-completion by bucket (closed tasks; last update as proxy for completion)
    const cycleByBucket = new Map<string, number[]>();
    for (const t of tasks.filter((t) => t.status === 'closed')) {
      const days = (t.updatedAt.getTime() - t.submittedAt.getTime()) / (24 * 60 * 60 * 1000);
      if (!cycleByBucket.has(t.bucket)) cycleByBucket.set(t.bucket, []);
      cycleByBucket.get(t.bucket)!.push(Math.max(0, days));
    }
    const avgCycleByBucket = [...cycleByBucket.entries()].map(([bucket, arr]) => ({
      bucket,
      avgDays: Math.round((arr.reduce((s, d) => s + d, 0) / arr.length) * 10) / 10,
    }));

    // Tasks completed per week
    const completedPerWeek = new Map<string, number>();
    for (const t of tasks.filter((t) => t.status === 'closed')) {
      const wk = weekKey(t.updatedAt);
      completedPerWeek.set(wk, (completedPerWeek.get(wk) || 0) + 1);
    }

    // Priority distribution of open tasks
    const openTasks = tasks.filter((t) => t.status !== 'closed');
    const priorityDist: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const t of openTasks) priorityDist[t.priority] = (priorityDist[t.priority] || 0) + 1;

    // WIP tasks and age
    const wipTasks = tasks
      .filter((t) => t.isWip && t.status !== 'closed')
      .map((t) => ({
        id: t.id,
        title: t.title,
        daysOpen: Math.floor((Date.now() - t.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      }))
      .sort((a, b) => b.daysOpen - a.daysOpen);

    // Supported leaders
    const leaders = new Map<string, { tasks: number; hours: number; buckets: Set<string>; initiatives: Set<string> }>();
    for (const t of tasks) {
      if (!leaders.has(t.requestedBy)) {
        leaders.set(t.requestedBy, { tasks: 0, hours: 0, buckets: new Set(), initiatives: new Set() });
      }
      const l = leaders.get(t.requestedBy)!;
      l.tasks += 1;
      l.buckets.add(t.bucket);
      if (t.initiative) l.initiatives.add(t.initiative);
      for (const a of t.assignments) l.hours += a.hoursLogged;
    }
    const supportedLeaders = [...leaders.entries()]
      .map(([name, l]) => ({
        name,
        tasks: l.tasks,
        hours: Math.round(l.hours * 10) / 10,
        buckets: [...l.buckets],
        initiatives: [...l.initiatives],
      }))
      .sort((a, b) => b.hours - a.hours);

    // Per-member performance (admin view): for each contributor, how many distinct
    // tasks they touched, the hours they logged, and the task list itself (id+title)
    // so the UI can link straight to each task. Built from the same filtered `tasks`
    // set as everything else here, so it honors the date/bucket/initiative filters.
    // We dedupe tasks per member via a Map keyed by task id (a member may have a
    // single assignment per task, but keying by id keeps it robust regardless).
    const members = new Map<
      string,
      { id: string; name: string; hours: number; tasks: Map<string, string> }
    >();
    for (const t of tasks) {
      for (const a of t.assignments) {
        if (!members.has(a.user.id)) {
          members.set(a.user.id, { id: a.user.id, name: a.user.name, hours: 0, tasks: new Map() });
        }
        const m = members.get(a.user.id)!;
        m.hours += a.hoursLogged;
        m.tasks.set(t.id, t.title);
      }
    }
    const memberPerformance = [...members.values()]
      .map((m) => ({
        id: m.id,
        name: m.name,
        taskCount: m.tasks.size,
        hours: Math.round(m.hours * 10) / 10,
        // Most recent first isn't meaningful here (no per-task date on the entry), so
        // we leave tasks in insertion order — the order they appear in the task list.
        tasks: [...m.tasks.entries()].map(([id, title]) => ({ id, title })),
      }))
      // Rank by hours invested, the headline performance figure.
      .sort((a, b) => b.hours - a.hours);

    res.json({
      tasksByStatus: byStatus,
      avgCycleByBucket,
      tasksCompletedPerWeek: [...completedPerWeek.entries()]
        .map(([week, count]) => ({ week, count }))
        .sort((a, b) => a.week.localeCompare(b.week)),
      priorityDistribution: priorityDist,
      wipTasks,
      supportedLeaders,
      memberPerformance,
    });
  }),
);

export default router;
