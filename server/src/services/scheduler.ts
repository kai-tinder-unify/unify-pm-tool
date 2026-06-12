import cron from 'node-cron';
import { prisma } from '../prisma';
import { getSettings } from './settings';
import { sendCheckIns } from './checkin';
import { generateBriefing, sendBriefing } from './briefing';

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
      console.log('[scheduler] Generating weekly briefing...');
      const briefing = await generateBriefing();
      try {
        const hasList = settings.briefingDistributionList.trim().length > 0;
        const hasTeams = settings.teamsWebhookUrl.trim().length > 0;
        if (hasList || hasTeams) {
          await sendBriefing(briefing.id, hasList, hasTeams);
          console.log('[scheduler] Weekly briefing sent.');
        } else {
          console.log('[scheduler] Briefing generated as draft (no delivery channels configured).');
        }
      } catch (err) {
        console.error('[scheduler] Briefing send failed:', err);
      }
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
