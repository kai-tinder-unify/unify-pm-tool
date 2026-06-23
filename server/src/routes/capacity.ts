import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler, httpError } from '../middleware/auth';

const router = Router();

// The three valid self-reported engagement levels. Mirrors the Prisma
// CapacityLevel enum; used to validate the POST body without importing the
// generated enum (which is a type-only export under isolatedModules).
const LEVELS = ['low', 'medium', 'high'] as const;
type Level = (typeof LEVELS)[number];

/**
 * Normalize an arbitrary date to the Monday 00:00 UTC of the week it falls in.
 *
 * weekStart is the stable key we group weekly capacity ratings by, so every
 * read/write must collapse to the same canonical instant regardless of the time
 * (or timezone offset) of the input. We work purely in UTC: take the UTC weekday
 * (0=Sun..6=Sat), shift back to Monday (treating Sunday as 7 so it maps to the
 * Monday six days earlier, matching an ISO week), then zero the time.
 *
 * @param input - any Date (e.g. parsed from a YYYY-MM-DD query param, or `now`)
 * @returns a Date at Monday 00:00:00.000 UTC of that week
 */
function mondayOfWeekUTC(input: Date): Date {
  const d = new Date(input.getTime());
  const day = d.getUTCDay(); // 0 = Sunday … 6 = Saturday
  // How many days back to the Monday: Sunday (0) is 6 days after Monday, every
  // other day is (day - 1) days after Monday.
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Resolve the `weekStart` query/body value to a canonical Monday-of-week Date.
 * Accepts an optional "YYYY-MM-DD" (or any Date-parseable) string; when absent or
 * unparseable we fall back to the current week so the common "this week" call needs
 * no params. Parsing a date-only string yields UTC midnight, so the Monday math
 * stays timezone-independent.
 *
 * @param raw - the incoming weekStart value (string | undefined)
 * @returns the Monday 00:00 UTC for the requested (or current) week
 */
function resolveWeekStart(raw: unknown): Date {
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return mondayOfWeekUTC(parsed);
  }
  return mondayOfWeekUTC(new Date());
}

/**
 * GET /api/capacity?weekStart=YYYY-MM-DD
 * Returns every user's WeeklyCapacity row for the requested week (defaults to the
 * current week). The page joins these against the full user list client-side, so a
 * user with no rating simply has no row here ("not set"). Each row carries the
 * user's id/name for display without a second lookup.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const weekStart = resolveWeekStart(req.query.weekStart);
    // Admins get the whole team's ratings (the team capacity view); members get only
    // their own row — they see just their own box, and we don't ship other people's
    // self-reported engagement levels to a non-admin browser.
    const isAdmin = req.user!.role === 'admin';
    const rows = await prisma.weeklyCapacity.findMany({
      where: { weekStart, ...(isAdmin ? {} : { userId: req.user!.id }) },
      include: { user: { select: { id: true, name: true } } },
    });
    // Echo back the resolved (canonical) weekStart so the client can confirm which
    // week it is actually looking at, even when it sent no param.
    res.json({ weekStart: weekStart.toISOString(), ratings: rows });
  }),
);

/**
 * POST /api/capacity  { weekStart?, level }
 * Upserts the CURRENT user's engagement level for the given week (defaults to the
 * current week). Unique on (userId, weekStart) means re-posting overwrites the
 * existing rating instead of creating a duplicate. We always use req.user — a
 * person can only set their own rating.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { level, weekStart: rawWeek } = req.body || {};
    // Validate the level against the allowed enum values before touching the DB so
    // a bad client sends back a clear 400 rather than a Prisma error.
    if (!LEVELS.includes(level as Level)) {
      throw httpError(400, `level must be one of: ${LEVELS.join(', ')}`);
    }
    const weekStart = resolveWeekStart(rawWeek);
    const userId = req.user!.id;

    const saved = await prisma.weeklyCapacity.upsert({
      // The composite-unique selector Prisma generates for @@unique([userId, weekStart]).
      where: { userId_weekStart: { userId, weekStart } },
      update: { level: level as Level },
      create: { userId, weekStart, level: level as Level },
      include: { user: { select: { id: true, name: true } } },
    });
    res.json(saved);
  }),
);

export default router;
