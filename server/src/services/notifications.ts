import { sendTeamsCard, type AdaptiveCard } from './teams';
import { getSettings, type SettingKey } from './settings';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

/**
 * Teams notification events.
 *
 * To add a new event type:
 *   1. add a variant to this union,
 *   2. add a matching builder to BUILDERS and a toggle key to ENABLED_BY
 *      (TypeScript will flag both until you do),
 *   3. register that toggle key in services/settings.ts (SETTING_KEYS + DEFAULTS),
 *   4. call notifyTeams({ type: 'your_event', ... }) wherever the event happens.
 *
 * `email` fields carry the person's UPN so the card can @mention them (a real
 * activity-feed ping). Pass null to fall back to plain text.
 */
export type TeamsEvent =
  | {
      type: 'daily_checkin';
      date: string;
      people: {
        name: string;
        email: string | null;
        tasks: { title: string; requestedBy: string; priority: string }[];
      }[];
    }
  | {
      type: 'task_assigned';
      task: { id: string; title: string; bucket: string; priority: string; requestedBy: string };
      assignee: string;
      assigneeEmail: string | null;
    };

type EventType = TeamsEvent['type'];

/** The setting that must be 'true' for each event to post. */
const ENABLED_BY: Record<EventType, SettingKey> = {
  daily_checkin: 'teamsPingEnabled',
  task_assigned: 'teamsTaskAssignedEnabled',
};

/** The Adaptive Card builder for each event. */
const BUILDERS: { [K in EventType]: (e: Extract<TeamsEvent, { type: K }>) => AdaptiveCard } = {
  daily_checkin: (e) => {
    const entities: Mention[] = [];
    const body: unknown[] = [
      heading(`🗓️ Daily check-in — ${e.date}`),
      textBlock(
        `${e.people.length} team member${e.people.length === 1 ? '' : 's'} with active work today.`,
        { isSubtle: true, wrap: true },
      ),
    ];
    for (const p of e.people) {
      body.push(textBlock(mentionOrName(p.name, p.email, entities), { wrap: true, spacing: 'Medium', separator: true }));
      for (const t of p.tasks) {
        body.push(textBlock(`• ${t.title} — for ${t.requestedBy} (${t.priority} priority)`, { wrap: true, spacing: 'None' }));
      }
    }
    return card(body, [openButton('Open My Work', `${APP_URL}/my-work`)], entities);
  },

  task_assigned: (e) => {
    const entities: Mention[] = [];
    const who = mentionOrName(e.assignee, e.assigneeEmail, entities);
    return card(
      [
        heading('📌 Task assigned'),
        textBlock(`${who} is now the owner of **${e.task.title}**.`, { wrap: true }),
        facts([
          ['Requested by', e.task.requestedBy],
          ['Bucket', e.task.bucket],
          ['Priority', e.task.priority],
        ]),
      ],
      [openButton('Open task', `${APP_URL}/tasks/${e.task.id}`)],
      entities,
    );
  },
};

/**
 * Fire-and-forget Teams notification. Returns true if a card was posted.
 *
 * Never throws: a missing webhook, a disabled toggle, or a webhook failure are all
 * swallowed (and logged) so a Teams problem can never break the action that triggered it.
 */
export async function notifyTeams(event: TeamsEvent): Promise<boolean> {
  try {
    const settings = await getSettings();
    if (settings[ENABLED_BY[event.type]] !== 'true') return false;
    if (!settings.teamsWebhookUrl) return false;
    const build = BUILDERS[event.type] as unknown as (e: TeamsEvent) => AdaptiveCard;
    await sendTeamsCard(build(event));
    return true;
  } catch (err) {
    console.error(`[teams] Failed to post '${event.type}' notification:`, err);
    return false;
  }
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

function openButton(title: string, url: string) {
  return { type: 'Action.OpenUrl', title, url };
}
