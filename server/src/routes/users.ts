import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { asyncHandler, requireAdmin, httpError } from '../middleware/auth';

const router = Router();

const PING_TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  pingTime: true,
  createdAt: true,
} as const;

/** All authenticated users may list users (needed for assignment dropdowns). */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ select: publicSelect, orderBy: { name: 'asc' } });
    res.json(users);
  }),
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, email, password, role, pingTime } = req.body || {};
    if (!name || !email || !password) throw httpError(400, 'Name, email, and password are required');
    if (pingTime && !PING_TIME_RE.test(pingTime)) throw httpError(400, 'Ping time must be HH:mm');
    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (existing) throw httpError(409, 'A user with that email already exists');

    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        passwordHash: await bcrypt.hash(String(password), 10),
        role: role === 'admin' ? 'admin' : 'member',
        pingTime: pingTime || null,
      },
      select: publicSelect,
    });
    res.status(201).json(user);
  }),
);

/** Admin: edit anyone (incl. role/isActive). Member: own profile only (name/email/pingTime/password). */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const isAdmin = req.user!.role === 'admin';
    const isSelf = req.user!.id === req.params.id;
    if (!isAdmin && !isSelf) throw httpError(403, 'You can only edit your own profile');

    const { name, email, role, isActive, pingTime, password, currentPassword } = req.body || {};
    if (pingTime && !PING_TIME_RE.test(pingTime)) throw httpError(400, 'Ping time must be HH:mm');
    if ((role !== undefined || isActive !== undefined) && !isAdmin) {
      throw httpError(403, 'Only admins can change role or active status');
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw httpError(404, 'User not found');

    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (email !== undefined) {
      const newEmail = String(email).toLowerCase().trim();
      if (newEmail !== target.email) {
        const dup = await prisma.user.findUnique({ where: { email: newEmail } });
        if (dup) throw httpError(409, 'A user with that email already exists');
      }
      data.email = newEmail;
    }
    if (pingTime !== undefined) data.pingTime = pingTime || null;
    if (isAdmin && role !== undefined) data.role = role === 'admin' ? 'admin' : 'member';
    if (isAdmin && isActive !== undefined) data.isActive = Boolean(isActive);

    if (password) {
      // Changing your own password requires the current one; admins may reset others directly
      if (isSelf) {
        if (!currentPassword || !(await bcrypt.compare(String(currentPassword), target.passwordHash))) {
          throw httpError(400, 'Current password is incorrect');
        }
      }
      data.passwordHash = await bcrypt.hash(String(password), 10);
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: publicSelect });
    res.json(user);
  }),
);

export default router;
