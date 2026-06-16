import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useFetch, useLabels, useUsers } from '../hooks';
import { useToast } from '../context/ToastContext';
import { StatusBadge } from '../components/ui';
import type { Task } from '../types';

type DueMode = 'unset' | 'date' | 'wip';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Meaningful words only — drop short filler so "the/for/and" don't inflate matches. */
const keywords = (s: string) => new Set(normalize(s).split(' ').filter((w) => w.length > 2));

/**
 * 0–1 similarity between two titles. Overlap coefficient on keywords (robust to
 * different lengths), bumped to a strong match when one title contains the other.
 */
function titleSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na.length >= 4 && (nb.includes(na) || na.includes(nb))) return 0.95;
  const A = keywords(a);
  const B = keywords(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => {
    if (B.has(w)) inter++;
  });
  return inter / Math.min(A.size, B.size);
}

export default function NewTask() {
  const navigate = useNavigate();
  const toast = useToast();
  const { buckets, initiatives } = useLabels();
  const { users } = useUsers();
  const tasks = useFetch<Task[]>('/api/tasks');

  // Distinct leaders from existing tasks — pick from the list to avoid misspellings.
  const leaders = useMemo(
    () => [...new Set((tasks.data || []).map((t) => t.requestedBy).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [tasks.data],
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [addingLeader, setAddingLeader] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(new Date().toISOString().slice(0, 10));
  const [bucket, setBucket] = useState('');
  const [initiative, setInitiative] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [ownerId, setOwnerId] = useState('');
  const [dueMode, setDueMode] = useState<DueMode>('unset');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  // No prior leaders to choose from → fall back to free text entry.
  useEffect(() => {
    if (!tasks.loading && leaders.length === 0) setAddingLeader(true);
  }, [tasks.loading, leaders.length]);

  // Live duplicate check: surface existing tasks whose titles look similar so two
  // people don't open the same work twice. Non-blocking — just a heads-up.
  const possibleDuplicates = useMemo(() => {
    const q = title.trim();
    if (q.length < 4) return [];
    return (tasks.data || [])
      .map((t) => ({ task: t, score: titleSimilarity(q, t.title) }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.task);
  }, [title, tasks.data]);

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
          {possibleDuplicates.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-3">
              <div className="flex items-center gap-2 text-[13px] font-medium text-amber-200">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 1.5L15 14H1L8 1.5z" strokeLinejoin="round" />
                  <path d="M8 6.5v3.5M8 12h.01" strokeLinecap="round" />
                </svg>
                Possible duplicate{possibleDuplicates.length > 1 ? 's' : ''}
              </div>
              <p className="text-xs text-amber-200/70 mt-1 mb-2.5">
                A similar task already exists — open it to check before creating a new one.
              </p>
              <ul className="space-y-1.5">
                {possibleDuplicates.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <Link
                      to={`/tasks/${t.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink truncate transition-colors hover:text-accent-hover"
                    >
                      {t.title}
                    </Link>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400">for {t.requestedBy}</span>
                      <StatusBadge status={t.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs to be done to complete this task?"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Leader Supported *</label>
            {addingLeader ? (
              <div className="flex gap-2">
                <input
                  className="input"
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="e.g. Sandra Liu"
                  autoFocus
                  required
                />
                {leaders.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    onClick={() => {
                      setAddingLeader(false);
                      setRequestedBy('');
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <select
                className="input"
                value={requestedBy}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setAddingLeader(true);
                    setRequestedBy('');
                  } else {
                    setRequestedBy(e.target.value);
                  }
                }}
                required
              >
                <option value="">Select…</option>
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
        <div className="grid grid-cols-2 gap-4">
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
