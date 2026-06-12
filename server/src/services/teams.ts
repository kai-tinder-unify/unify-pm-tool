import { getSettings } from './settings';

/** Posts a simple text card to the configured Teams incoming webhook. */
export async function sendTeamsMessage(text: string) {
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
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Teams webhook rejected the message (HTTP ${res.status}).`), {
      status: 502,
      expose: true,
    });
  }
}

export async function sendTestTeamsMessage() {
  await sendTeamsMessage(
    '✅ Test message from **Unify Ascend Task Hub** — your Teams webhook is configured correctly.',
  );
}
