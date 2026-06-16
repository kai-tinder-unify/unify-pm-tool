import { getSettings } from './settings';

/** Adaptive Card content object — loosely typed; the notification builders produce these. */
export type AdaptiveCard = Record<string, unknown>;

/**
 * Low-level POST of an arbitrary JSON payload to the configured Teams webhook.
 * The webhook is a Power Automate "Workflows" URL (the replacement for the retired
 * Office 365 Incoming Webhook connector); it accepts both the simple `{ text }` shape
 * and the Adaptive Card message envelope.
 */
export async function postToTeams(payload: unknown) {
  const settings = await getSettings();
  const url = settings.teamsWebhookUrl;
  if (!url) {
    throw Object.assign(new Error('Teams webhook is not configured. Set it in Settings.'), {
      status: 400,
      expose: true,
    });
  }
  const res = await fetch(url, {
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

/** Posts a simple text message (used by the weekly briefing). */
export async function sendTeamsMessage(text: string) {
  await postToTeams({ text });
}

/** Posts an Adaptive Card wrapped in the Teams message envelope. */
export async function sendTeamsCard(card: AdaptiveCard) {
  await postToTeams({
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card,
      },
    ],
  });
}

export async function sendTestTeamsMessage() {
  await sendTeamsMessage(
    '✅ Test message from **Unify Ascend Task Hub** — your Teams webhook is configured correctly.',
  );
}
