import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFetch, useLabels, useUsers } from '../hooks';
import { PriorityBadge, StatusBadge, WipPill, Spinner, ErrorNote, EmptyState, Avatars, fmtDate } from '../components/ui';
import type { Task, TaskStatus } from '../types';

const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'not_started', label: 'Not started' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'complete', label: 'Complete' },
];

type ViewMode = 'board' | 'list';

export default function TaskBoard() {
  const [params, setParams] = useSearchParams();
  const { buckets, initiatives } = useLabels();
  const { users } = useUsers(true);
  const { data, loading, error } = useFetch<Task[]>('/api/tasks');
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('ascend.taskView') as ViewMode) || 'board');

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

  const filtered = useMemo(() => {
    return (data || []).filter((t) => {
      if (f.bucket && t.bucket !== f.bucket) return false;
      if (f.initiative && t.initiative !== f.initiative) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.owner && t.ownerId !== f.owner && !t.assignments.some((a) => a.userId === f.owner)) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.from && new Date(t.submittedAt) < new Date(f.from)) return false;
      if (f.to && new Date(t.submittedAt) > new Date(f.to + 'T23:59:59')) return false;
      return true;
    });
  }, [data, f.bucket, f.initiative, f.status, f.owner, f.priority, f.from, f.to]);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Tasks</h1>
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
          <Link to="/intake" className="btn-primary">
            + New task
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card px-4 py-3 flex flex-wrap gap-2 items-center text-sm">
        <select className="input !w-auto" value={f.bucket} onChange={(e) => setFilter('bucket', e.target.value)}>
          <option value="">All buckets</option>
          {buckets.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select className="input !w-auto max-w-[220px]" value={f.initiative} onChange={(e) => setFilter('initiative', e.target.value)}>
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
          <option value="blocked">Blocked</option>
          <option value="complete">Complete</option>
        </select>
        <input type="date" className="input !w-auto" value={f.from} onChange={(e) => setFilter('from', e.target.value)} title="Requested from" />
        <span className="text-slate-500">to</span>
        <input type="date" className="input !w-auto" value={f.to} onChange={(e) => setFilter('to', e.target.value)} title="Requested to" />
        {[...params.keys()].length > 0 && (
          <button className="btn-ghost" onClick={() => setParams({}, { replace: true })}>
            Clear
          </button>
        )}
      </div>

      {view === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {KANBAN_COLUMNS.map((col) => {
            const items = filtered.filter((t) => t.status === col.status);
            return (
              <div key={col.status} className="bg-navy-900/40 border border-faint rounded-xl p-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[13px] font-semibold tracking-[-0.01em] text-slate-300">{col.label}</span>
                  <span className="font-mono text-[11px] tabular-nums text-slate-500 bg-white/[0.05] border border-faint rounded-full px-2 py-0.5">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {items.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
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
              {filtered.map((t) => {
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
                        {t.estimatedHours != null && ` / ${t.estimatedHours}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 pr-5">
                      <span className="mono-meta">{fmtDate(t.submittedAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState>No tasks match the current filters</EmptyState>}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const contributors = [...new Set(task.assignments.map((a) => a.user.name))];
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="block card-elevated p-3.5 transition-all duration-150 hover:border-accent/40 hover:-translate-y-px hover:shadow-raised"
    >
      <div className="font-medium text-[13px] leading-snug text-ink">{task.title}</div>
      <div className="text-xs text-slate-500 mt-1.5">
        {task.requestedBy} · {task.bucket}
      </div>
      <div className="flex items-center justify-between mt-3.5">
        <span className="flex items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {task.isWip && <WipPill />}
          {!task.isWip && task.estimatedDueDate && (
            <span className="font-mono text-[11px] tabular-nums text-slate-500">{fmtDate(task.estimatedDueDate)}</span>
          )}
        </span>
        {contributors.length > 0 && <Avatars names={contributors} />}
      </div>
    </Link>
  );
}
