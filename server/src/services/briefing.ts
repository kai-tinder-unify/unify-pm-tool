import { marked } from 'marked';
import { prisma } from '../prisma';
import { sendEmail } from './email';
import { sendTeamsMessage } from './teams';
import { getSettings } from './settings';

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Calendar-day values (due dates) are stored at UTC midnight — format by UTC day. */
function fmtDay(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function dueLabel(task: { isWip: boolean; estimatedDueDate: Date | null }) {
  if (task.isWip) return 'WIP';
  if (task.estimatedDueDate) return `due: ${fmtDay(task.estimatedDueDate)}`;
  return 'no date set';
}

/** Generates the weekly briefing markdown for the trailing 7 days and stores it. */
export async function generateBriefing() {
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const assignments = await prisma.taskAssignment.findMany({
    where: { updatedAt: { gte: weekStart } },
    include: { user: true, task: true },
  });

  // Group: task -> contributor lines
  const byTask = new Map<string, { task: (typeof assignments)[number]['task']; lines: string[] }>();
  for (const a of assignments) {
    const key = a.taskId;
    if (!byTask.has(key)) byTask.set(key, { task: a.task, lines: [] });
    byTask.get(key)!.lines.push(`  - ${a.user.name}: ${a.hoursLogged} hrs`);
  }

  const completedCount = await prisma.task.count({
    where: { status: 'complete', updatedAt: { gte: weekStart } },
  });
  const newTaskCount = await prisma.task.count({ where: { submittedAt: { gte: weekStart } } });

  const totalHours = assignments.reduce((sum, a) => sum + a.hoursLogged, 0);
  const contributors = new Set(assignments.map((a) => a.userId)).size;

  const hoursByInitiative = new Map<string, number>();
  for (const a of assignments) {
    if (!a.task.initiative) continue;
    hoursByInitiative.set(a.task.initiative, (hoursByInitiative.get(a.task.initiative) || 0) + a.hoursLogged);
  }
  const topInitiative = [...hoursByInitiative.entries()].sort((a, b) => b[1] - a[1])[0];

  const upcoming = await prisma.task.findMany({
    where: { status: { in: ['not_started', 'in_progress', 'blocked', 'paused'] } },
    orderBy: [{ priority: 'asc' }, { estimatedDueDate: 'asc' }],
    take: 8,
  });

  const lines: string[] = [];
  lines.push(`## Unify Ascend — Week of ${fmtDate(weekStart)} to ${fmtDate(weekEnd)}`);
  lines.push('');
  lines.push('### What we worked on');
  if (byTask.size === 0) {
    lines.push('- No hours were logged this week.');
  } else {
    for (const { task, lines: contrib } of byTask.values()) {
      const labels = [task.bucket, task.initiative].filter(Boolean).join(' / ');
      lines.push(`- ${task.title} — for ${task.requestedBy} (${labels}, ${task.priority}) [${dueLabel(task)}]`);
      lines.push(...contrib);
    }
  }
  lines.push('');
  lines.push('### Highlights');
  lines.push(`- ${completedCount} task${completedCount === 1 ? '' : 's'} completed this week`);
  lines.push(`- ${newTaskCount} new task${newTaskCount === 1 ? '' : 's'} received`);
  lines.push(`- ${Math.round(totalHours * 10) / 10} total hours logged across ${contributors} team member${contributors === 1 ? '' : 's'}`);
  if (topInitiative) {
    lines.push(`- Top initiative: ${topInitiative[0]} (${Math.round(topInitiative[1] * 10) / 10} hrs)`);
  }
  lines.push('');
  lines.push('### Coming up');
  if (upcoming.length === 0) {
    lines.push('- No open tasks.');
  } else {
    for (const t of upcoming) {
      lines.push(
        `- ${t.title} — for ${t.requestedBy}, ${t.isWip ? 'WIP' : t.estimatedDueDate ? `due: ${fmtDay(t.estimatedDueDate)}` : 'no date'}, priority: ${t.priority}`,
      );
    }
  }

  const content = lines.join('\n');
  return prisma.weeklyBriefing.create({
    data: { weekStart, weekEnd, content },
  });
}

/** Sends a stored briefing over the selected channels and updates its flags. */
export async function sendBriefing(id: string, viaEmail: boolean, viaTeams: boolean) {
  const briefing = await prisma.weeklyBriefing.findUnique({ where: { id } });
  if (!briefing) {
    throw Object.assign(new Error('Briefing not found'), { status: 404, expose: true });
  }

  const settings = await getSettings();
  let sentViaEmail = briefing.sentViaEmail;
  let sentViaTeams = briefing.sentViaTeams;

  if (viaEmail) {
    const list = settings.briefingDistributionList
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (list.length === 0) {
      throw Object.assign(
        new Error('The briefing distribution list is empty. Add recipients in Settings.'),
        { status: 400, expose: true },
      );
    }
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:680px;">${marked.parse(briefing.content)}</div>`;
    await sendEmail(list, `[Ascend Hub] Weekly briefing — ${fmtDate(briefing.weekStart)}`, html);
    sentViaEmail = true;
  }

  if (viaTeams) {
    await sendTeamsMessage(briefing.content);
    sentViaTeams = true;
  }

  return prisma.weeklyBriefing.update({
    where: { id },
    data: { sentViaEmail, sentViaTeams, sentAt: new Date() },
  });
}
