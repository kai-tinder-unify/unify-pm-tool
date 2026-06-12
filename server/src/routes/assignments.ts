import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, requireAdmin, httpError } from '../middleware/auth';

const router = Router();

/** Members may edit only their own assignment; admins may edit any. */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const assignment = await prisma.taskAssignment.findUnique({ where: { id: req.params.id } });
    if (!assignment) throw httpError(404, 'Assignment not found');
    if (req.user!.role !== 'admin' && assignment.userId !== req.user!.id) {
      throw httpError(403, 'You can only edit your own logged hours');
    }

    const { startDate, endDate, hoursLogged, notes } = req.body || {};
    const data: any = {};
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (hoursLogged !== undefined) {
      const hours = Number(hoursLogged);
      if (Number.isNaN(hours) || hours < 0) throw httpError(400, 'Hours must be a non-negative number');
      data.hoursLogged = hours;
    }
    if (notes !== undefined) data.notes = notes ? String(notes) : null;

    const updated = await prisma.taskAssignment.update({
      where: { id: assignment.id },
      data,
      include: { user: { select: { id: true, name: true } } },
    });
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.taskAssignment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

export default router;
