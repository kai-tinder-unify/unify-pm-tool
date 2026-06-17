import { prisma } from '../prisma';

export const SETTING_KEYS = [
  'buckets',
  'initiatives',
  'defaultPingTime',
  'pingEnabled',
  'briefingDay',
  'briefingTime',
  'briefingEnabled',
  'smtpHost',
  'smtpPort',
  'smtpUser',
  'smtpPass',
  'smtpFrom',
  'teamsWebhookUrl',
  'teamsPingEnabled',
  'teamsTaskJoinedEnabled',
  'briefingDistributionList',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

const DEFAULTS: Record<SettingKey, string> = {
  buckets: JSON.stringify([
    'Proposal/Delivery Support',
    'Internal Operations Support',
    'Business Development Support',
  ]),
  initiatives: JSON.stringify([
    'Artificial Intelligence Management Consulting Firm of Choice',
    'All In for Unify',
    'Account Intelligence & Excellence',
    'Alliance Investment',
  ]),
  defaultPingTime: '08:00',
  pingEnabled: 'true',
  briefingDay: 'friday',
  briefingTime: '16:00',
  briefingEnabled: 'true',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: process.env.SMTP_PORT || '587',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'Ascend Hub <noreply@unifyconsulting.com>',
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
  teamsPingEnabled: 'false',
  teamsTaskJoinedEnabled: 'false',
  briefingDistributionList: '',
};

/** Returns all settings, with env/defaults filling gaps for unset keys. */
export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.appSetting.findMany();
  const map = { ...DEFAULTS };
  for (const row of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key) && row.value !== '') {
      map[row.key as SettingKey] = row.value;
    }
  }
  return map;
}

export async function setSetting(key: SettingKey, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export function parseList(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
