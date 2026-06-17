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
        // "On" a task = an active contributor (assignment with no end date).
        const onTasks = active.filter((t) =>
          t.assignments.some((a) => a.userId === u.id && !a.endDate),
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
  const unstaffed = active.filter((t) => !t.assignments.some((a) => !a.endDate)).length;
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
          {/* KPI figure: Fraunces display-figure (navy) on the light card — replaces the old text-white. */}
          <div className="display-figure text-[26px] leading-none tabular-nums">
            {active.length}
          </div>
          <div className="text-xs text-muted mt-2">Active tasks</div>
        </div>
        <div className="card px-5 py-4">
          <div className="display-figure text-[26px] leading-none tabular-nums">
            {peopleEngaged}
            <span className="text-base text-muted"> / {rows.length}</span>
          </div>
          <div className="text-xs text-muted mt-2">People with active work</div>
        </div>
        <div className="card px-5 py-4">
          {/* Unstaffed tasks (no active contributor) warrant attention when > 0 -> warn figure. */}
          <div
            className={`display-figure text-[26px] leading-none tabular-nums ${
              unstaffed > 0 ? 'text-warn' : 'text-navy'
            }`}
          >
            {unstaffed}
          </div>
          <div className="text-xs text-muted mt-2">Unstaffed tasks</div>
        </div>
      </div>

      {/* Per-member load */}
      {rows.length === 0 ? (
        <EmptyState>No team members to show</EmptyState>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.user.id} className="card p-4 flex items-center gap-4">
              {/* Avatar chip: light aqua tint with navy initials on the light surface (was a dark navy gradient). */}
              <span className="w-9 h-9 shrink-0 rounded-full bg-aqua-light border border-line text-[11px] text-navy flex items-center justify-center font-medium">
                {initials(r.user.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-ink truncate">{r.user.name}</span>
                    {r.user.role === 'admin' && (
                      // Admin pill: aqua tint trio (AA-safe aqua text) replaces the old gold-on-dark idiom.
                      <span className="pill bg-aqua-light text-aqua-text border-aqua/30">Admin</span>
                    )}
                    {r.total === 0 && (
                      // "available" is a positive/success state -> success tint trio.
                      <span className="pill bg-success-bg text-success border-success-border">available</span>
                    )}
                  </div>
                  {/* Per-member task count: navy figure on the light card (was text-white). */}
                  <span className="text-lg font-semibold tabular-nums text-navy shrink-0">
                    {r.total}
                    <span className="text-xs font-normal text-muted"> task{r.total === 1 ? '' : 's'}</span>
                  </span>
                </div>

                {/* Progress track: recessed paper-deep well; fill is warn (amber) when overdue, else decorative aqua. */}
                <div className="mt-2 h-2 rounded-full bg-paper-deep overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.overdue > 0 ? 'bg-warn' : 'bg-aqua'}`}
                    style={{ width: `${(r.total / maxTotal) * 100}%` }}
                  />
                </div>

                {r.overdue > 0 && (
                  <div className="mt-2 text-[11px]">
                    {/* Overdue is a danger state -> danger tint trio. */}
                    <span className="pill bg-danger-bg text-danger border-danger-border">
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
        Counts active (non-complete) tasks where a person is an active contributor. Manage assignments from
        each <Link to="/tasks" className="text-aqua-text hover:text-navy">task</Link>.
      </p>
    </div>
  );
}
