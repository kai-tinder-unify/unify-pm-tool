import express from 'express';
import session from 'express-session';
import path from 'path';
import authRoutes from './routes/auth';
import taskRoutes from './routes/tasks';
import assignmentRoutes from './routes/assignments';
import analyticsRoutes from './routes/analytics';
import briefingRoutes from './routes/briefings';
import checkinRoutes from './routes/checkins';
import userRoutes from './routes/users';
import settingsRoutes from './routes/settings';
import { requireAuth } from './middleware/auth';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(
    session({
      name: 'ascend.sid',
      secret: process.env.SESSION_SECRET || 'dev-only-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/tasks', requireAuth, taskRoutes);
  app.use('/api/assignments', requireAuth, assignmentRoutes);
  app.use('/api/analytics', requireAuth, analyticsRoutes);
  app.use('/api/briefings', requireAuth, briefingRoutes);
  app.use('/api/checkins', requireAuth, checkinRoutes);
  app.use('/api/users', requireAuth, userRoutes);
  app.use('/api/settings', requireAuth, settingsRoutes);

  // Serve the built client in production
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // Central error handler — never leak stack traces to clients
  app.use(
    (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
      const status = err.status || 500;
      res.status(status).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
    },
  );

  return app;
}
