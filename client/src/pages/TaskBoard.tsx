import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useFetch, useLabels, useUsers } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  PriorityBadge,
  StatusBadge,
  WipPill,
  Spinner,
  ErrorNote,
  EmptyState,
  Avatars,
  fmtDate,
  fmtDay,
} from '../components/ui';
import type { Task, TaskStatus } from '../types';

const POLL_MS = 25000;
const MS_DAY = 24 * 60 * 60 * 1000;
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

type ViewMode = 'board' | 'list';

// Active (non-complete) statuses shown as board columns. Completed work lives in
// its own collapsible section at the bottom.
const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'not_started', label: 'Not started', dot: 'bg-slate-500' },
  { status: 'in_progress', label: 'In progress', dot: 'bg-accent' },
  { status: 'paused', label: 'Paused', dot: 'bg-violet-400' },
  { status: 'blocked', label: 'Blocked', dot: 'bg-red-400' },
];

const priorityBorder: Record<string, string> = {
  high: 'border-l-red-500/70',
  medium: 'border-l-amber-500/70',
  low: 'border-l-slate-600',
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

/**
 * Start of the most recent Monday strictly before today — i.e. the previous
 * meeting. Opened during Monday's meeting it covers the past week; opened later
 * it covers since that Monday. Change the loop target to reschedule the cadence.
 */
function lastMeetingStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  do {
    d.setDate(d.getDate() - 1);
  } while (d.getDay() !== 1); // 1 = Monday
  return d;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}

function OwnerTag({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="w-5 h-5 shrink-0 rounded-full bg-gradient-to-br from-navy-700 to-navy-850 border border-black/40 text-[9px] text-ink flex items-center justify-center font-medium">
        {initials(name)}
      </span>
      <span className="text-xs text-slate-400 truncate">{name}</span>
    </span>
  );
}

function DueChip({ task }: { task: Task }) {
  if (task.isWip || !task.estimatedDueDate) return null;
  const days = dayDiff(task.estimatedDueDate);
  let cls = 'text-slate-500 bg-white/[0.04] border-white/[0.08]';
  let text = `due ${fmtDay(task.estimatedDueDate)}`;
  if (days < 0) {
    cls = 'text-red-300 bg-red-500/10 border-red-500/25';
    text = `${-days}d overdue`;
  } else if (days === 0) {
    cls = 'text-red-300 bg-red-500/10 border-red-500/25';
    text = 'due today';
  } else if (days <= 3) {
    cls = 'text-amber-300 bg-amber-500/10 border-amber-500/25';
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
  const [showCompleted, setShowCompleted] = useState(false);
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
    owner: params.get('owner') || '',
    priority: params.get('priority') || '',
    status: params.get('status') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
  };
  const activeFilterCount = [...params.keys()].length;

  const tasks = useMemo(() => data || [], [data]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (f.bucket && t.bucket !== f.bucket) return false;
      if (f.initiative && t.initiative !== f.initiative) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.owner && t.ownerId !== f.owner && !t.assignments.some((a) => a.userId === f.owner)) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.from && new Date(t.submittedAt) < new Date(f.from)) return false;
      if (f.to && new Date(t.submittedAt) > new Date(f.to + 'T23:59:59')) return false;
      return true;
    });
  }, [tasks, f.bucket, f.initiative, f.status, f.owner, f.priority, f.from, f.to]);

  const active = useMemo(() => filtered.filter((t) => t.status !== 'complete'), [filtered]);

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
    unowned: active.filter((t) => !t.ownerId).length,
  };

  const sortCards = (a: Task, b: Task) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    const da = a.estimatedDueDate ? new Date(a.estimatedDueDate).getTime() : Infinity;
    const db = b.estimatedDueDate ? new Date(b.estimatedDueDate).getTime() : Infinity;
    if (da !== db) return da - db;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  };

  const upForGrabs = active.filter((t) => !t.ownerId).sort(sortCards);

  const completed = useMemo(() => {
    const since = lastMeetingStart().getTime();
    return filtered
      .filter((t) => t.status === 'complete' && new Date(t.updatedAt).getTime() >= since)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [filtered]);

  const claim = async (task: Task) => {
    if (!user) return;
    setClaiming(task.id);
    try {
      await api(`/api/tasks/${task.id}`, { method: 'PUT', body: { ownerId: user.id } });
      toast.success(`You claimed “${task.title}”`);
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
          <div className="flex items-center gap-0.5 rounded-lg border border-subtle bg-navy-925 p-0.5 text-[13px] font-medium">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                className={`rounded-md px-3 py-1 capitalize transition-colors duration-100 ${
                  view === v
                    ? 'bg-white/[0.08] text-white shadow-card'
                    : 'text-slate-400 hover:text-ink hover:bg-white/[0.04]'
                }`}
                onClick={() => setViewPersist(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            className={`btn-secondary relative ${showFilters ? '!bg-white/[0.08] !text-white' : ''}`}
            onClick={() => setShowFilters((s) => !s)}
            title="Filters"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 3h13L9.5 9v4l-3 1.5V9L1.5 3z" strokeLinejoin="round" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-semibold tabular-nums flex items-center justify-center">
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
          <CountPill label="unowned" value={counts.unowned} tone="amber" />
        </div>
        <div className="flex items-center gap-2">
          <span className="pill bg-emerald-500/10 text-emerald-300 border-emerald-500/25">
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
          <select className="input !w-auto" value={f.owner} onChange={(e) => setFilter('owner', e.target.value)}>
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
            <span className="font-normal normal-case tracking-normal text-slate-600 text-[11px]">
              entered without an owner — anyone can claim
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {upForGrabs.map((t) => (
              <div
                key={t.id}
                className="card-elevated border-dashed border-amber-500/40 px-3.5 py-2.5 flex items-center gap-3"
              >
                <div className="min-w-0">
                  <Link
                    to={`/tasks/${t.id}`}
                    className="font-medium text-[13px] text-ink transition-colors hover:text-accent-hover"
                  >
                    {t.title}
                  </Link>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <PriorityBadge priority={t.priority} />
                    <span>for {t.requestedBy}</span>
                  </div>
                </div>
                <button
                  className="btn-secondary shrink-0 !py-1 !px-3"
                  onClick={() => claim(t)}
                  disabled={claiming === t.id}
                >
                  {claiming === t.id ? 'Claiming…' : 'Claim'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Board / list */}
      {view === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const items = active.filter((t) => t.status === col.status).sort(sortCards);
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
                  isDropTarget ? 'bg-accent/[0.06] border-accent/50' : 'bg-navy-900/40 border-faint'
                }`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-slate-300">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    {col.label}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-slate-500 bg-white/[0.05] border border-faint rounded-full px-2 py-0.5">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {items.length === 0 ? (
                    <p className="text-[12px] text-slate-600 text-center py-6">
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
              <tr className="border-b border-subtle">
                <th className="th pl-5">Task</th>
                <th className="th">Leader</th>
                <th className="th">Bucket</th>
                <th className="th">Priority</th>
                <th className="th">Status</th>
                <th className="th">Hours</th>
                <th className="th pr-5">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {active.map((t) => {
                const hours = t.assignments.reduce((s, a) => s + a.hoursLogged, 0);
                return (
                  <tr key={t.id} className="row-hover group">
                    <td className="px-4 py-3 pl-5">
                      <Link
                        to={`/tasks/${t.id}`}
                        className="font-medium text-ink transition-colors group-hover:text-white hover:!text-accent-hover"
                      >
                        {t.title}
                      </Link>
                      {t.initiative && (
                        <div className="text-xs text-slate-500 truncate max-w-md mt-0.5">{t.initiative}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{t.requestedBy}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{t.bucket}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusBadge status={t.status} />
                        {t.isWip && <WipPill />}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs tabular-nums text-slate-400">
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

      {/* Completed since last meeting (collapsible, at the bottom) */}
      <div className="card">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left"
          onClick={() => setShowCompleted((s) => !s)}
        >
          <span className="flex items-center gap-2">
            <span className="section-title">Completed since last meeting</span>
            <span className="font-mono text-[11px] tabular-nums text-slate-500 bg-white/[0.05] border border-faint rounded-full px-2 py-0.5">
              {completed.length}
            </span>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`text-slate-500 transition-transform ${showCompleted ? 'rotate-180' : ''}`}
          >
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {showCompleted && (
          <div className="px-6 pb-6">
            <p className="text-xs text-slate-500 mb-4">Finished on or after {fmtDate(lastMeetingStart())}</p>
            {completed.length === 0 ? (
              <EmptyState>Nothing wrapped up since the last meeting yet</EmptyState>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {completed.map((t) => {
                  const contributors = [...new Set(t.assignments.map((a) => a.user.name))];
                  const who = contributors.length > 0 ? contributors.join(', ') : t.owner?.name ?? '—';
                  return (
                    <li key={t.id} className="list-row py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <Link
                          to={`/tasks/${t.id}`}
                          className="font-medium text-ink transition-colors hover:text-accent-hover"
                        >
                          {t.title}
                        </Link>
                        <span className="text-slate-500"> — {who}</span>
                      </span>
                      <span className="mono-meta shrink-0">{fmtDate(t.updatedAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const tonePill: Record<string, string> = {
  default: 'bg-white/[0.05] text-slate-300 border-white/[0.08]',
  red: 'bg-red-500/10 text-red-300 border-red-500/25',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  violet: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
};

function CountPill({ label, value, tone = 'default' }: { label: string; value: number; tone?: string }) {
  return (
    <span className={`pill ${value > 0 ? tonePill[tone] : tonePill.default}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-slate-400">{label}</span>
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
        className="block font-medium text-[13px] leading-snug text-ink transition-colors hover:text-accent-hover"
      >
        {task.title}
      </Link>
      <div className="flex items-center justify-between gap-2 mt-2.5">
        {task.owner ? (
          <OwnerTag name={task.owner.name} />
        ) : (
          <button
            className="text-[12px] font-medium text-amber-300/90 px-2 py-0.5 rounded-md border border-dashed border-amber-500/40 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
            onClick={() => onClaim(task)}
            disabled={claiming}
          >
            {claiming ? 'Claiming…' : 'Claim'}
          </button>
        )}
        <DueChip task={task} />
      </div>
    </div>
  );
}
