import { getSettings } from './settings';

/** Adaptive Card content object — loosely typed; the notification builders produce these. */
export type AdaptiveCard = Record<string, unknown>;

/**
 * Low-level POST of an arbitrary JSON payload to a Teams webhook.
 * The webhook is a Power Automate "Workflows" URL (the replacement for the retired
 * Office 365 Incoming Webhook connector); it accepts both the simple `{ text }` shape
 * and the Adaptive Card message envelope.
 *
 * @param payload  The JSON body to post (text message or Adaptive Card envelope).
 * @param url      The target webhook. Optional — when omitted we fall back to the
 *                 default channel (settings.teamsWebhookUrl). Per-category callers
 *                 (notifications.ts) resolve their own URL and pass it in explicitly.
 */
export async function postToTeams(payload: unknown, url?: string) {
  // Resolve the default channel only when the caller did not pin a specific webhook.
  // This keeps single-channel callers (the briefing, the test message) working
  // unchanged while letting the per-category notifications target their own channel.
  const target = url ?? (await getSettings()).teamsWebhookUrl;
  if (!target) {
    throw Object.assign(new Error('Teams webhook is not configured. Set it in Settings.'), {
      status: 400,
      expose: true,
    });
  }
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Teams webhook rejected the message (HTTP ${res.status}).`), {
      status: 502,
      expose: true,
    });
  }
}

/**
 * Posts a simple text message (used by the weekly briefing).
 * @param url Optional target webhook; defaults to the configured default channel.
 */
export async function sendTeamsMessage(text: string, url?: string) {
  await postToTeams({ text }, url);
}

/**
 * Posts an Adaptive Card wrapped in the Teams message envelope.
 * @param url The target webhook URL. Resolved by the caller (notifications.ts) so a
 *            category card can be routed to its own channel; falls back to the default
 *            channel inside postToTeams when omitted.
 */
export async function sendTeamsCard(card: AdaptiveCard, url?: string) {
  await postToTeams(
    {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card,
        },
      ],
    },
    url,
  );
}

/**
 * Sends a verification message to every configured Teams channel. The default
 * single-channel webhook was retired in favor of the per-category webhooks
 * (manual pings / daily digest), so the test posts to whichever of those are
 * set — deduped, since several categories can legitimately point at the same channel.
 * Throws (expose:true) when none are configured so the admin who clicked "Send test
 * message" gets clear feedback rather than a silent no-op.
 */
export async function sendTestTeamsMessage() {
  const settings = await getSettings();
  const configured = [
    settings.teamsWebhookPings,
    settings.teamsWebhookDaily,
    settings.teamsWebhookTaskCreated,
  ]
    .map((u) => u.trim())
    .filter(Boolean);
  const unique = [...new Set(configured)];
  if (unique.length === 0) {
    throw Object.assign(
      new Error('No Teams channel webhook is configured. Add at least one in Settings.'),
      { status: 400, expose: true },
    );
  }
  const text =
    '✅ Test message from **Unify Ascend Command Center** — your Teams webhook is configured correctly.';
  // Post to each distinct channel so the admin sees the test land everywhere it should.
  for (const url of unique) {
    await sendTeamsMessage(text, url);
  }
}
