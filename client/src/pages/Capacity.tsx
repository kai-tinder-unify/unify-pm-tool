import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch, useUsers } from '../hooks';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner, ErrorNote, EmptyState } from '../components/ui';
import type { CapacityLevel, Settings, Task, User, WeeklyCapacity } from '../types';

// Shape of GET /api/capacity: the resolved (canonical) week plus every user's
// rating row for that week. Users with no rating simply have no entry in `ratings`.
interface CapacityResponse {
  weekStart: string;
  ratings: WeeklyCapacity[];
}

// The three engagement levels in ascending order, used both for the self-rating
// control and to label each person's current level.
const LEVELS: CapacityLevel[] = ['low', 'medium', 'high'];
const LEVEL_LABEL: Record<CapacityLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** Two-letter initials for the avatar chip (e.g. "Jane Smith" → "JS"). */
function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}

/** Safely parse a numeric setting string, falling back to `fallback` if missing/NaN. */
function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// One person's computed advisory capacity, ready to render.
interface Row {
  user: User;
  level: CapacityLevel | null; // null = hasn't set a level this week
  clientHours: number; // mapped from level; 0 when unset
  activeTasks: number; // count of non-closed tasks where they're an active contributor
}

export default function Capacity() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { users } = useUsers();
  const tasksReq = useFetch<Task[]>('/api/tasks');
  // No weekStart param → the server resolves to the current week (Monday UTC).
  const capacityReq = useFetch<CapacityResponse>('/api/capacity');
  const settingsReq = useFetch<Settings>('/api/settings');

  const [saving, setSaving] = useState<CapacityLevel | null>(null);

  // Level → client-hours mapping and the soft reference line, from settings (with
  // the documented defaults as fallbacks so the page renders even before settings load).
  const hoursFor = useMemo<Record<CapacityLevel, number>>(() => {
    const s = settingsReq.data;
    return {
      low: num(s?.capacityHoursLow, 30),
      medium: num(s?.capacityHoursMedium, 40),
      high: num(s?.capacityHoursHigh, 50),
    };
  }, [settingsReq.data]);

  const softTarget = num(settingsReq.data?.capacitySoftTargetHours, 40);

  // Active (non-closed) tasks. Subtasks come back nested on their parent, so we
  // flatten them in: a subtask is a normal Task a person can be a contributor on,
  // and must be counted toward that person's active-task load too.
  const activeTasks = useMemo<Task[]>(() => {
    const all: Task[] = [];
    for (const t of tasksReq.data || []) {
      all.push(t);
      // Guard: list shapes / older caches may omit `subtasks`.
      if (t.subtasks?.length) all.push(...t.subtasks);
    }
    // Advisory load only counts work that's still open.
    return all.filter((t) => t.status !== 'closed');
  }, [tasksReq.data]);

  // Quick lookup of each user's current-week level by userId.
  const levelByUser = useMemo<Map<string, CapacityLevel>>(() => {
    const m = new Map<string, CapacityLevel>();
    for (const r of capacityReq.data?.ratings || []) m.set(r.userId, r.level);
    return m;
  }, [capacityReq.data]);

  // Build one Row per user: their level (if set), the mapped client hours, and the
  // count of active tasks where they're still an active contributor (no endDate).
  const rows = useMemo<Row[]>(() => {
    return users.map((u) => {
      const level = levelByUser.get(u.id) ?? null;
      const onTasks = activeTasks.filter((t) =>
        t.assignments.some((a) => a.userId === u.id && !a.endDate),
      );
      return {
        user: u,
        level,
        // Unset level reads as 0 hours (and renders as "not set" rather than a bar).
        clientHours: level ? hoursFor[level] : 0,
        activeTasks: onTasks.length,
      };
    });
  }, [users, levelByUser, activeTasks, hoursFor]);

  // "Who has room" ranking: most room first = lowest client hours, then fewest
  // active tasks, then name for a stable tiebreak. Unset levels (0 hours) naturally
  // float to the top — they have the most apparent room until they self-report.
  const ranked = useMemo<Row[]>(
    () =>
      [...rows].sort(
        (a, b) =>
          a.clientHours - b.clientHours ||
          a.activeTasks - b.activeTasks ||
          a.user.name.localeCompare(b.user.name),
      ),
    [rows],
  );

  // My own current-week level, for the self-rating control's active state.
  const myLevel = me ? levelByUser.get(me.id) ?? null : null;

  /**
   * Set the logged-in user's engagement level for the current week, then reload the
   * capacity ratings so every derived view (bars, ranking, my control) updates.
   * @param level - the level the current user picked
   */
  const setMyLevel = async (level: CapacityLevel) => {
    setSaving(level);
    try {
      await api('/api/capacity', { method: 'POST', body: { level } });
      toast.success(`Your week is set to ${LEVEL_LABEL[level]}`);
      await capacityReq.reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  // Block on the two data sources the page can't render without. Settings has
  // built-in fallbacks, so we don't gate on it.
  if (tasksReq.loading || capacityReq.loading) return <Spinner />;
  if (tasksReq.error) return <ErrorNote message={tasksReq.error} />;
  if (capacityReq.error) return <ErrorNote message={capacityReq.error} />;

  const ratedCount = rows.filter((r) => r.level).length;
  const overCount = rows.filter((r) => r.clientHours > softTarget).length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">Capacity</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Self-reported client engagement against a soft {softTarget}h reference line — advisory only, to
          surface who has room.
        </p>
      </div>

      {/* My week — the logged-in user sets their own current-week engagement level. */}
      {me && (
        <div className="card-elevated p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">My week</h2>
              <p className="text-xs text-muted mt-1">
                How booked are you on client work this week?{' '}
                {myLevel ? (
                  <span className="text-ink">
                    Currently <span className="font-medium">{LEVEL_LABEL[myLevel]}</span> (~
                    {hoursFor[myLevel]}h).
                  </span>
                ) : (
                  <span className="text-warn">Not set yet.</span>
                )}
              </p>
            </div>
            {/* Segmented Low / Medium / High control; the active level reads as the
                navy primary action, the rest as ghost buttons. */}
            <div className="flex gap-2">
              {LEVELS.map((lvl) => {
                const isActive = myLevel === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => setMyLevel(lvl)}
                    disabled={saving !== null}
                    className={isActive ? 'btn-primary' : 'btn-secondary'}
                  >
                    {saving === lvl ? 'Saving…' : LEVEL_LABEL[lvl]}
                    <span className="ml-1 text-xs font-normal opacity-70 tabular-nums">
                      {hoursFor[lvl]}h
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Summary figures */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card px-5 py-4">
          {/* KPI figure: Fraunces display-figure (navy) on the light card. */}
          <div className="display-figure text-[26px] leading-none tabular-nums">
            {ratedCount}
            <span className="text-base text-muted"> / {rows.length}</span>
          </div>
          <div className="text-xs text-muted mt-2">People who set their week</div>
        </div>
        <div className="card px-5 py-4">
          <div className="display-figure text-[26px] leading-none tabular-nums">{activeTasks.length}</div>
          <div className="text-xs text-muted mt-2">Active tasks</div>
        </div>
        <div className="card px-5 py-4">
          {/* People over the soft line warrant a glance → danger figure when > 0. */}
          <div
            className={`display-figure text-[26px] leading-none tabular-nums ${
              overCount > 0 ? 'text-danger' : 'text-navy'
            }`}
          >
            {overCount}
          </div>
          <div className="text-xs text-muted mt-2">Over the {softTarget}h soft line</div>
        </div>
      </div>

      {/* Per-member client-hours view */}
      {rows.length === 0 ? (
        <EmptyState>No team members to show</EmptyState>
      ) : (
        <div className="space-y-2">
          {rows
            // Alphabetical roster — a stable, scannable list of everyone's load. The
            // ranked "who has room" ordering lives in its own section just below.
            .slice()
            .sort((a, b) => a.user.name.localeCompare(b.user.name))
            .map((r) => (
              <MemberCard key={r.user.id} row={r} softTarget={softTarget} />
            ))}
        </div>
      )}

      {/* "Who has room" ranked list — advisory, no auto-assignment. */}
      <section className="card p-5 space-y-3">
        <div>
          <h2 className="section-title">Who has room</h2>
          <p className="text-xs text-muted mt-1">
            Ranked by lowest client hours, then fewest active tasks. Advisory only — use it to start a
            conversation, not to auto-assign.
          </p>
        </div>
        {ranked.length === 0 ? (
          <EmptyState>No team members to rank</EmptyState>
        ) : (
          <ol className="space-y-1.5">
            {ranked.map((r, i) => (
              <li key={r.user.id} className="flex items-center gap-3 text-sm">
                {/* Rank number in mono so the column aligns. */}
                <span className="mono-meta w-5 text-right text-muted shrink-0">{i + 1}</span>
                <span className="w-7 h-7 shrink-0 rounded-full bg-aqua-light border border-line text-[10px] text-navy flex items-center justify-center font-medium">
                  {initials(r.user.name)}
                </span>
                <span className="font-medium text-ink truncate flex-1 min-w-0">{r.user.name}</span>
                {/* Level chip: neutral when unset, otherwise a calm aqua tint. */}
                {r.level ? (
                  <span className="pill bg-aqua-light text-aqua-text border-aqua/30 capitalize">
                    {LEVEL_LABEL[r.level]}
                  </span>
                ) : (
                  <span className="pill bg-paper-deep text-muted border-line">not set</span>
                )}
                <span className="mono-meta text-muted tabular-nums w-16 text-right shrink-0">
                  {r.level ? `${r.clientHours}h` : '—'}
                </span>
                <span className="mono-meta text-muted tabular-nums w-20 text-right shrink-0">
                  {r.activeTasks} task{r.activeTasks === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-xs text-slate-600">
        Client hours are a self-reported baseline (Low {hoursFor.low}h · Medium {hoursFor.medium}h · High{' '}
        {hoursFor.high}h), not a sum of task hours. Active-task counts include subtasks where a person is
        an active contributor. Manage assignments from each{' '}
        <Link to="/tasks" className="text-aqua-text hover:text-navy">
          task
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * One person's row: avatar, name, level chip, active-task pill, and a client-hours
 * bar measured against the soft target. The bar is green under the line, amber when
 * at/near it (within ~10%), and red when over — with the overflow amount always
 * shown and never capped (the fill width clamps at 100% only so it can't visually
 * overflow the track; the number tells the true story).
 *
 * @param row - the computed capacity row for this user
 * @param softTarget - the soft reference line in hours (e.g. 40)
 */
function MemberCard({ row, softTarget }: { row: Row; softTarget: number }) {
  const { user, level, clientHours, activeTasks } = row;
  const over = clientHours - softTarget; // positive when over the soft line

  // Color language: under (success/green), at-or-near within 10% of the line
  // (warn/amber), over (danger/red). Unset levels render no bar at all.
  let barClass = 'bg-success';
  let toneText = 'text-success';
  if (level) {
    if (over > 0) {
      barClass = 'bg-danger';
      toneText = 'text-danger';
    } else if (clientHours >= softTarget * 0.9) {
      barClass = 'bg-warn';
      toneText = 'text-warn';
    }
  }

  // Fill width as a fraction of the soft target, clamped to 100% so an over-line
  // value doesn't blow out the track. Overflow is communicated by the red tone and
  // the explicit "+Nh over" chip below, never by the bar length.
  const fillPct = level ? Math.min(100, (clientHours / softTarget) * 100) : 0;

  return (
    <div className="card p-4 flex items-center gap-4">
      <span className="w-9 h-9 shrink-0 rounded-full bg-aqua-light border border-line text-[11px] text-navy flex items-center justify-center font-medium">
        {initials(user.name)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-ink truncate">{user.name}</span>
            {user.role === 'admin' && (
              <span className="pill bg-aqua-light text-aqua-text border-aqua/30">Admin</span>
            )}
            {!level && (
              // Hasn't self-reported this week — neutral nudge chip.
              <span className="pill bg-paper-deep text-muted border-line">not set</span>
            )}
            {/* Active-task count pill — sits alongside the hours, since load is two
                signals (client hours AND how many tasks they're on). */}
            <span className="pill bg-aqua-light text-aqua-text border-aqua/30 tabular-nums">
              {activeTasks} task{activeTasks === 1 ? '' : 's'}
            </span>
          </div>
          {/* Client-hours figure, toned to match the bar. */}
          <span className={`text-lg font-semibold tabular-nums shrink-0 ${level ? toneText : 'text-muted'}`}>
            {level ? `${clientHours}h` : '—'}
          </span>
        </div>

        {/* Hours bar against the soft target. Recessed paper-deep well; fill tone
            tracks under/near/over. When unset, the track stays empty. */}
        <div className="mt-2 h-2 rounded-full bg-paper-deep overflow-hidden">
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${fillPct}%` }} />
        </div>

        <div className="mt-2 flex items-center gap-2 text-[11px]">
          {level && (
            <span className="mono-meta text-muted capitalize">
              {LEVEL_LABEL[level]} · soft line {softTarget}h
            </span>
          )}
          {/* Overflow is ALWAYS surfaced when over the line, never hidden/capped. */}
          {over > 0 && (
            <span className="pill bg-danger-bg text-danger border-danger-border">
              <span className="font-semibold tabular-nums">+{over}h</span>
              <span>over</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
