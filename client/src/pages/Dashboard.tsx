import { Link } from 'react-router-dom';
import { useFetch } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import { PriorityBadge, StatusBadge, WipPill, Spinner, ErrorNote, EmptyState, fmtDate, fmtDay } from '../components/ui';
import type { Task } from '../types';
import { useState } from 'react';

interface Summary {
  openTasks: number;
  tasksInProgress: number;
  completedThisWeek: number;
  hoursThisMonth: number;
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const summary = useFetch<Summary>('/api/analytics/summary');
  const tasks = useFetch<Task[]>('/api/tasks');
  const [pinging, setPinging] = useState(false);

  const allTasks: Task[] = tasks.data || [];

  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const dueSoon = allTasks
    .filter((t) => t.status !== 'complete' && !t.isWip && t.estimatedDueDate && new Date(t.estimatedDueDate) <= soon)
    .sort((a, b) => new Date(a.estimatedDueDate!).getTime() - new Date(b.estimatedDueDate!).getTime());
  const wipTasks = allTasks.filter((t) => t.isWip && t.status !== 'complete');
  const myTasks = allTasks.filter(
    (t) =>
      t.status !== 'complete' &&
      (t.ownerId === user?.id || t.assignments.some((a) => a.userId === user?.id && !a.endDate)),
  );
  const recentActivity = [...allTasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const sendPings = async () => {
    setPinging(true);
    try {
      const res = await api<{ results: { user: string; sent: boolean }[] }>('/api/checkins/send', {
        method: 'POST',
      });
      const sent = res.results.filter((r) => r.sent).length;
      toast.success(sent > 0 ? `Check-in pings sent to ${sent} team member${sent === 1 ? '' : 's'}` : 'No pings due — everyone is up to date or recently pinged');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPinging(false);
    }
  };

  if (tasks.loading || summary.loading) return <Spinner />;
  if (tasks.error) return <ErrorNote message={tasks.error} />;

  const cards = [
    { label: 'Open tasks', value: summary.data?.openTasks ?? 0 },
    { label: 'Tasks in progress', value: summary.data?.tasksInProgress ?? 0 },
    { label: 'Completed this week', value: summary.data?.completedThisWeek ?? 0 },
    { label: 'Hours this month', value: summary.data?.hoursThisMonth ?? 0 },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Dashboard</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <button className="btn-secondary" onClick={sendPings} disabled={pinging}>
              {pinging ? 'Sending…' : 'Send pings now'}
            </button>
          )}
          <Link to="/intake" className="btn-primary">
            + New task
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card card-hover px-5 py-4">
            {/* KPI figure: Fraunces 300 navy via .display-figure (was text-white, invisible on light paper). tabular-nums keeps digits aligned. */}
            <div className="display-figure text-[26px] leading-none tabular-nums">{c.value}</div>
            {/* Stat label: muted grey for secondary/meta text (was text-slate-500, slightly too faint on paper). */}
            <div className="text-xs text-muted mt-2">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* This week */}
        <div className="card p-6">
          <h2 className="section-title mb-4">This week</h2>
          <h3 className="micro-title mb-2">Due soon</h3>
          {dueSoon.length === 0 ? (
            <EmptyState>Nothing due in the next 7 days</EmptyState>
          ) : (
            <ul className="mb-4">
              {dueSoon.slice(0, 5).map((t) => (
                <li key={t.id} className="list-row py-2 flex items-center justify-between gap-2 text-sm">
                  {/* Title link hovers to navy (was accent-hover, which was a dark-theme bright-aqua hover). */}
                  <Link to={`/tasks/${t.id}`} className="truncate transition-colors hover:text-navy">
                    {t.title}
                  </Link>
                  <span className="flex items-center gap-2 shrink-0">
                    <PriorityBadge priority={t.priority} />
                    <span className="mono-meta">{fmtDay(t.estimatedDueDate)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {wipTasks.length > 0 && (
            <>
              <h3 className="micro-title mb-2 mt-5">WIP tasks</h3>
              <ul>
                {wipTasks.slice(0, 4).map((t) => (
                  <li key={t.id} className="list-row py-2 flex items-center justify-between gap-2 text-sm">
                    {/* Title link hovers to navy (was accent-hover bright-aqua dark-theme hover). */}
                    <Link to={`/tasks/${t.id}`} className="truncate transition-colors hover:text-navy">
                      {t.title}
                    </Link>
                    <WipPill />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Your tasks */}
        <div className="card p-6">
          <h2 className="section-title mb-4">Your tasks at a glance</h2>
          {myTasks.length === 0 ? (
            <EmptyState>No active assignments — enjoy the calm</EmptyState>
          ) : (
            <ul>
              {myTasks.slice(0, 6).map((t) => (
                <li key={t.id} className="list-row py-2 flex items-center justify-between gap-2 text-sm">
                  {/* Title link hovers to navy (was accent-hover bright-aqua dark-theme hover). */}
                  <Link to={`/tasks/${t.id}`} className="truncate transition-colors hover:text-navy">
                    {t.title}
                  </Link>
                  <span className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={t.status} />
                    {t.isWip ? <WipPill /> : t.estimatedDueDate ? (
                      <span className="mono-meta">{fmtDay(t.estimatedDueDate)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* Call-to-action link: AA-safe aqua text, hovers to navy (was bright text-accent/accent-hover from dark theme). */}
          <Link
            to="/my-work"
            className="text-aqua-text text-[13px] font-medium mt-4 inline-block transition-colors hover:text-navy"
          >
            Go to My work →
          </Link>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card p-6">
        <h2 className="section-title mb-4">Recent activity</h2>
        {recentActivity.length === 0 ? (
          <EmptyState>No activity yet</EmptyState>
        ) : (
          // Row dividers: hairline grey (was divide-white/[0.04], a white-alpha idiom that was invisible on light paper).
          <ul className="divide-y divide-line">
            {recentActivity.map((t) => (
              <li key={t.id} className="list-row py-2.5 flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {/* Title link hovers to navy (was accent-hover bright-aqua dark-theme hover). */}
                  <Link to={`/tasks/${t.id}`} className="transition-colors hover:text-navy">
                    {t.title}
                  </Link>
                  {/* Requester meta: muted grey to match other secondary text (was text-slate-500). */}
                  <span className="text-muted"> — for {t.requestedBy}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={t.status} />
                  <span className="mono-meta">{fmtDate(t.updatedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* Call-to-action link: AA-safe aqua text, hovers to navy (was bright text-accent/accent-hover from dark theme). */}
        <Link
          to="/analytics"
          className="text-aqua-text text-[13px] font-medium mt-4 inline-block transition-colors hover:text-navy"
        >
          Full analytics →
        </Link>
      </div>
    </div>
  );
}
