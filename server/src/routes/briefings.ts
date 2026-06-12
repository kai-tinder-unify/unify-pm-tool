import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, requireAdmin, httpError } from '../middleware/auth';
import { generateBriefing, sendBriefing } from '../services/briefing';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const briefings = await prisma.weeklyBriefing.findMany({ orderBy: { generatedAt: 'desc' } });
    res.json(briefings);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const briefing = await prisma.weeklyBriefing.findUnique({ where: { id: req.params.id } });
    if (!briefing) throw httpError(404, 'Briefing not found');
    res.json(briefing);
  }),
);

router.post(
  '/generate',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const briefing = await generateBriefing();
    res.status(201).json(briefing);
  }),
);

router.post(
  '/:id/send',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { viaEmail, viaTeams } = req.body || {};
    if (!viaEmail && !viaTeams) throw httpError(400, 'Select at least one channel');
    const briefing = await sendBriefing(req.params.id, Boolean(viaEmail), Boolean(viaTeams));
    res.json(briefing);
  }),
);

export default router;
