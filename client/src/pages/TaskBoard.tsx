import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useFetch, useLabels, useUsers } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  PriorityBadge,
  StatusBadge,
  Spinner,
  ErrorNote,
  EmptyState,
  Avatars,
  fmtDay,
  NeedsSfBadge,
  isProposalBucket,
} from '../components/ui';
import type { Task, TaskStatus } from '../types';
import { currentQuarter, quarterRange } from '../lib/quarters';

const POLL_MS = 25000;
const MS_DAY = 24 * 60 * 60 * 1000;
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Status "activeness" rank — used as the FIRST sort key wherever tasks of mixed
// status share one list (the up-for-grabs strip and the list view). It surfaces
// work that's actually moving (in progress) above queued/parked work, so a paused
// task no longer floats to the top next to the in-progress ones just because it
// outranks them on priority. Order: actively worked → queued → stuck → parked.
// This is a deliberate no-op inside the board columns, which are already grouped by
// a single status (every comparison there ties at 0 and falls through to the
// user-selected priority/due/created sort).
const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  not_started: 1,
  blocked: 2,
  paused: 3,
  closed: 4,
};

type ViewMode = 'board' | 'list';

// User-controlled sort, persisted in the URL search params alongside the filters.
// Fields map to: priority (PRIORITY_ORDER), due (estimatedDueDate), created
// (submittedAt). There is intentionally NO effort field — level-of-effort was
// scrapped from the data model.
type SortBy = 'priority' | 'due' | 'created';
type SortDir = 'asc' | 'desc';

// Labels for the board-view field <select>. Kept in declaration order so the
// dropdown reads priority → due → created, matching the spec's field list.
const SORT_LABELS: Record<SortBy, string> = {
  priority: 'Priority',
  due: 'Due date',
  created: 'Created',
};

// Board columns, left → right. The four active statuses plus a terminal "Closed"
// column. Closed is bounded to the current calendar quarter (see `closedThisQuarter`)
// so it never grows without limit during the meeting; the full closed history lives
// on the dedicated Closed-tasks reporting page.
const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'not_started', label: 'Not started', dot: 'bg-slate-500' },
  // In-progress uses the decorative aqua accent dot (the brand's "in progress" cue).
  { status: 'in_progress', label: 'In progress', dot: 'bg-aqua' },
  { status: 'paused', label: 'Paused', dot: 'bg-violet-400' },
  { status: 'blocked', label: 'Blocked', dot: 'bg-red-400' },
  // Closed → success green dot, matching the StatusBadge "closed" trio.
  { status: 'closed', label: 'Closed', dot: 'bg-success' },
];

const priorityBorder: Record<string, string> = {
  high: 'border-l-red-500/70',
  medium: 'border-l-amber-500/70',
  // Low priority gets a neutral hairline left-border on light surfaces.
  low: 'border-l-line',
};

/** Whole calendar days from today until `date` (negative = past). */
function dayDiff(date: string): number {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  // estimatedDueDate is a calendar day stored at UTC midnight; rebuild it at
  // LOCAL midnight from the date-only portion so the count is correct for users
  // behind UTC — otherwise every dated task reads a day more urgent than it is.
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const b = new Date(y, m - 1, d);
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}

function ContributorTag({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {/* Avatar chip: aqua tint fill with navy initials reads well on a white card. */}
      <span className="w-5 h-5 shrink-0 rounded-full bg-aqua-light border border-line text-[9px] text-navy flex items-center justify-center font-medium">
        {initials(name)}
      </span>
      <span className="text-xs text-muted truncate">{name}</span>
    </span>
  );
}

function DueChip({ task }: { task: Task }) {
  if (task.isWip || !task.estimatedDueDate) return null;
  const days = dayDiff(task.estimatedDueDate);
  // Default (comfortably-future) due date: neutral well + muted text on light.
  let cls = 'text-muted bg-paper-deep border-line';
  let text = `due ${fmtDay(task.estimatedDueDate)}`;
  if (days < 0) {
    // Overdue → danger trio (tint fill + AA-safe danger text + danger border).
    cls = 'text-danger bg-danger-bg border-danger-border';
    text = `${-days}d overdue`;
  } else if (days === 0) {
    // Due today is also treated as urgent → danger trio.
    cls = 'text-danger bg-danger-bg border-danger-border';
    text = 'due today';
  } else if (days <= 3) {
    // Due soon (within 3 days) → warn/amber trio.
    cls = 'text-warn bg-warn-bg border-warn-border';
    text = `due in ${days}d`;
  }
  return <span className={`pill ${cls}`}>{text}</span>;
}

export default function TaskBoard() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { buckets, initiatives } = useLabels();
  const { users } = useUsers(true);
  const { data, loading, error, reload, setData } = useFetch<Task[]>('/api/tasks');

  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('ascend.taskView') as ViewMode) || 'board');
  const [showFilters, setShowFilters] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);

  // Background polling so the board stays current during the meeting.
  useEffect(() => {
    const id = setInterval(() => reload(), POLL_MS);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (data) setLastUpdated(new Date());
  }, [data]);

  const setViewPersist = (v: ViewMode) => {
    setView(v);
    localStorage.setItem('ascend.taskView', v);
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const f = {
    bucket: params.get('bucket') || '',
    initiative: params.get('initiative') || '',
    person: params.get('person') || '',
    priority: params.get('priority') || '',
    status: params.get('status') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
  };

  // Sort is derived from the same URL params as the filters so it survives reloads
  // and is shareable. We validate the raw param against the allowed sets and fall
  // back to the defaults (priority / asc) for anything unexpected, so a hand-edited
  // or stale URL can never push an invalid value into the comparator.
  const sortBy: SortBy = (['priority', 'due', 'created'] as const).includes(
    params.get('sortBy') as SortBy,
  )
    ? (params.get('sortBy') as SortBy)
    : 'priority';
  const sortDir: SortDir = params.get('sortDir') === 'desc' ? 'desc' : 'asc';

  // Filter chips already count every param key; exclude the two sort keys so the
  // Filters badge keeps reflecting only actual filters, not the (always-present)
  // sort selection.
  const activeFilterCount = [...params.keys()].filter((k) => k !== 'sortBy' && k !== 'sortDir').length;

  // Write a sort field into the URL. Choosing a NEW field resets direction to the
  // sensible default for that field (asc); we don't preserve the previous dir
  // because "ascending priority" and "ascending due date" are the natural starting
  // points and avoid surprising the user with an inherited descending order.
  const setSortBy = (next: SortBy) => {
    const p = new URLSearchParams(params);
    p.set('sortBy', next);
    p.set('sortDir', 'asc');
    setParams(p, { replace: true });
  };

  // Flip asc ↔ desc for the current field, leaving the field itself untouched.
  const toggleSortDir = () => {
    const p = new URLSearchParams(params);
    p.set('sortDir', sortDir === 'asc' ? 'desc' : 'asc');
    setParams(p, { replace: true });
  };

  // List-view header click: selecting the already-active field toggles its
  // direction; selecting a different field switches to it (asc). This is the
  // standard spreadsheet-style "click header to sort, click again to reverse".
  const onHeaderSort = (field: SortBy) => {
    if (sortBy === field) toggleSortDir();
    else setSortBy(field);
  };

  const tasks = useMemo(() => data || [], [data]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (f.bucket && t.bucket !== f.bucket) return false;
      if (f.initiative && t.initiative !== f.initiative) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.person && !t.assignments.some((a) => a.userId === f.person)) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.from && new Date(t.submittedAt) < new Date(f.from)) return false;
      if (f.to && new Date(t.submittedAt) > new Date(f.to + 'T23:59:59')) return false;
      return true;
    });
  }, [tasks, f.bucket, f.initiative, f.status, f.person, f.priority, f.from, f.to]);

  const active = useMemo(() => filtered.filter((t) => t.status !== 'closed'), [filtered]);

  // Closed work to show in the board's Closed column, bounded to the CURRENT
  // calendar quarter so the column stays a useful "recently wrapped up" view
  // rather than an ever-growing archive (full history lives on /closed). We match
  // on closedAt and fall back to updatedAt for any older closed row that predates
  // closedAt being stamped, so nothing silently drops out of view.
  const closedThisQuarter = useMemo(() => {
    const { q, year } = currentQuarter();
    const { start, end } = quarterRange(q, year);
    return filtered
      .filter((t) => {
        if (t.status !== 'closed') return false;
        const when = new Date(t.closedAt ?? t.updatedAt).getTime();
        return when >= start.getTime() && when <= end.getTime();
      })
      .sort((a, b) => {
        // Most recently closed first within the column.
        const da = new Date(a.closedAt ?? a.updatedAt).getTime();
        const db = new Date(b.closedAt ?? b.updatedAt).getTime();
        return db - da;
      });
  }, [filtered]);

  const isOverdue = (t: Task) => !t.isWip && !!t.estimatedDueDate && dayDiff(t.estimatedDueDate) < 0;
  const isDueSoon = (t: Task) => {
    if (t.isWip || !t.estimatedDueDate) return false;
    const d = dayDiff(t.estimatedDueDate);
    return d >= 0 && d <= 3;
  };

  const counts = {
    active: active.length,
    overdue: active.filter(isOverdue).length,
    dueSoon: active.filter(isDueSoon).length,
    blocked: active.filter((t) => t.status === 'blocked').length,
    paused: active.filter((t) => t.status === 'paused').length,
    unclaimed: active.filter((t) => !t.assignments.some((a) => !a.endDate)).length,
    // Proposals still missing their Salesforce opportunity link — the gap this
    // feature exists to surface and close.
    missingSf: active.filter((t) => isProposalBucket(t.bucket) && !t.salesforceOpportunity).length,
  };

  // Comparator honoring the URL-driven sort (sortBy + sortDir), used by both the
  // board columns and the list view. Memoized on the sort state so the function
  // identity is stable across renders (avoids re-sorting when only unrelated state
  // changes) and so the closures it builds always read the current sort.
  const sortCards = useMemo(() => {
    // dir multiplier flips the comparison for descending without duplicating each
    // branch. Note the deliberate exception below: due-date nulls stay last in BOTH
    // directions, so the multiplier is applied to the dated comparison only.
    const dir = sortDir === 'asc' ? 1 : -1;
    return (a: Task, b: Task): number => {
      // Active-status grouping comes first and is direction-independent: we always
      // want in-progress work above parked/paused work regardless of asc/desc on the
      // chosen field. Ties (same status, e.g. within a board column) fall through to
      // the field comparison below.
      const s = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      if (s !== 0) return s;
      if (sortBy === 'priority') {
        // PRIORITY_ORDER ranks high(0) → medium(1) → low(2); asc therefore lists
        // the most urgent work first, which is the intuitive default.
        const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (p !== 0) return p * dir;
      } else if (sortBy === 'due') {
        // Tasks without a due date always sort to the BOTTOM regardless of dir —
        // an undated task is "least scheduled", and surfacing nulls at the top in
        // desc order would bury every dated task. We special-case the all-null and
        // one-null pairs before applying the direction multiplier to two real dates.
        const aHas = !!a.estimatedDueDate;
        const bHas = !!b.estimatedDueDate;
        if (!aHas && !bHas) {
          /* both null → fall through to the created-date tiebreak */
        } else if (!aHas) {
          return 1; // a (null) after b
        } else if (!bHas) {
          return -1; // a before b (null)
        } else {
          const da = new Date(a.estimatedDueDate as string).getTime();
          const db = new Date(b.estimatedDueDate as string).getTime();
          if (da !== db) return (da - db) * dir;
        }
      } else {
        // 'created' → submittedAt. asc = oldest requests first.
        const ca = new Date(a.submittedAt).getTime();
        const cb = new Date(b.submittedAt).getTime();
        if (ca !== cb) return (ca - cb) * dir;
      }
      // Stable, dir-independent tiebreak: most recently touched first. Keeps card
      // order deterministic when the primary key ties (e.g. same priority).
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    };
  }, [sortBy, sortDir]);

  const upForGrabs = active.filter((t) => !t.assignments.some((a) => !a.endDate)).sort(sortCards);

  const claim = async (task: Task) => {
    if (!user) return;
    setClaiming(task.id);
    try {
      await api(`/api/tasks/${task.id}/assignments`, {
        method: 'POST',
        body: { startDate: new Date().toISOString().slice(0, 10), hoursLogged: 0 },
      });
      toast.success(`You joined “${task.title}”`);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClaiming(null);
    }
  };

  // Drag a card onto another column to change its status (optimistic, then PUT).
  const moveTask = async (taskId: string, status: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    setData((prev) => (prev || []).map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      await api(`/api/tasks/${taskId}`, { method: 'PUT', body: { status } });
    } catch (e: any) {
      toast.error(e.message);
      reload();
    }
  };

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorNote message={error} />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Task Board</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Where all active work stands · updates live during the meeting
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Recessed segmented control on a light surface: paper-deep well + hairline border. */}
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-paper-deep p-0.5 text-[13px] font-medium">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                className={`rounded-md px-3 py-1 capitalize transition-colors duration-100 ${
                  view === v
                    ? // Active tab lifts to a white pill with navy text + card shadow.
                      'bg-white text-navy shadow-card'
                    : 'text-muted hover:text-navy hover:bg-white'
                }`}
                onClick={() => setViewPersist(v)}
              >
                {v}
              </button>
            ))}
          </div>
          {/* Sort control: a field <select> paired with a direction toggle, sitting
              next to Filters so the two board controls read as a group. Both write to
              the URL params via the setSort* helpers. */}
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-paper-deep p-0.5">
            <select
              className="bg-transparent text-[13px] font-medium text-navy px-2 py-1 rounded-md focus:outline-none cursor-pointer"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              title="Sort by"
            >
              {(['priority', 'due', 'created'] as const).map((opt) => (
                <option key={opt} value={opt}>
                  {SORT_LABELS[opt]}
                </option>
              ))}
            </select>
            <button
              className="rounded-md px-2 py-1 text-navy hover:bg-white transition-colors"
              onClick={toggleSortDir}
              // Surface the current direction for screen readers and on hover.
              title={sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
              aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
            >
              <SortArrow dir={sortDir} />
            </button>
          </div>
          <button
            // When the filter panel is open, the toggle takes the navy primary fill.
            className={`btn-secondary relative ${showFilters ? '!bg-navy !text-white' : ''}`}
            onClick={() => setShowFilters((s) => !s)}
            title="Filters"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 3h13L9.5 9v4l-3 1.5V9L1.5 3z" strokeLinejoin="round" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-aqua text-white text-[10px] font-semibold tabular-nums flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <Link to="/intake" className="btn-primary">
            + New task
          </Link>
        </div>
      </div>

      {/* Count strip + live status */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-2 text-[12px]">
          <CountPill label="active" value={counts.active} />
          <CountPill label="overdue" value={counts.overdue} tone="red" />
          <CountPill label="due ≤3d" value={counts.dueSoon} tone="amber" />
          <CountPill label="blocked" value={counts.blocked} tone="red" />
          <CountPill label="paused" value={counts.paused} tone="violet" />
          <CountPill label="unclaimed" value={counts.unclaimed} tone="amber" />
          <CountPill label="missing SF link" value={counts.missingSf} tone="amber" />
        </div>
        <div className="flex items-center gap-2">
          {/* Live indicator → success trio; the pulsing dot keeps its bright green for the "live" cue. */}
          <span className="pill bg-success-bg text-success border-success-border">
            <span className="pill-dot bg-emerald-400 animate-pulse" />
            Live
          </span>
          {lastUpdated && (
            <span className="mono-meta hidden sm:inline">
              updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button className="btn-secondary" onClick={() => reload()}>
            Refresh
          </button>
        </div>
      </div>

      {/* Filters (collapsible) */}
      {showFilters && (
        <div className="card px-4 py-3 flex flex-wrap gap-2 items-center text-sm">
          <select className="input !w-auto" value={f.bucket} onChange={(e) => setFilter('bucket', e.target.value)}>
            <option value="">All buckets</option>
            {buckets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            className="input !w-auto max-w-[220px]"
            value={f.initiative}
            onChange={(e) => setFilter('initiative', e.target.value)}
          >
            <option value="">All initiatives</option>
            {initiatives.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select className="input !w-auto" value={f.person} onChange={(e) => setFilter('person', e.target.value)}>
            <option value="">All people</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select className="input !w-auto" value={f.priority} onChange={(e) => setFilter('priority', e.target.value)}>
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="input !w-auto" value={f.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="paused">Paused</option>
            <option value="blocked">Blocked</option>
          </select>
          <input
            type="date"
            className="input !w-auto"
            value={f.from}
            onChange={(e) => setFilter('from', e.target.value)}
            title="Requested from"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            className="input !w-auto"
            value={f.to}
            onChange={(e) => setFilter('to', e.target.value)}
            title="Requested to"
          />
          {activeFilterCount > 0 && (
            <button className="btn-ghost" onClick={() => setParams({}, { replace: true })}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Up for grabs */}
      {upForGrabs.length > 0 && (
        <div>
          <h2 className="micro-title mb-2 flex items-center gap-2">
            Up for grabs
            <span className="font-normal normal-case tracking-normal text-muted text-[11px]">
              no contributors yet — claim to join
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {upForGrabs.map((t) => (
              <div
                key={t.id}
                // Unowned card: dashed warn (amber) border signals "needs a claimer".
                className="card-elevated border-dashed border-warn-border px-3.5 py-2.5 flex items-center gap-3"
              >
                <div className="min-w-0">
                  <Link
                    to={`/tasks/${t.id}`}
                    className="font-medium text-[13px] text-ink transition-colors hover:text-aqua-text"
                  >
                    {t.title}
                  </Link>
                  <div className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
                    <PriorityBadge priority={t.priority} />
                    <span>for {t.requestedBy}</span>
                  </div>
                </div>
                <button
                  className="btn-secondary shrink-0 !py-1 !px-3"
                  onClick={() => claim(t)}
                  disabled={claiming === t.id}
                >
                  {claiming === t.id ? 'Joining…' : 'Claim'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Board / list */}
      {view === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {COLUMNS.map((col) => {
            // The Closed column draws from the current-quarter closed set (already
            // sorted most-recent-first); the active columns slice the active list by
            // status and apply the priority/due sort.
            // Board columns show only TOP-LEVEL tasks (parentId == null) so subtasks
            // never appear as their own cards — they live nested under their parent in
            // TaskDetail, and a parent surfaces them via the subtask-progress chip.
            // (The up-for-grabs strip and the list view intentionally still show all
            // tasks, including subtasks, which is acceptable per the feature spec.)
            const items = (
              col.status === 'closed'
                ? closedThisQuarter
                : active.filter((t) => t.status === col.status).sort(sortCards)
            ).filter((t) => t.parentId == null);
            const isDropTarget = dragOverCol === col.status && dragId !== null;
            return (
              <div
                key={col.status}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverCol !== col.status) setDragOverCol(col.status);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain') || dragId;
                  setDragOverCol(null);
                  setDragId(null);
                  if (id) moveTask(id, col.status);
                }}
                className={`rounded-xl p-3 border transition-colors ${
                  // Active drop target highlights with an aqua wash + aqua border; resting
                  // columns are a recessed paper well with a hairline border on light.
                  isDropTarget ? 'bg-aqua/10 border-aqua/50' : 'bg-paper-deep border-line'
                }`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-navy">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    {col.label}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-muted bg-white border border-line rounded-full px-2 py-0.5">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {items.length === 0 ? (
                    <p className="text-[12px] text-muted text-center py-6">
                      {isDropTarget ? 'Drop to move here' : 'Nothing here'}
                    </p>
                  ) : (
                    items.map((t) => (
                      <BoardCard
                        key={t.id}
                        task={t}
                        onClaim={claim}
                        claiming={claiming === t.id}
                        dragging={dragId === t.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', t.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(t.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOverCol(null);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-5">Task</th>
                <th className="th">Leader</th>
                <th className="th">Bucket</th>
                <SortableTh field="priority" sortBy={sortBy} sortDir={sortDir} onSort={onHeaderSort}>
                  Priority
                </SortableTh>
                {/* No dedicated Due column exists in the list, so the Status header
                    doubles as the due-date sort trigger (per spec: "a Due (if present,
                    else Status)"). The label stays "Status" to match the cell content. */}
                <SortableTh field="due" sortBy={sortBy} sortDir={sortDir} onSort={onHeaderSort}>
                  Status
                </SortableTh>
                <th className="th">Hours</th>
                <SortableTh field="created" sortBy={sortBy} sortDir={sortDir} onSort={onHeaderSort} className="pr-5">
                  Requested
                </SortableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {/* List view honors the same sort as the board. Copy before sorting so
                  we never mutate the memoized `active` array in place. */}
              {[...active].sort(sortCards).map((t) => {
                const hours = t.assignments.reduce((s, a) => s + a.hoursLogged, 0);
                return (
                  <tr key={t.id} className="row-hover group">
                    <td className="px-4 py-3 pl-5">
                      <Link
                        to={`/tasks/${t.id}`}
                        // Stays ink by default; hover shifts to AA-safe aqua link color on light.
                        className="font-medium text-ink transition-colors hover:!text-aqua-text"
                      >
                        {t.title}
                      </Link>
                      {t.initiative && (
                        <div className="text-xs text-muted truncate max-w-md mt-0.5">{t.initiative}</div>
                      )}
                      {isProposalBucket(t.bucket) && !t.salesforceOpportunity && (
                        <div className="mt-1">
                          <NeedsSfBadge compact />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{t.requestedBy}</td>
                    <td className="px-4 py-3 text-muted text-xs">{t.bucket}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3">
                      {/* Show the workflow status only. WIP (ongoing / no due date) is a
                          scheduling attribute, not a status — pairing it with the status
                          badge read as a task having "two statuses" (e.g. In progress + WIP),
                          so it no longer renders here. WIP still shows on the task detail
                          page's timeline and drives the Analytics "WIP tasks" view. */}
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs tabular-nums text-muted">
                        {Math.round(hours * 10) / 10}
                      </span>
                    </td>
                    <td className="px-4 py-3 pr-5">
                      <span className="mono-meta">{fmtDay(t.submittedAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {active.length === 0 && <EmptyState>No tasks match the current filters</EmptyState>}
        </div>
      )}
    </div>
  );
}

// Count-strip pill tints, mapped to the light-brand semantic trios. The `default`
// tone is the neutral recessed well; non-zero counts pick up their status color.
const tonePill: Record<string, string> = {
  default: 'bg-paper-deep text-muted border-line',
  red: 'bg-danger-bg text-danger border-danger-border',
  amber: 'bg-warn-bg text-warn border-warn-border',
  // Violet has no brand token; keep the hue but use a tint+dark-text+border idiom
  // (600 text reads AA-safe on the light violet wash, unlike the old 300).
  violet: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
};

// Direction caret used by both the board toggle button and the active list header.
// A single chevron that points up for asc and down for desc — the standard sort cue.
// `dir` controls the rotation; we rotate one glyph rather than swapping icons so the
// indicator stays visually centered.
function SortArrow({ dir }: { dir: SortDir }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      // asc → caret up (▲), desc → caret down (▼). transition keeps the flip smooth.
      className={`transition-transform duration-100 ${dir === 'desc' ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M4 10l4-4 4 4" />
    </svg>
  );
}

// A clickable table header that drives the shared sort. Shows the direction caret
// only when its field is the active sort, so the user can see at a glance which
// column the table is ordered by. Clicking calls onSort(field), which toggles the
// direction if already active or switches to this field (asc) otherwise.
function SortableTh({
  field,
  sortBy,
  sortDir,
  onSort,
  children,
  className = '',
}: {
  field: SortBy;
  sortBy: SortBy;
  sortDir: SortDir;
  onSort: (field: SortBy) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const isActive = sortBy === field;
  return (
    <th className={`th ${className}`}>
      <button
        type="button"
        // Inline flex so the caret hugs the label; active header takes navy text to
        // distinguish it from the muted inactive headers.
        className={`inline-flex items-center gap-1 transition-colors hover:text-navy ${
          isActive ? 'text-navy' : ''
        }`}
        onClick={() => onSort(field)}
        aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {children}
        {/* Reserve no space when inactive (the caret simply isn't rendered) so column
            widths stay stable as the active sort moves between headers. */}
        {isActive && <SortArrow dir={sortDir} />}
      </button>
    </th>
  );
}

function CountPill({ label, value, tone = 'default' }: { label: string; value: number; tone?: string }) {
  return (
    <span className={`pill ${value > 0 ? tonePill[tone] : tonePill.default}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

function BoardCard({
  task,
  onClaim,
  claiming,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  onClaim: (t: Task) => void;
  claiming: boolean;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}) {
  const activeContribs = task.assignments.filter((a) => !a.endDate);
  // Subtask roll-up for the parent card. "Done" mirrors the board's terminal state
  // (status === 'closed'); we render a compact chip only when the task actually has
  // subtasks so plain tasks stay visually unchanged.
  const subtasks = task.subtasks ?? [];
  const subtasksDone = subtasks.filter((s) => s.status === 'closed').length;
  const allSubtasksDone = subtasks.length > 0 && subtasksDone === subtasks.length;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`card-elevated border-l-2 ${priorityBorder[task.priority]} p-3 cursor-grab active:cursor-grabbing ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <Link
        to={`/tasks/${task.id}`}
        draggable={false}
        className="block font-medium text-[13px] leading-snug text-ink transition-colors hover:text-aqua-text"
      >
        {task.title}
      </Link>
      {subtasks.length > 0 && (
        // Subtask-progress chip: success trio once every subtask is closed, otherwise
        // the neutral recessed well. Tiny tree glyph distinguishes it from the due/SF
        // pills below.
        <span
          className={`pill mt-2 ${
            allSubtasksDone
              ? 'bg-success-bg text-success border-success-border'
              : 'bg-paper-deep text-muted border-line'
          }`}
        >
          <span className="font-semibold tabular-nums">
            {subtasksDone}/{subtasks.length}
          </span>
          subtasks done
        </span>
      )}
      <div className="flex items-center justify-between gap-2 mt-2.5">
        {activeContribs.length > 0 ? (
          <span className="flex items-center gap-1.5 min-w-0">
            <ContributorTag name={activeContribs[0].user.name} />
            {activeContribs.length > 1 && (
              <span className="text-[11px] text-muted shrink-0">+{activeContribs.length - 1}</span>
            )}
          </span>
        ) : (
          <button
            // Inline "Claim" affordance: warn (amber) dashed outline that fills with the
            // warn tint on hover — claiming adds you to the task as a contributor.
            className="text-[12px] font-medium text-warn px-2 py-0.5 rounded-md border border-dashed border-warn-border transition-colors hover:bg-warn-bg disabled:opacity-50"
            onClick={() => onClaim(task)}
            disabled={claiming}
          >
            {claiming ? 'Joining…' : 'Claim'}
          </button>
        )}
        <DueChip task={task} />
      </div>
      {/* Passive nudge: a proposal with no Salesforce opportunity yet. Compact label
          to fit the card; whoever has SF access can open the task and add it. */}
      {isProposalBucket(task.bucket) && !task.salesforceOpportunity && (
        <div className="mt-2">
          <NeedsSfBadge compact />
        </div>
      )}
    </div>
  );
}
