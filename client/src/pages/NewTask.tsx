import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useLabels, useUsers } from '../hooks';
import { useToast } from '../context/ToastContext';
import type { Task } from '../types';

type DueMode = 'unset' | 'date' | 'wip';

export default function NewTask() {
  const navigate = useNavigate();
  const toast = useToast();
  const { buckets, initiatives } = useLabels();
  const { users } = useUsers();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [submittedAt, setSubmittedAt] = useState(new Date().toISOString().slice(0, 10));
  const [bucket, setBucket] = useState('');
  const [initiative, setInitiative] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [ownerId, setOwnerId] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [dueMode, setDueMode] = useState<DueMode>('unset');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bucket) {
      toast.error('Bucket is required');
      return;
    }
    setSaving(true);
    try {
      const task = await api<Task>('/api/tasks', {
        method: 'POST',
        body: {
          title,
          description: description || null,
          requestedBy,
          submittedAt,
          bucket,
          initiative: initiative || null,
          priority,
          ownerId: ownerId || null,
          estimatedHours: estimatedHours === '' ? null : Number(estimatedHours),
          isWip: dueMode === 'wip',
          estimatedDueDate: dueMode === 'date' && dueDate ? dueDate : null,
        },
      });
      toast.success('Task created');
      navigate(`/tasks/${task.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="page-title">New task</h1>
      <form onSubmit={submit} className="card p-7 space-y-5">
        <div>
          <label className="label">Title *</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does the leader need, and by when?"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Requested by (leader) *</label>
            <input
              className="input"
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
              placeholder="e.g. Sandra Liu"
              required
            />
          </div>
          <div>
            <label className="label">Date requested</label>
            <input type="date" className="input" value={submittedAt} onChange={(e) => setSubmittedAt(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Bucket *</label>
            <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value)} required>
              <option value="">Select…</option>
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
            <label className="label">Owner</label>
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Estimated hours</label>
            <input
              type="number"
              min="0"
              step="0.5"
              className="input"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
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

        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </form>
    </div>
  );
}
