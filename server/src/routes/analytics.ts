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
      prisma.task.count({ where: { status: { not: 'complete' } } }),
      prisma.task.count({ where: { status: 'in_progress' } }),
      prisma.task.count({ where: { status: 'complete', updatedAt: { gte: weekAgo } } }),
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

    // Estimated vs actual per task (only where an estimate exists)
    const taskIds = [...new Set(assignments.map((a) => a.taskId))];
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, estimatedHours: { not: null } },
      include: { assignments: true },
    });
    const estVsActual = tasks.map((t) => ({
      task: t.title,
      estimated: t.estimatedHours,
      actual: Math.round(t.assignments.reduce((s, a) => s + a.hoursLogged, 0) * 10) / 10,
    }));

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
      estVsActual,
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

    // Avg intake-to-completion by bucket (complete tasks; last update as proxy for completion)
    const cycleByBucket = new Map<string, number[]>();
    for (const t of tasks.filter((t) => t.status === 'complete')) {
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
    for (const t of tasks.filter((t) => t.status === 'complete')) {
      const wk = weekKey(t.updatedAt);
      completedPerWeek.set(wk, (completedPerWeek.get(wk) || 0) + 1);
    }

    // Priority distribution of open tasks
    const openTasks = tasks.filter((t) => t.status !== 'complete');
    const priorityDist: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const t of openTasks) priorityDist[t.priority] = (priorityDist[t.priority] || 0) + 1;

    // WIP tasks and age
    const wipTasks = tasks
      .filter((t) => t.isWip && t.status !== 'complete')
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

    res.json({
      tasksByStatus: byStatus,
      avgCycleByBucket,
      tasksCompletedPerWeek: [...completedPerWeek.entries()]
        .map(([week, count]) => ({ week, count }))
        .sort((a, b) => a.week.localeCompare(b.week)),
      priorityDistribution: priorityDist,
      wipTasks,
      supportedLeaders,
    });
  }),
);

export default router;
