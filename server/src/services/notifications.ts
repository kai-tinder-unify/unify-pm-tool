import { sendTeamsCard, type AdaptiveCard } from './teams';
import { getSettings, type SettingKey } from './settings';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

/**
 * Teams notification events.
 *
 * To add a new event type:
 *   1. add a variant to this union,
 *   2. add a matching builder to BUILDERS and a toggle key to ENABLED_BY
 *      (null = no toggle, always sent when a webhook is configured),
 *   3. add its channel to WEBHOOK_BY (which category webhook it posts to),
 *   4. register any new keys in services/settings.ts (SETTING_KEYS + DEFAULTS),
 *   5. call notifyTeams(...) (auto, fire-and-forget) or sendTeamsEvent(...) (manual,
 *      throws on failure) wherever the event happens.
 *
 * `email`/`*Email` fields carry the person's UPN so the card can @mention them (a real
 * activity-feed ping). Pass null to fall back to plain text.
 */
export type TeamsEvent =
  | {
      type: 'daily_checkin';
      date: string;
      // One card per person: the recipient and just their own active tasks.
      person: { name: string; email: string | null };
      tasks: { title: string; requestedBy: string; priority: string }[];
    }
  | {
      type: 'task_ping';
      task: { id: string; title: string; bucket: string; priority: string; requestedBy: string };
      recipients: { name: string; email: string | null }[];
      pingedBy: string;
    };

type EventType = TeamsEvent['type'];

/** Setting that must be 'true' for each event to post; null = always (manual actions). */
const ENABLED_BY: Record<EventType, SettingKey | null> = {
  daily_checkin: 'teamsPingEnabled',
  task_ping: null,
};

/**
 * Per-event category webhook setting. Each event posts to its category's channel; a
 * blank value means that notification type is disabled. This is how the firm splits
 * the daily reminder and manual pings across separate Teams channels.
 */
const WEBHOOK_BY: Record<EventType, SettingKey> = {
  daily_checkin: 'teamsWebhookDaily',
  task_ping: 'teamsWebhookPings',
};

/** The Adaptive Card builder for each event. */
const BUILDERS: { [K in EventType]: (e: Extract<TeamsEvent, { type: K }>) => AdaptiveCard } = {
  daily_checkin: (e) => {
    const entities: Mention[] = [];
    const who = mentionOrName(e.person.name, e.person.email, entities);
    const lead =
      e.tasks.length === 1
        ? `${who} — here is your active task for today:`
        : `${who} — here are your ${e.tasks.length} active tasks for today:`;
    const body: unknown[] = [
      heading(`🗓️ Daily check-in — ${e.date}`),
      textBlock(lead, { wrap: true }),
      ...e.tasks.map((t) =>
        textBlock(`• ${t.title} — for ${t.requestedBy} (${titleCase(t.priority)} priority)`, {
          wrap: true,
          spacing: 'Small',
        }),
      ),
    ];
    return card(body, [openButton('Open My Work', `${APP_URL}/my-work`)], entities);
  },

  task_ping: (e) => {
    const entities: Mention[] = [];
    const mentions = e.recipients.map((r) => mentionOrName(r.name, r.email, entities)).join(' ');
    return card(
      [
        heading(`🔔 Ping — ${e.task.title}`),
        textBlock(`${mentions} — ${e.pingedBy} is nudging you on this task.`, { wrap: true }),
        facts([
          ['Requested by', e.task.requestedBy],
          ['Bucket', e.task.bucket],
          ['Priority', titleCase(e.task.priority)],
        ]),
      ],
      [openButton('Open task', `${APP_URL}/tasks/${e.task.id}`)],
      entities,
    );
  },
};

function buildCard(event: TeamsEvent): AdaptiveCard {
  const build = BUILDERS[event.type] as unknown as (e: TeamsEvent) => AdaptiveCard;
  return build(event);
}

/**
 * Fire-and-forget Teams notification. Returns true if a card was posted.
 *
 * Never throws: a missing webhook, a disabled toggle, or a webhook failure are all
 * swallowed (and logged) so a Teams problem can never break the action that triggered it.
 */
export async function notifyTeams(event: TeamsEvent): Promise<boolean> {
  try {
    const settings = await getSettings();
    const toggle = ENABLED_BY[event.type];
    if (toggle && settings[toggle] !== 'true') return false;
    // Route to this event's category channel. A blank category URL means this
    // notification is disabled, so we no-op (fire-and-forget: never throw).
    const url = settings[WEBHOOK_BY[event.type]];
    if (!url) return false;
    await sendTeamsCard(buildCard(event), url);
    return true;
  } catch (err) {
    console.error(`[teams] Failed to post '${event.type}' notification:`, err);
    return false;
  }
}

/**
 * Posts an event's card immediately, bypassing the per-event toggle, and throws on
 * failure. For manual admin actions (e.g. the per-task "Send ping" button) that need
 * real success/error feedback rather than fire-and-forget.
 */
export async function sendTeamsEvent(event: TeamsEvent): Promise<void> {
  const settings = await getSettings();
  // Same category→channel resolution as notifyTeams, but this is the manual path:
  // surface a clear error instead of silently no-opping when no channel is configured,
  // so the admin who clicked the button gets real feedback.
  const url = settings[WEBHOOK_BY[event.type]];
  if (!url) {
    throw Object.assign(new Error('Teams webhook is not configured. Set it in Settings.'), {
      status: 400,
      expose: true,
    });
  }
  await sendTeamsCard(buildCard(event), url);
}

// --- Adaptive Card building helpers ---

type Mention = { type: 'mention'; text: string; mentioned: { id: string; name: string } };

/**
 * Returns the text to drop into a card body. When a UPN/email is known, returns an
 * `<at>Name</at>` token and pushes the matching mention entity (Teams requires the
 * token text to match an entity, else the mention is ignored). Otherwise bold plain text.
 */
function mentionOrName(name: string, email: string | null, entities: Mention[]): string {
  if (!email) return `**${name}**`;
  const token = `<at>${name}</at>`;
  entities.push({ type: 'mention', text: token, mentioned: { id: email, name } });
  return token;
}

function card(body: unknown[], actions: unknown[] = [], mentions: Mention[] = []): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
    ...(actions.length ? { actions } : {}),
    ...(mentions.length ? { msteams: { entities: mentions } } : {}),
  };
}

function heading(text: string) {
  return { type: 'TextBlock', text, weight: 'Bolder', size: 'Medium', wrap: true };
}

function textBlock(text: string, opts: Record<string, unknown> = {}) {
  return { type: 'TextBlock', text, ...opts };
}

function facts(pairs: [string, string][]) {
  return { type: 'FactSet', facts: pairs.map(([title, value]) => ({ title, value })) };
}

/** 'medium' -> 'Medium' — enum values (e.g. priority) render lowercase otherwise. */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function openButton(title: string, url: string) {
  return { type: 'Action.OpenUrl', title, url };
}
