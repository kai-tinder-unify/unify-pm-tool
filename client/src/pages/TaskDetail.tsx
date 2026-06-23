import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useFetch, useLabels } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  PriorityBadge,
  StatusBadge,
  Spinner,
  ErrorNote,
  fmtDay,
  Modal,
  SalesforceLink,
  NeedsSfBadge,
  isProposalBucket,
} from '../components/ui';
import TaskFormModal from '../components/TaskFormModal';
import LogHoursModal from '../components/LogHoursModal';
import Combobox from '../components/Combobox';
import type { Task, Assignment, Priority } from '../types';

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { buckets, initiatives } = useLabels();
  const { data: task, loading, error, reload } = useFetch<Task>(`/api/tasks/${id}`);
  const allTasks = useFetch<Task[]>('/api/tasks');

  const [editOpen, setEditOpen] = useState(false);
  const [hoursModal, setHoursModal] = useState<Assignment | null | 'new'>(null);
  // When set, opens the Log-hours modal for a specific subtask (logging the current
  // user's hours against that child task) rather than this top-level task.
  const [subtaskHours, setSubtaskHours] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaderDraft, setLeaderDraft] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [pinging, setPinging] = useState(false);
  // Inline "add subtask" control state: the in-progress title text and an
  // in-flight guard so a double-submit can't create two subtasks.
  const [subtaskTitle, setSubtaskTitle] = useState('');
  // Priority chosen for the next subtask added via the inline control. Subtasks are
  // lightweight, so priority is the only field set at creation time; everything else
  // is inherited (bucket/leader) or defaulted (status → not_started).
  const [subtaskPriority, setSubtaskPriority] = useState<Priority>('medium');
  const [addingSubtask, setAddingSubtask] = useState(false);

  // Distinct leaders from every task (plus this one's current value, so the
  // dropdown always has a matching option to show).
  const leaders = useMemo(() => {
    const set = new Set((allTasks.data || []).map((t) => t.requestedBy).filter(Boolean));
    if (task?.requestedBy) set.add(task.requestedBy);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allTasks.data, task?.requestedBy]);

  // Keep the inline leader picker's draft in sync with the saved value (after a
  // save + refetch, or when switching tasks). The picker commits on select/blur.
  useEffect(() => {
    if (task?.requestedBy != null) setLeaderDraft(task.requestedBy);
  }, [task?.requestedBy]);

  // Subtasks are managed inline under their parent and have no standalone page. If
  // someone lands on a subtask URL directly (an old link, a stray bookmark), bounce
  // them up to the parent where the subtask actually lives. Runs as an effect so we
  // never call navigate() during render; `replace` keeps the dead URL out of history.
  useEffect(() => {
    if (task?.parentId) navigate(`/tasks/${task.parentId}`, { replace: true });
  }, [task?.parentId, navigate]);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!task) return null;
  // While the redirect effect above runs, render nothing rather than flash the
  // (now unsupported) subtask detail layout.
  if (task.parentId) return null;

  const myAssignment = task.assignments.find((a) => a.userId === user?.id) || null;
  const totalHours = task.assignments.reduce((s, a) => s + a.hoursLogged, 0);

  // This task's subtasks (only ever populated on a top-level task).
  const subtasks = task.subtasks ?? [];

  const updateTask = async (patch: Record<string, unknown>) => {
    try {
      await api(`/api/tasks/${task.id}`, { method: 'PUT', body: patch });
      toast.success('Task updated');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Admin-only manual nudge to all contributors in Teams — no cooldown.
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

  // Create a subtask under this task. Subtasks inherit the parent's bucket (the
  // server also enforces this), carry the same requested-by leader for continuity,
  // take the priority picked in the inline control, and start at the default
  // not_started status. We reload afterward so the new subtask shows up below.
  const addSubtask = async () => {
    const title = subtaskTitle.trim();
    if (!title) return;
    setAddingSubtask(true);
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: {
          title,
          requestedBy: task.requestedBy,
          bucket: task.bucket,
          priority: subtaskPriority,
          parentId: task.id,
        },
      });
      setSubtaskTitle('');
      setSubtaskPriority('medium'); // reset to the default for the next add
      toast.success('Subtask added');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingSubtask(false);
    }
  };

  // Patch a single subtask in place (status or priority) from its inline row. Hits
  // the same task PUT endpoint as the parent, just targeted at the child id, then
  // reloads so the row and the board's subtask roll-up reflect the change. Kept
  // toast-free: these are quick dropdown tweaks and a toast per change would be noisy.
  const updateSubtask = async (subtaskId: string, patch: Record<string, unknown>) => {
    try {
      await api(`/api/tasks/${subtaskId}`, { method: 'PUT', body: patch });
      reload();
    } catch (e: any) {
      toast.error(e.message);
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
              {/* Due date when present. WIP/ongoing tasks carry no due date, so nothing
                  shows here — the yellow WIP badge was removed. */}
              {task.estimatedDueDate ? (
                <span className="mono-meta">due {fmtDay(task.estimatedDueDate)}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                className="btn-secondary"
                onClick={sendPing}
                disabled={pinging || task.assignments.length === 0}
                title={
                  task.assignments.length > 0
                    ? 'Ping all contributors in Teams'
                    : 'Add a contributor to enable pinging'
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
            <option value="closed">Closed</option>
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
          <Combobox
            value={leaderDraft}
            onChange={setLeaderDraft}
            options={leaders}
            placeholder="Search or type a leader…"
            newLabel={(v) => `Add “${v}” as a new leader`}
            onCommit={(v) => {
              const t = v.trim();
              if (t && t !== task.requestedBy) updateTask({ requestedBy: t });
            }}
          />
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
        {/* Salesforce opportunity — inline-editable free text (link or ID), so anyone
            with Salesforce access can fill it in without opening the edit modal. The
            input is keyed by the saved value so it remounts with fresh text after a
            save+reload. A proposal with no link shows the passive amber nudge. */}
        <div className="col-span-2 md:col-span-3">
          <label className="label">Salesforce opportunity</label>
          <input
            key={task.salesforceOpportunity || 'none'}
            className="input"
            defaultValue={task.salesforceOpportunity || ''}
            placeholder="Opportunity link or ID — e.g. https://…/Opportunity/006… or 006…"
            onBlur={(e) => {
              const v = e.target.value.trim();
              // Only write when the value actually changed (avoids a no-op PUT + toast
              // every time the field loses focus).
              if (v !== (task.salesforceOpportunity || '')) updateTask({ salesforceOpportunity: v || null });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          {task.salesforceOpportunity ? (
            <div className="mt-1.5">
              <SalesforceLink value={task.salesforceOpportunity} />
            </div>
          ) : isProposalBucket(task.bucket) ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <NeedsSfBadge />
              <span className="text-xs text-muted">
                Ask an Ascender with Salesforce access or the solution/delivery team to add it.
              </span>
            </div>
          ) : null}
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

      {/* Subtasks — one level of child tasks. Only shown on a top-level task: a
          subtask itself can't have children (the server rejects deeper nesting), and
          hiding the empty section there keeps a subtask's page focused. */}
      {!task.parentId && (
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-line">
            <h2 className="section-title">
              Subtasks{' '}
              <span className="font-mono text-xs tabular-nums text-slate-500 ml-1">({subtasks.length})</span>
            </h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            {subtasks.length === 0 ? (
              <p className="text-[13px] text-slate-600 py-2 text-center">
                No subtasks yet — break this work down below.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {subtasks.map((s) => {
                  // Active contributors = assignments with no end date, mirroring the
                  // board card's "who's on it" cue.
                  const contribs = s.assignments.filter((a) => !a.endDate).map((a) => a.user.name);
                  // Hours roll up from every contributor's logged time (active or not),
                  // matching how the parent task's total is computed above.
                  const subHours = s.assignments.reduce((sum, a) => sum + a.hoursLogged, 0);
                  // "Logged by" = whoever added the subtask. createdBy is always set
                  // server-side; guard only against an older cached shape missing it.
                  const loggedBy = s.createdBy?.name ?? 'Unknown';
                  return (
                    <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        {/* Title is plain text now — subtasks have no standalone page;
                            everything about them is edited inline on this row. */}
                        <div className="font-medium text-[13px] text-ink truncate">{s.title}</div>
                        {/* Meta line: logged by · entry date · contributors. */}
                        <div className="text-xs text-muted mt-0.5 truncate">
                          Logged by {loggedBy} · {fmtDay(s.submittedAt)}
                          {contribs.length > 0 ? ` · ${contribs.join(', ')}` : ''}
                        </div>
                      </div>
                      {/* Inline controls: hours total, priority + status selects, and a
                          shortcut to log the current user's hours against this subtask. */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="mono-meta tabular-nums">{subHours}h</span>
                        <select
                          className="input !w-auto !py-1 text-xs"
                          value={s.priority}
                          onChange={(e) => updateSubtask(s.id, { priority: e.target.value })}
                        >
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                        <select
                          className="input !w-auto !py-1 text-xs"
                          value={s.status}
                          onChange={(e) => updateSubtask(s.id, { status: e.target.value })}
                        >
                          <option value="not_started">Not started</option>
                          <option value="in_progress">In progress</option>
                          <option value="paused">Paused</option>
                          <option value="blocked">Blocked</option>
                          <option value="closed">Closed</option>
                        </select>
                        <button
                          type="button"
                          className="text-aqua-text text-[13px] font-medium px-2 py-1 rounded-md transition-colors hover:text-navy hover:bg-aqua/10 shrink-0"
                          onClick={() => setSubtaskHours(s)}
                        >
                          Log hours
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {/* Inline add-subtask control: title + priority + button. Enter submits.
                The new subtask inherits this task's bucket and leader (see addSubtask)
                and takes the selected priority; status defaults to not_started. */}
            <div className="flex gap-2 pt-1">
              <input
                className="input"
                placeholder="Add a subtask…"
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
              />
              <select
                className="input !w-auto shrink-0"
                value={subtaskPriority}
                onChange={(e) => setSubtaskPriority(e.target.value as Priority)}
                aria-label="Subtask priority"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button
                type="button"
                className="btn-primary shrink-0"
                onClick={addSubtask}
                disabled={addingSubtask || !subtaskTitle.trim()}
              >
                {addingSubtask ? 'Adding…' : 'Add subtask'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && <TaskFormModal existing={task} onClose={() => setEditOpen(false)} onSaved={reload} />}
      {hoursModal && (
        <LogHoursModal
          task={task}
          existing={hoursModal === 'new' ? null : hoursModal}
          onClose={() => setHoursModal(null)}
          onSaved={reload}
        />
      )}
      {/* Log the current user's hours against a subtask. existing=null so the modal
          upserts this user's own assignment on the child task; reloading the parent
          refreshes the subtask's rolled-up hours total. */}
      {subtaskHours && (
        <LogHoursModal
          task={subtaskHours}
          existing={null}
          onClose={() => setSubtaskHours(null)}
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
