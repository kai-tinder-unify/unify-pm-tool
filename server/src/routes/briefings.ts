import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, httpError } from '../middleware/auth';
import { generateBriefing } from '../services/briefing';

const router = Router();

// Briefings are personal: a user only ever sees and generates their own. Every handler
// scopes to req.user.id — there is no team-wide or admin-wide briefing view.

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const briefings = await prisma.weeklyBriefing.findMany({
      where: { userId: req.user!.id },
      orderBy: { generatedAt: 'desc' },
    });
    res.json(briefings);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const briefing = await prisma.weeklyBriefing.findUnique({ where: { id: req.params.id } });
    // 404 (not 403) when it isn't theirs, so we don't even confirm another user's
    // briefing exists.
    if (!briefing || briefing.userId !== req.user!.id) throw httpError(404, 'Briefing not found');
    res.json(briefing);
  }),
);

router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    // Any authenticated user generates their OWN briefing. Optional date range:
    // `from`/`to` are YYYY-MM-DD; built in UTC so the stored/displayed range matches
    // the calendar dates picked. `to` extends to end-of-day. Omitting either falls back
    // to the trailing 7 days.
    const { from, to } = req.body || {};
    let start: Date | undefined;
    let end: Date | undefined;
    if (from) start = new Date(`${String(from)}T00:00:00.000Z`);
    if (to) end = new Date(`${String(to)}T23:59:59.999Z`);
    const briefing = await generateBriefing(req.user!.id, start, end);
    res.status(201).json(briefing);
  }),
);

export default router;
