import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import type { User } from '@prisma/client';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Loads the session user onto req.user; 401 if not logged in or deactivated. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      req.session.destroy(() => undefined);
      return res.status(401).json({ error: 'Not authenticated' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Must be used after requireAuth. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/** Wraps async route handlers so rejections hit the central error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Error with a safe, user-visible message. */
export function httpError(status: number, message: string) {
  const err = new Error(message) as Error & { status: number; expose: boolean };
  err.status = status;
  err.expose = true;
  return err;
}
