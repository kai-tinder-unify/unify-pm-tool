import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PriorityBadge, Spinner, ErrorNote, EmptyState, fmtDate, fmtDay } from '../components/ui';
import type { Task, TaskStatus } from '../types';

const POLL_MS = 25000;
const MS_DAY = 24 * 60 * 60 * 1000;
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

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

export default function Pulse() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Task[]>('/api/tasks');
  const [claiming, setClaiming] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Background polling so the board stays current during the meeting.
  useEffect(() => {
    const id = setInterval(() => reload(), POLL_MS);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (data) setLastUpdated(new Date());
  }, [data]);

  const tasks = useMemo(() => data || [], [data]);
  const active = useMemo(() => tasks.filter((t) => t.status !== 'complete'), [tasks]);

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
    return tasks
      .filter((t) => t.status === 'complete' && new Date(t.updatedAt).getTime() >= since)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [tasks]);

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

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorNote message={error} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Monday pulse</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Where all active work stands · updates live during the meeting
          </p>
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

      {/* Count strip */}
      <div className="flex flex-wrap gap-2 text-[12px]">
        <CountPill label="active" value={counts.active} />
        <CountPill label="overdue" value={counts.overdue} tone="red" />
        <CountPill label="due ≤3d" value={counts.dueSoon} tone="amber" />
        <CountPill label="blocked" value={counts.blocked} tone="red" />
        <CountPill label="paused" value={counts.paused} tone="violet" />
        <CountPill label="unowned" value={counts.unowned} tone="amber" />
      </div>

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

      {/* Status board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const items = active.filter((t) => t.status === col.status).sort(sortCards);
          return (
            <div key={col.status} className="bg-navy-900/40 border border-faint rounded-xl p-3">
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
                  <p className="text-[12px] text-slate-600 text-center py-6">Nothing here</p>
                ) : (
                  items.map((t) => (
                    <PulseCard key={t.id} task={t} onClaim={claim} claiming={claiming === t.id} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed since last meeting */}
      <div className="card p-6">
        <h2 className="section-title mb-1">Completed since last meeting</h2>
        <p className="text-xs text-slate-500 mb-4">
          Finished on or after {fmtDate(lastMeetingStart())}
        </p>
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

function PulseCard({
  task,
  onClaim,
  claiming,
}: {
  task: Task;
  onClaim: (t: Task) => void;
  claiming: boolean;
}) {
  return (
    <div className={`card-elevated border-l-2 ${priorityBorder[task.priority]} p-3`}>
      <Link
        to={`/tasks/${task.id}`}
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
