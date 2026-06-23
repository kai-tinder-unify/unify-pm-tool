import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useFetch, useLabels } from '../hooks';
import { useToast } from '../context/ToastContext';
import { StatusBadge } from '../components/ui';
import Combobox from '../components/Combobox';
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
  const tasks = useFetch<Task[]>('/api/tasks');

  // Distinct leaders from existing tasks — pick from the list to avoid misspellings.
  const leaders = useMemo(
    () => [...new Set((tasks.data || []).map((t) => t.requestedBy).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [tasks.data],
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [submittedAt, setSubmittedAt] = useState(new Date().toISOString().slice(0, 10));
  const [bucket, setBucket] = useState('');
  const [initiative, setInitiative] = useState('');
  const [salesforceOpportunity, setSalesforceOpportunity] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [dueMode, setDueMode] = useState<DueMode>('unset');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

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
          salesforceOpportunity: salesforceOpportunity || null,
          priority,
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
            // Warning/amber treatment for the non-blocking duplicate heads-up: on the
            // light theme the old amber-500 alpha fills were near-invisible, so use the
            // shared warn tint tokens (soft bg + AA-safe dark amber text + amber border).
            <div className="mt-2 rounded-lg border border-warn-border bg-warn-bg px-3.5 py-3">
              <div className="flex items-center gap-2 text-[13px] font-medium text-warn">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 1.5L15 14H1L8 1.5z" strokeLinejoin="round" />
                  <path d="M8 6.5v3.5M8 12h.01" strokeLinecap="round" />
                </svg>
                Possible duplicate{possibleDuplicates.length > 1 ? 's' : ''}
              </div>
              {/* Slightly de-emphasized warn text for the body copy under the heading. */}
              <p className="text-xs text-warn/80 mt-1 mb-2.5">
                A similar task already exists — open it to check before creating a new one.
              </p>
              <ul className="space-y-1.5">
                {possibleDuplicates.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <Link
                      to={`/tasks/${t.id}`}
                      target="_blank"
                      rel="noreferrer"
                      // Duplicate link: ink is correct on the light card; deepen to navy
                      // on hover (old bright-aqua hover read poorly as a text color).
                      className="font-medium text-ink truncate transition-colors hover:text-navy"
                    >
                      {t.title}
                    </Link>
                    <span className="flex items-center gap-2 shrink-0">
                      {/* Meta caption — slate-400 was too faint on paper, use muted token. */}
                      <span className="text-xs text-muted">for {t.requestedBy}</span>
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
            <Combobox
              value={requestedBy}
              onChange={setRequestedBy}
              options={leaders}
              placeholder="Search or type a leader…"
              required
              newLabel={(v) => `Add “${v}” as a new leader`}
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
        {/* Salesforce opportunity — optional, primarily for proposals. Captured so the
            (external) influenced-revenue dashboard can match this work to a dollar
            amount by opportunity rather than by fuzzy title/leader matching. */}
        <div>
          <label className="label">Salesforce opportunity</label>
          <input
            className="input"
            value={salesforceOpportunity}
            onChange={(e) => setSalesforceOpportunity(e.target.value)}
            placeholder="Opportunity link or ID — e.g. https://…/Opportunity/006… or 006…"
          />
          <p className="text-xs text-muted mt-1">
            Optional. Mainly for proposals — used to match them to influenced revenue. Ask an
            Ascender with Salesforce access if you don't have it.
          </p>
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
