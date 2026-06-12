import { prisma } from '../prisma';
import { sendEmail } from './email';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

/**
 * Sends consolidated daily check-in emails.
 * - `userIds` limits the run (scheduler passes users whose ping time matched);
 *   omit for a manual "send pings now" run covering everyone eligible.
 * - Skips deactivated users, users with no active in-progress assignments,
 *   and users pinged within the past 20 hours (double-fire guard).
 * Returns a summary of what was sent.
 */
export async function sendCheckIns(userIds?: string[]) {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(userIds ? { id: { in: userIds } } : {}),
    },
  });

  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const results: { user: string; sent: boolean; reason?: string; taskCount?: number }[] = [];

  for (const user of users) {
    const recent = await prisma.checkIn.findFirst({
      where: { userId: user.id, sentAt: { gte: cutoff } },
    });
    if (recent) {
      results.push({ user: user.name, sent: false, reason: 'Pinged within the past 20 hours' });
      continue;
    }

    // Active = in-progress task with an open assignment (no endDate) for this user
    const assignments = await prisma.taskAssignment.findMany({
      where: { userId: user.id, endDate: null, task: { status: 'in_progress' } },
      include: { task: true },
    });
    if (assignments.length === 0) {
      results.push({ user: user.name, sent: false, reason: 'No active task assignments' });
      continue;
    }

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    const rows = assignments
      .map((a) => {
        const days = Math.floor((Date.now() - a.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
        const lastLogged = days === 0 ? 'updated today' : `last update ${days} day${days === 1 ? '' : 's'} ago`;
        return `<li style="margin-bottom:8px;">
          <strong>${escapeHtml(a.task.title)}</strong> — for ${escapeHtml(a.task.requestedBy)}<br/>
          <span style="color:#667;">${escapeHtml(a.task.bucket)} · ${a.task.priority} priority · ${lastLogged}</span>
        </li>`;
      })
      .join('');

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;">
        <h2 style="color:#0A1628;">Good morning, ${escapeHtml(user.name.split(' ')[0])} 👋</h2>
        <p>Here are your active tasks for today:</p>
        <ul style="padding-left:20px;">${rows}</ul>
        <p><a href="${APP_URL}/my-work" style="background:#0078D4;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Open My Work</a></p>
        <p style="color:#667;font-size:13px;">Reply to this email with any updates, or click the link to log hours or change status.</p>
      </div>`;

    try {
      await sendEmail(user.email, `[Ascend Hub] Daily check-in — ${today}`, html);
      // One CheckIn row per task referenced, even though the email is consolidated
      await prisma.checkIn.createMany({
        data: assignments.map((a) => ({ taskId: a.taskId, userId: user.id, channel: 'email' })),
      });
      results.push({ user: user.name, sent: true, taskCount: assignments.length });
    } catch (err: any) {
      results.push({ user: user.name, sent: false, reason: err.message || 'Email send failed' });
    }
  }

  return results;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
