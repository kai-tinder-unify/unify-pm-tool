import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { asyncHandler, requireAuth } from '../middleware/auth';

const router = Router();

function publicUser(u: { id: string; name: string; email: string; role: string; isActive: boolean; pingTime: string | null }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, pingTime: u.pingTime };
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  }),
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ascend.sid');
    res.json({ ok: true });
  });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user!) });
  }),
);

export default router;
