import { useMemo, useState } from 'react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { useFetch, useLabels } from '../hooks';
import { Modal, toInputDate } from './ui';
import Combobox from './Combobox';
import type { Task } from '../types';

type DueMode = 'unset' | 'date' | 'wip';

/** Edit a task's full details. Due date / WIP is a three-state toggle. */
export default function TaskFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { buckets, initiatives } = useLabels();
  const tasks = useFetch<Task[]>('/api/tasks');
  // Distinct leaders from existing tasks for the searchable picker (free text still allowed).
  const leaders = useMemo(
    () => [...new Set((tasks.data || []).map((t) => t.requestedBy).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [tasks.data],
  );

  const [title, setTitle] = useState(existing.title);
  const [description, setDescription] = useState(existing.description || '');
  const [requestedBy, setRequestedBy] = useState(existing.requestedBy);
  const [submittedAt, setSubmittedAt] = useState(toInputDate(existing.submittedAt));
  const [priority, setPriority] = useState(existing.priority);
  const [status, setStatus] = useState(existing.status);
  const [targetStartDate, setTargetStartDate] = useState(toInputDate(existing.targetStartDate));
  const [dueMode, setDueMode] = useState<DueMode>(
    existing.isWip ? 'wip' : existing.estimatedDueDate ? 'date' : 'unset',
  );
  const [dueDate, setDueDate] = useState(toInputDate(existing.estimatedDueDate));
  const [bucket, setBucket] = useState(existing.bucket);
  const [initiative, setInitiative] = useState(existing.initiative || '');
  const [salesforceOpportunity, setSalesforceOpportunity] = useState(existing.salesforceOpportunity || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast.error('Task title is required');
      return;
    }
    if (!requestedBy.trim()) {
      toast.error('Leader Supported is required');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/tasks/${existing.id}`, {
        method: 'PUT',
        body: {
          title,
          description: description || null,
          requestedBy,
          submittedAt: submittedAt || existing.submittedAt,
          priority,
          status,
          targetStartDate: targetStartDate || null,
          isWip: dueMode === 'wip',
          estimatedDueDate: dueMode === 'date' && dueDate ? dueDate : null,
          bucket,
          initiative: initiative || null,
          salesforceOpportunity: salesforceOpportunity || null,
        },
      });
      toast.success('Task updated');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit task" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <label className="label">Title *</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Leader Supported *</label>
            <Combobox
              value={requestedBy}
              onChange={setRequestedBy}
              options={leaders}
              placeholder="Search or type a leader…"
              newLabel={(v) => `Add “${v}” as a new leader`}
            />
          </div>
          <div>
            <label className="label">Date requested</label>
            <input type="date" className="input" value={submittedAt} onChange={(e) => setSubmittedAt(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Priority *</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="paused">Paused</option>
              <option value="blocked">Blocked</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="label">Target start date</label>
            <input
              type="date"
              className="input"
              value={targetStartDate}
              onChange={(e) => setTargetStartDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Timeline</label>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={dueMode === 'unset'} onChange={() => setDueMode('unset')} />
              Not set
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={dueMode === 'date'} onChange={() => setDueMode('date')} />
              Estimated due date
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={dueMode === 'wip'} onChange={() => setDueMode('wip')} />
              WIP — no fixed end date
            </label>
          </div>
          {dueMode === 'date' && (
            <input
              type="date"
              className="input mt-2 max-w-xs"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Bucket</label>
            <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value)}>
              {buckets.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Initiative (optional)</label>
            <select className="input" value={initiative} onChange={(e) => setInitiative(e.target.value)}>
              <option value="">None</option>
              {initiatives.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Salesforce opportunity — optional, primarily for proposals (see NewTask). */}
        <div>
          <label className="label">Salesforce opportunity</label>
          <input
            className="input"
            value={salesforceOpportunity}
            onChange={(e) => setSalesforceOpportunity(e.target.value)}
            placeholder="Opportunity link or ID — e.g. https://…/Opportunity/006… or 006…"
          />
          <p className="text-xs text-muted mt-1">
            Optional. Used to match proposals to influenced revenue.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
