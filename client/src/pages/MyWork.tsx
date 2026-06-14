import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PriorityBadge, StatusBadge, WipPill, Spinner, ErrorNote, EmptyState, fmtDay } from '../components/ui';
import LogHoursModal from '../components/LogHoursModal';
import type { Task, Assignment } from '../types';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export default function MyWork() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Task[]>('/api/tasks');
  const [hoursModal, setHoursModal] = useState<{ task: Task; existing: Assignment | null } | null>(null);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  const allTasks: Task[] = data || [];

  const mine = allTasks.filter(
    (t) => t.ownerId === user?.id || t.assignments.some((a) => a.userId === user?.id && !a.endDate),
  );
  const open = mine.filter((t) => t.status !== 'complete');
  const wip = open.filter((t) => t.isWip);
  const dated = open
    .filter((t) => !t.isWip)
    .sort((a, b) => {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      const da = a.estimatedDueDate ? new Date(a.estimatedDueDate).getTime() : Infinity;
      const db = b.estimatedDueDate ? new Date(b.estimatedDueDate).getTime() : Infinity;
      return da - db;
    });

  // Hours summaries from my assignments
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const myAssignments = allTasks.flatMap((t) => t.assignments.filter((a) => a.userId === user?.id));
  const hoursWeek = myAssignments
    .filter((a) => new Date(a.updatedAt) >= weekAgo)
    .reduce((s, a) => s + a.hoursLogged, 0);
  const hoursMonth = myAssignments
    .filter((a) => new Date(a.updatedAt) >= monthStart)
    .reduce((s, a) => s + a.hoursLogged, 0);
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const dueSoonCount = open.filter(
    (t) => !t.isWip && t.estimatedDueDate && new Date(t.estimatedDueDate) <= soon,
  ).length;

  const updateStatus = async (taskId: string, status: string) => {
    try {
      await api(`/api/tasks/${taskId}`, { method: 'PUT', body: { status } });
      toast.success('Status updated');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const summary = [
    { label: 'Hours updated this week', value: Math.round(hoursWeek * 10) / 10 },
    { label: 'Hours updated this month', value: Math.round(hoursMonth * 10) / 10 },
    { label: 'Tasks in progress', value: open.filter((t) => t.status === 'in_progress').length },
    { label: 'Due in next 7 days', value: dueSoonCount },
  ];

  const TaskRow = ({ task }: { task: Task }) => {
    const myAssignment = task.assignments.find((a) => a.userId === user?.id) || null;
    return (
      <div className="card card-hover px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/tasks/${task.id}`} className="font-medium text-ink transition-colors hover:text-accent-hover">
              {task.title}
            </Link>
            <PriorityBadge priority={task.priority} />
            {task.isWip ? (
              <WipPill />
            ) : task.estimatedDueDate ? (
              <span className="mono-meta">due {fmtDay(task.estimatedDueDate)}</span>
            ) : null}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            for {task.requestedBy} · {task.bucket}
            {myAssignment && (
              <span className="font-mono tabular-nums"> · {myAssignment.hoursLogged} hrs logged</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="text-accent text-[13px] font-medium px-2 py-1 rounded-md transition-colors hover:text-accent-hover hover:bg-accent/10"
            onClick={() => setHoursModal({ task, existing: myAssignment })}
          >
            Log hours
          </button>
          <select
            className="input !w-auto !py-1 text-xs"
            value={task.status}
            onChange={(e) => updateStatus(task.id, e.target.value)}
          >
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="paused">Paused</option>
            <option value="blocked">Blocked</option>
            <option value="complete">Complete</option>
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="page-title">My work</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summary.map((c) => (
          <div key={c.label} className="card card-hover px-5 py-4">
            <div className="text-[26px] font-semibold tracking-tight text-white leading-none tabular-nums">{c.value}</div>
            <div className="text-xs text-slate-500 mt-2">{c.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="section-title mb-3">Upcoming</h2>
        {dated.length === 0 ? (
          <EmptyState>No dated tasks on your plate</EmptyState>
        ) : (
          <div className="space-y-2">
            {dated.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>

      {wip.length > 0 && (
        <div>
          <h2 className="section-title mb-3">WIP — ongoing</h2>
          <div className="space-y-2">
            {wip.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}

      {hoursModal && (
        <LogHoursModal
          task={hoursModal.task}
          existing={hoursModal.existing}
          onClose={() => setHoursModal(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
