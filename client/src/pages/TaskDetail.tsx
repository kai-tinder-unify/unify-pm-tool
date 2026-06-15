import { useState } from 'react';
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

  const [editOpen, setEditOpen] = useState(false);
  const [hoursModal, setHoursModal] = useState<Assignment | null | 'new'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 transition-colors hover:text-accent-hover"
        >
          ← Tasks
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white">{task.title}</h1>
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
          <label className="label">Requested by</label>
          <input
            className="input"
            defaultValue={task.requestedBy}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value.trim() !== task.requestedBy) {
                updateTask({ requestedBy: e.target.value.trim() });
              }
            }}
          />
        </div>
        <div>
          <label className="label">Requested</label>
          <div className="py-2"><span className="mono-meta !text-slate-300">{fmtDay(task.submittedAt)}</span></div>
        </div>
        <div>
          <label className="label">Logged by</label>
          <div className="py-2 text-slate-300">{task.createdBy.name}</div>
        </div>
        <div>
          <label className="label">Hours</label>
          <div className="py-2">
            <span className="font-mono text-xs tabular-nums text-slate-300">
              {Math.round(totalHours * 10) / 10} logged
              {task.estimatedHours != null && ` of ~${task.estimatedHours} est.`}
            </span>
          </div>
        </div>
        {task.description && (
          <div className="col-span-2 md:col-span-3">
            <label className="label">Description</label>
            <p className="text-slate-300 whitespace-pre-wrap">{task.description}</p>
          </div>
        )}
      </div>

      {/* Contributors — multiple people, individual hours */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <h2 className="section-title">
            Contributors{' '}
            <span className="font-mono text-xs tabular-nums text-slate-500 ml-1">({task.assignments.length})</span>
          </h2>
          <button className="btn-primary" onClick={() => setHoursModal(myAssignment || 'new')}>
            Log my hours
          </button>
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
              <tbody className="divide-y divide-white/[0.04]">
                {task.assignments.map((a) => (
                  <tr key={a.id} className="row-hover">
                    <td className="py-2.5 pr-3 font-medium text-ink">{a.user.name}</td>
                    <td className="py-2.5 pr-3"><span className="mono-meta">{fmtDay(a.startDate)}</span></td>
                    <td className="py-2.5 pr-3">
                      {a.endDate ? (
                        <span className="mono-meta">{fmtDay(a.endDate)}</span>
                      ) : (
                        <span className="pill bg-emerald-500/10 text-emerald-300 border-emerald-500/25">
                          <span className="pill-dot bg-emerald-400" />
                          active
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-ink">{a.hoursLogged}</td>
                    <td className="py-2.5 pr-3 text-slate-400 max-w-[200px] truncate">{a.notes || '—'}</td>
                    <td className="py-2.5 text-right whitespace-nowrap text-[13px] font-medium">
                      {(isAdmin || a.userId === user?.id) && (
                        <button
                          className="text-accent px-1.5 py-0.5 rounded transition-colors hover:text-accent-hover hover:bg-accent/10 mr-1"
                          onClick={() => setHoursModal(a)}
                        >
                          Edit
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          className="text-red-400/70 px-1.5 py-0.5 rounded transition-colors hover:text-red-300 hover:bg-red-500/10"
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
          <p className="text-sm text-slate-300 mb-4">
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
