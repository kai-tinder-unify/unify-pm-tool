import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useFetch, useLabels, useUsers } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PriorityBadge, StatusBadge, WipPill, Spinner, ErrorNote, fmtDay, Modal } from '../components/ui';
import TaskFormModal from '../components/TaskFormModal';
import LogHoursModal from '../components/LogHoursModal';
import type { Task, Assignment } from '../types';

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { buckets, initiatives } = useLabels();
  const { users } = useUsers();
  const { data: task, loading, error, reload } = useFetch<Task>(`/api/tasks/${id}`);
  const allTasks = useFetch<Task[]>('/api/tasks');

  const [editOpen, setEditOpen] = useState(false);
  const [hoursModal, setHoursModal] = useState<Assignment | null | 'new'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingLeader, setAddingLeader] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [pinging, setPinging] = useState(false);

  // Distinct leaders from every task (plus this one's current value, so the
  // dropdown always has a matching option to show).
  const leaders = useMemo(() => {
    const set = new Set((allTasks.data || []).map((t) => t.requestedBy).filter(Boolean));
    if (task?.requestedBy) set.add(task.requestedBy);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allTasks.data, task?.requestedBy]);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!task) return null;

  const myAssignment = task.assignments.find((a) => a.userId === user?.id) || null;
  const totalHours = task.assignments.reduce((s, a) => s + a.hoursLogged, 0);

  const updateTask = async (patch: Record<string, unknown>) => {
    try {
      await api(`/api/tasks/${task.id}`, { method: 'PUT', body: patch });
      toast.success('Task updated');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Admin-only manual nudge to the task owner and all contributors in Teams — no cooldown.
  const sendPing = async () => {
    setPinging(true);
    try {
      const res = await api<{ message: string }>(`/api/tasks/${task.id}/ping`, { method: 'POST' });
      toast.success(res.message);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPinging(false);
    }
  };

  const doDelete = async () => {
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      toast.success('Task deleted');
      navigate('/tasks');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirmDelete(false);
    }
  };

  // Join the task: upserts the current user's assignment with 0 hours so they
  // show up as a contributor. Once attached, the button becomes "Log my hours".
  const attachMyself = async () => {
    setAttaching(true);
    try {
      await api(`/api/tasks/${task.id}/assignments`, {
        method: 'POST',
        body: { startDate: new Date().toISOString().slice(0, 10), hoursLogged: 0 },
      });
      toast.success("You're now on this task");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAttaching(false);
    }
  };

  const deleteAssignment = async (a: Assignment) => {
    try {
      await api(`/api/assignments/${a.id}`, { method: 'DELETE' });
      toast.success('Assignment removed');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link
          to="/tasks"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 transition-colors hover:text-aqua-text"
        >
          ← Tasks
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div className="min-w-0">
            {/* Page title sits on the light paper background, so it must use the navy brand ink rather than white. */}
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-navy">{task.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <PriorityBadge priority={task.priority} />
              <StatusBadge status={task.status} />
              {task.isWip ? (
                <WipPill />
              ) : task.estimatedDueDate ? (
                <span className="mono-meta">due {fmtDay(task.estimatedDueDate)}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                className="btn-secondary"
                onClick={sendPing}
                disabled={pinging || (!task.owner && task.assignments.length === 0)}
                title={
                  task.owner || task.assignments.length > 0
                    ? 'Ping the owner and all contributors in Teams'
                    : 'Add an owner or contributor to enable pinging'
                }
              >
                {pinging ? 'Pinging…' : 'Send ping'}
              </button>
            )}
            <button className="btn-secondary" onClick={() => setEditOpen(true)}>
              Edit task
            </button>
            {isAdmin && (
              <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metadata — inline editable by any member */}
      <div className="card p-6 grid grid-cols-2 md:grid-cols-3 gap-5 text-sm">
        <div>
          <label className="label">Status</label>
          <select className="input" value={task.status} onChange={(e) => updateTask({ status: e.target.value })}>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="paused">Paused</option>
            <option value="blocked">Blocked</option>
            <option value="complete">Complete</option>
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="input" value={task.priority} onChange={(e) => updateTask({ priority: e.target.value })}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="label">Owner</label>
          <select className="input" value={task.ownerId || ''} onChange={(e) => updateTask({ ownerId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Bucket</label>
          <select className="input" value={task.bucket} onChange={(e) => updateTask({ bucket: e.target.value })}>
            {buckets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Initiative</label>
          <select
            className="input"
            value={task.initiative || ''}
            onChange={(e) => updateTask({ initiative: e.target.value || null })}
          >
            <option value="">None</option>
            {initiatives.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Leader Supported</label>
          {addingLeader ? (
            <div className="flex gap-2">
              <input
                className="input"
                autoFocus
                placeholder="e.g. Sandra Liu"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== task.requestedBy) updateTask({ requestedBy: v });
                  setAddingLeader(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={() => setAddingLeader(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <select
              className="input"
              value={task.requestedBy}
              onChange={(e) => {
                if (e.target.value === '__new__') setAddingLeader(true);
                else if (e.target.value !== task.requestedBy) updateTask({ requestedBy: e.target.value });
              }}
            >
              {leaders.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="__new__">+ Add new leader…</option>
            </select>
          )}
        </div>
        <div>
          <label className="label">Entry date</label>
          <div className="py-2"><span className="mono-meta !text-muted">{fmtDay(task.submittedAt)}</span></div>
        </div>
        <div>
          <label className="label">Logged by</label>
          <div className="py-2 text-muted">{task.createdBy.name}</div>
        </div>
        <div>
          <label className="label">Hours</label>
          <div className="py-2">
            <span className="font-mono text-xs tabular-nums text-muted">
              {Math.round(totalHours * 10) / 10} logged
            </span>
          </div>
        </div>
        {task.description && (
          <div className="col-span-2 md:col-span-3">
            <label className="label">Description</label>
            <p className="text-muted whitespace-pre-wrap">{task.description}</p>
          </div>
        )}
      </div>

      {/* Contributors — multiple people, individual hours */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="section-title">
            Contributors{' '}
            <span className="font-mono text-xs tabular-nums text-slate-500 ml-1">({task.assignments.length})</span>
          </h2>
          {myAssignment ? (
            <button className="btn-primary" onClick={() => setHoursModal(myAssignment)}>
              Log Hours
            </button>
          ) : (
            <button className="btn-primary" onClick={attachMyself} disabled={attaching}>
              {attaching ? 'Joining…' : 'Join Task'}
            </button>
          )}
        </div>
        <div className="px-6 py-4">
          {task.assignments.length === 0 ? (
            <p className="text-[13px] text-slate-600 py-4 text-center">
              No one has logged work on this task yet — be the first.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th !px-0 pr-3">Contributor</th>
                  <th className="th !px-0 pr-3">Start</th>
                  <th className="th !px-0 pr-3">End</th>
                  <th className="th !px-0 pr-3">Hours</th>
                  <th className="th !px-0 pr-3">Notes</th>
                  <th className="th !px-0"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {task.assignments.map((a) => (
                  <tr key={a.id} className="row-hover">
                    <td className="py-2.5 pr-3 font-medium text-ink">{a.user.name}</td>
                    <td className="py-2.5 pr-3"><span className="mono-meta">{fmtDay(a.startDate)}</span></td>
                    <td className="py-2.5 pr-3">
                      {a.endDate ? (
                        <span className="mono-meta">{fmtDay(a.endDate)}</span>
                      ) : (
                        // "active" = no end date yet: success tint trio (light-mode safe) with a solid success dot.
                        <span className="pill bg-success-bg text-success border-success-border">
                          <span className="pill-dot bg-success" />
                          active
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-ink">{a.hoursLogged}</td>
                    <td className="py-2.5 pr-3 text-muted max-w-[200px] truncate">{a.notes || '—'}</td>
                    <td className="py-2.5 text-right whitespace-nowrap text-[13px] font-medium">
                      {(isAdmin || a.userId === user?.id) && (
                        <button
                          className="text-aqua-text px-1.5 py-0.5 rounded transition-colors hover:text-navy hover:bg-aqua/10 mr-1"
                          onClick={() => setHoursModal(a)}
                        >
                          Edit
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          className="text-danger/80 px-1.5 py-0.5 rounded transition-colors hover:text-danger hover:bg-danger-bg"
                          onClick={() => deleteAssignment(a)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editOpen && <TaskFormModal existing={task} onClose={() => setEditOpen(false)} onSaved={reload} />}
      {hoursModal && (
        <LogHoursModal
          task={task}
          existing={hoursModal === 'new' ? null : hoursModal}
          onClose={() => setHoursModal(null)}
          onSaved={reload}
        />
      )}
      {confirmDelete && (
        <Modal title="Delete task" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-muted mb-4">
            Delete <strong>{task.title}</strong>? This cannot be undone and removes all logged hours.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button className="btn-danger" onClick={doDelete}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
