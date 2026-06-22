// ─────────────────────────────────────────────────────────────────────────────
// Calendar-quarter helpers.
//
// "Quarter" here means a *calendar* quarter, not a fiscal one:
//   Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
//
// These power the Closed board column (only show work closed in the current
// quarter, to keep it bounded) and the Closed-tasks reporting view (filter/group
// closed work by quarter). All math is done in LOCAL time on purpose: a quarter
// is a human-facing reporting bucket, so "which quarter did this close in" should
// match the viewer's wall clock rather than UTC. closedAt is a true timestamp
// (not a calendar-day-at-UTC-midnight value), so local interpretation is correct.
// ─────────────────────────────────────────────────────────────────────────────

/** A resolved calendar quarter: its number (1–4), its year, and a display label. */
export interface Quarter {
  q: 1 | 2 | 3 | 4;
  year: number;
  /** Human label, e.g. "Q2 2026". */
  label: string;
}

/**
 * Resolve the calendar quarter a date falls in.
 *
 * @param dateISO - An ISO date/timestamp string (e.g. a task's closedAt). A bare
 *   `Date` is also accepted for convenience.
 * @returns The { q, year, label } the date belongs to, computed in local time.
 *
 * Math: months are 0-indexed by the Date API (Jan = 0 … Dec = 11), so
 * `floor(month / 3)` maps 0–2→0, 3–5→1, 6–8→2, 9–11→3; +1 shifts that to the
 * 1–4 quarter number.
 */
export function quarterOf(dateISO: string | Date): Quarter {
  const d = dateISO instanceof Date ? dateISO : new Date(dateISO);
  const q = (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  const year = d.getFullYear();
  return { q, year, label: `Q${q} ${year}` };
}

/**
 * The calendar quarter that contains "now" (local time). Used as the default
 * window for the Closed board column and the default selection in the report.
 */
export function currentQuarter(): Quarter {
  return quarterOf(new Date());
}

/**
 * The half-open-ish date span of a given quarter, as concrete Date objects.
 *
 * @param q - Quarter number 1–4.
 * @param year - Full calendar year (e.g. 2026).
 * @returns `{ start, end }` where `start` is local midnight on the first day of
 *   the quarter and `end` is the last millisecond (23:59:59.999) of its last day.
 *   `end` is built as "local midnight of the first day of the *next* quarter,
 *   minus 1 ms" so it always lands on the true final instant of the quarter
 *   regardless of month length — then callers can test membership with a simple
 *   inclusive `start <= t && t <= end` range.
 *
 * The first month of quarter `q` is `(q - 1) * 3` (0-indexed): Q1→0 (Jan),
 * Q2→3 (Apr), Q3→6 (Jul), Q4→9 (Oct). The next quarter's first month is that
 * + 3; passing month 12 to `new Date(year, 12, 1)` correctly rolls over to
 * January of `year + 1`, so Q4 needs no special-casing.
 */
export function quarterRange(q: number, year: number): { start: Date; end: Date } {
  const startMonth = (q - 1) * 3;
  const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
  // First instant of the following quarter, then step back 1 ms for an inclusive end.
  const end = new Date(year, startMonth + 3, 1, 0, 0, 0, 0);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start, end };
}
