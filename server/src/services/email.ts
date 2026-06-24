import nodemailer from 'nodemailer';
import { getSettings } from './settings';

/** Builds a transport from AppSetting (preferred) with env-var fallback. */
async function getTransport() {
  const settings = await getSettings();
  const host = settings.smtpHost;
  if (!host) {
    throw Object.assign(new Error('SMTP is not configured. Set the SMTP host in Settings.'), {
      status: 400,
      expose: true,
    });
  }
  const port = Number(settings.smtpPort || 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass } : undefined,
  });
  return { transport, from: settings.smtpFrom };
}

export async function sendEmail(to: string | string[], subject: string, html: string) {
  const { transport, from } = await getTransport();
  await transport.sendMail({ from, to, subject, html });
}

export async function sendTestEmail(to: string) {
  await sendEmail(
    to,
    '[Ascend Command Center] Test email',
    '<p>This is a test email from <strong>Unify Ascend Command Center</strong>. Your SMTP configuration works.</p>',
  );
}
