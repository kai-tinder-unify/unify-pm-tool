import { prisma } from '../prisma';

/**
 * Format a date by its UTC calendar day. Used for both due dates (stored at UTC
 * midnight) and the briefing's range bounds (also constructed in UTC), so the
 * displayed range matches the calendar dates that were requested.
 */
function fmtDay(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function dueLabel(task: { isWip: boolean; estimatedDueDate: Date | null }) {
  if (task.isWip) return 'ongoing';
  if (task.estimatedDueDate) return `due: ${fmtDay(task.estimatedDueDate)}`;
  return 'no date set';
}

/** Round to 0.1h for display so summed floats don't show long tails. */
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/**
 * Generates a PERSONAL briefing for one user over a date range and stores it. A
 * briefing belongs to its owner (userId) and is only ever shown to that user; it
 * summarizes just their own activity — the hours they logged and the tasks they were
 * on — never the rest of the team's.
 *
 * The range is [rangeStart, rangeEnd]; both default so the weekly scheduled run and a
 * bare "Generate" still produce the trailing-7-days briefing. Bounds are persisted in
 * WeeklyBriefing.weekStart/weekEnd (reused as generic range bounds, not just a week).
 *
 * @param userId     Owner of the briefing; all activity is scoped to this user.
 * @param rangeStart Inclusive start of the window. Defaults to 7 days before the end.
 * @param rangeEnd   Inclusive end of the window. Defaults to now.
 * @returns The created WeeklyBriefing row (with markdown `content`).
 */
export async function generateBriefing(userId: string, rangeStart?: Date, rangeEnd?: Date) {
  const end = rangeEnd ?? new Date();
  const start = rangeStart ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  // What this person worked on in the window: their own assignments touched in range.
  // hoursLogged is the assignment's running total (there is no per-window hours ledger),
  // so a task touched in the window contributes its cumulative hours — matches how the
  // app has always summarized effort. Heaviest tasks first.
  const worked = await prisma.taskAssignment.findMany({
    where: { userId, updatedAt: { gte: start, lte: end } },
    include: { task: true },
    orderBy: { hoursLogged: 'desc' },
  });

  // What's currently on their plate: their still-active assignments (no end date) on
  // tasks that aren't closed. Ordered by priority then soonest due.
  const onPlate = await prisma.taskAssignment.findMany({
    where: { userId, endDate: null, task: { status: { not: 'closed' } } },
    include: { task: true },
    orderBy: [{ task: { priority: 'asc' } }, { task: { estimatedDueDate: 'asc' } }],
  });

  const totalHours = worked.reduce((sum, a) => sum + a.hoursLogged, 0);
  // Tasks they worked on that closed within the window.
  const closedThisPeriod = worked.filter(
    (a) => a.task.status === 'closed' && a.task.closedAt && a.task.closedAt >= start && a.task.closedAt <= end,
  ).length;

  const lines: string[] = [];
  lines.push(`## Your briefing — ${fmtDay(start)} to ${fmtDay(end)}`);
  lines.push('');

  lines.push('### Summary');
  lines.push(
    `- ${round1(totalHours)} hours logged across ${worked.length} task${worked.length === 1 ? '' : 's'}`,
  );
  lines.push(`- ${closedThisPeriod} of your task${closedThisPeriod === 1 ? '' : 's'} closed this period`);
  lines.push(`- ${onPlate.length} task${onPlate.length === 1 ? '' : 's'} currently on your plate`);
  lines.push('');

  lines.push('### What you worked on');
  if (worked.length === 0) {
    lines.push('- You logged no hours in this period.');
  } else {
    for (const a of worked) {
      const meta = [a.task.bucket, a.task.initiative].filter(Boolean).join(' / ');
      const tail = [meta, dueLabel(a.task), `status: ${a.task.status.replace('_', ' ')}`]
        .filter(Boolean)
        .join(', ');
      lines.push(`- ${a.task.title}: ${round1(a.hoursLogged)} hrs (${tail})`);
    }
  }
  lines.push('');

  lines.push('### On your plate');
  if (onPlate.length === 0) {
    lines.push('- Nothing currently assigned.');
  } else {
    for (const a of onPlate) {
      lines.push(
        `- ${a.task.title} — for ${a.task.requestedBy}, ${dueLabel(a.task)}, priority: ${a.task.priority}, status: ${a.task.status.replace('_', ' ')}`,
      );
    }
  }

  const content = lines.join('\n');
  // weekStart/weekEnd hold the (possibly non-week) range bounds; see the model comment.
  return prisma.weeklyBriefing.create({
    data: { userId, weekStart: start, weekEnd: end, content },
  });
}
