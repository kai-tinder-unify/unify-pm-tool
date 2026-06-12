import { Router } from 'express';
import { asyncHandler, requireAdmin } from '../middleware/auth';
import { sendCheckIns } from '../services/checkin';

const router = Router();

/** Manual "send pings now" — admin only. */
router.post(
  '/send',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const results = await sendCheckIns();
    res.json({ results });
  }),
);

export default router;
