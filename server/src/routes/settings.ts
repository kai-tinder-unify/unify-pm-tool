import { Router } from 'express';
import { asyncHandler, requireAdmin, httpError } from '../middleware/auth';
import { getSettings, setSetting, SETTING_KEYS, SettingKey } from '../services/settings';
import { sendTestEmail } from '../services/email';
import { sendTestTeamsMessage } from '../services/teams';

const router = Router();

/**
 * Buckets and initiatives must be readable by all members (dropdowns everywhere);
 * the rest of the settings are admin-only.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    if (req.user!.role !== 'admin') {
      return res.json({ buckets: settings.buckets, initiatives: settings.initiatives });
    }
    // Never expose the SMTP password value itself, just whether it is set
    const { smtpPass, ...rest } = settings;
    res.json({ ...rest, smtpPassSet: Boolean(smtpPass) });
  }),
);

router.put(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    for (const [key, value] of Object.entries(body)) {
      if (!(SETTING_KEYS as readonly string[]).includes(key)) {
        throw httpError(400, `Unknown setting: ${key}`);
      }
      await setSetting(key as SettingKey, String(value));
    }
    const settings = await getSettings();
    const { smtpPass, ...rest } = settings;
    res.json({ ...rest, smtpPassSet: Boolean(smtpPass) });
  }),
);

router.post(
  '/test-email',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const to = req.body?.to || req.user!.email;
    await sendTestEmail(String(to));
    res.json({ ok: true, message: `Test email sent to ${to}` });
  }),
);

router.post(
  '/test-teams',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    await sendTestTeamsMessage();
    res.json({ ok: true, message: 'Test message sent to Teams' });
  }),
);

export default router;
