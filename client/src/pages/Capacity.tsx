import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFetch, useUsers } from '../hooks';
import { Spinner, ErrorNote, EmptyState } from '../components/ui';
import type { Task, User } from '../types';

const MS_DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days from today until `date` (negative = past). */
function dayDiff(date: string): number {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const b = new Date(y, m - 1, d);
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

const isOverdue = (t: Task) => !t.isWip && !!t.estimatedDueDate && dayDiff(t.estimatedDueDate) < 0;

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}

interface Row {
  user: User;
  total: number;
  overdue: number;
}

export default function Capacity() {
  const { users } = useUsers();
  const { data, loading, error } = useFetch<Task[]>('/api/tasks');

  const active = useMemo(() => (data || []).filter((t) => t.status !== 'complete'), [data]);

  const rows = useMemo<Row[]>(() => {
    return users
      .map((u) => {
        // "On" a task = its owner, or an active contributor (assignment with no end date).
        const onTasks = active.filter(
          (t) => t.ownerId === u.id || t.assignments.some((a) => a.userId === u.id && !a.endDate),
        );
        return {
          user: u,
          total: onTasks.length,
          overdue: onTasks.filter(isOverdue).length,
        };
      })
      .sort((a, b) => b.total - a.total || a.user.name.localeCompare(b.user.name));
  }, [users, active]);

  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const unowned = active.filter((t) => !t.ownerId).length;
  const peopleEngaged = rows.filter((r) => r.total > 0).length;

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">Capacity</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          How active work is distributed across the team right now — to keep allocation balanced.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card px-5 py-4">
          <div className="text-[26px] font-semibold tracking-tight text-white leading-none tabular-nums">
            {active.length}
          </div>
          <div className="text-xs text-slate-500 mt-2">Active tasks</div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-[26px] font-semibold tracking-tight text-white leading-none tabular-nums">
            {peopleEngaged}
            <span className="text-base text-slate-500"> / {rows.length}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">People with active work</div>
        </div>
        <div className="card px-5 py-4">
          <div
            className={`text-[26px] font-semibold tracking-tight leading-none tabular-nums ${
              unowned > 0 ? 'text-amber-300' : 'text-white'
            }`}
          >
            {unowned}
          </div>
          <div className="text-xs text-slate-500 mt-2">Unowned tasks</div>
        </div>
      </div>

      {/* Per-member load */}
      {rows.length === 0 ? (
        <EmptyState>No team members to show</EmptyState>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.user.id} className="card p-4 flex items-center gap-4">
              <span className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-navy-700 to-navy-850 border border-black/40 text-[11px] text-ink flex items-center justify-center font-medium">
                {initials(r.user.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-ink truncate">{r.user.name}</span>
                    {r.user.role === 'admin' && (
                      <span className="pill bg-gold/10 text-gold border-gold/30">Admin</span>
                    )}
                    {r.total === 0 && (
                      <span className="pill bg-emerald-500/10 text-emerald-300 border-emerald-500/25">available</span>
                    )}
                  </div>
                  <span className="text-lg font-semibold tabular-nums text-white shrink-0">
                    {r.total}
                    <span className="text-xs font-normal text-slate-500"> task{r.total === 1 ? '' : 's'}</span>
                  </span>
                </div>

                <div className="mt-2 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.overdue > 0 ? 'bg-amber-400' : 'bg-accent'}`}
                    style={{ width: `${(r.total / maxTotal) * 100}%` }}
                  />
                </div>

                {r.overdue > 0 && (
                  <div className="mt-2 text-[11px]">
                    <span className="pill bg-red-500/10 text-red-300 border-red-500/25">
                      <span className="font-semibold tabular-nums">{r.overdue}</span>
                      <span>overdue</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Counts active (non-complete) tasks where a person is the owner or an active contributor. Manage assignments from
        each <Link to="/tasks" className="text-accent hover:text-accent-hover">task</Link>.
      </p>
    </div>
  );
}
