import cron from 'node-cron';
import { prisma } from '../prisma';
import { getSettings } from './settings';
import { sendCheckIns } from './checkin';
import { generateBriefing } from './briefing';

const TZ = process.env.SCHEDULER_TIMEZONE || 'America/Los_Angeles';

/** "HH:mm" for now in the scheduler timezone. */
function nowHHmm(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function nowWeekday(): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' })
    .format(new Date())
    .toLowerCase();
}

/** Minutes since midnight for an "HH:mm" string; NaN if malformed. */
function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** True when `target` falls within the 15-minute window ending at `now`. */
function inWindow(target: string, now: string, windowMinutes = 15): boolean {
  const t = toMinutes(target);
  const n = toMinutes(now);
  if (Number.isNaN(t) || Number.isNaN(n)) return false;
  const diff = n - t;
  return diff >= 0 && diff < windowMinutes;
}

let briefingLastRunDay: string | null = null;

export async function runSchedulerTick() {
  const settings = await getSettings();
  const now = nowHHmm();

  // --- Daily check-in pings ---
  if (settings.pingEnabled === 'true') {
    const users = await prisma.user.findMany({ where: { isActive: true } });
    const due = users.filter((u) => inWindow(u.pingTime || settings.defaultPingTime, now));
    if (due.length > 0) {
      const results = await sendCheckIns(due.map((u) => u.id));
      const sent = results.filter((r) => r.sent);
      if (sent.length > 0) {
        console.log(`[scheduler] Sent check-in pings to: ${sent.map((r) => r.user).join(', ')}`);
      }
    }
  }

  // --- Weekly briefing ---
  if (settings.briefingEnabled === 'true') {
    const today = nowWeekday();
    const dayKey = `${today}-${new Date().toDateString()}`;
    if (
      today === settings.briefingDay.toLowerCase() &&
      inWindow(settings.briefingTime, now) &&
      briefingLastRunDay !== dayKey
    ) {
      briefingLastRunDay = dayKey;
      // Briefings are personal and in-app only. Auto-generate a trailing-7-days briefing
      // for each ACTIVE user who logged/updated hours in the past week, so everyone with
      // recent activity gets a fresh one without having to remember. Users with no
      // activity get nothing (no empty briefings); they can still generate on demand.
      console.log('[scheduler] Generating weekly per-person briefings...');
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recent = await prisma.taskAssignment.findMany({
        where: { updatedAt: { gte: weekAgo }, user: { isActive: true } },
        select: { userId: true },
        distinct: ['userId'],
      });
      for (const { userId } of recent) {
        await generateBriefing(userId);
      }
      console.log(`[scheduler] Generated ${recent.length} weekly briefing(s).`);
    }
  }
}

/** Single cron job every 15 minutes; all schedule config is read from AppSetting at runtime. */
export function startScheduler() {
  cron.schedule(
    '*/15 * * * *',
    () => {
      runSchedulerTick().catch((err) => console.error('[scheduler] Tick failed:', err));
    },
    { timezone: TZ },
  );
  console.log(`[scheduler] Started (every 15 minutes, timezone ${TZ})`);
}
