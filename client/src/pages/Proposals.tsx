import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../hooks';
import {
  Spinner,
  ErrorNote,
  EmptyState,
  StatusBadge,
  SalesforceLink,
  NeedsSfBadge,
  isProposalBucket,
  fmtDay,
  fmtDate,
} from '../components/ui';
import type { Task, TaskStatus } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Proposals → Salesforce (admin-only).
//
// The bridge between this tool and the (external) influenced-revenue dashboard:
// every proposal task with its captured Salesforce opportunity link/ID, the gaps
// still missing one, and a CSV export so the mapping can be pulled in and joined
// to dollar amounts. Read-only — editing the link happens on the task itself.
// ─────────────────────────────────────────────────────────────────────────────

// Human-readable status labels for the on-screen table and the CSV (mirrors the
// labels used by the StatusBadge component, kept here so the export reads cleanly).
const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  paused: 'Paused',
  blocked: 'Blocked',
  complete: 'Complete',
};

/** Sum of every contributor's logged hours on a task, rounded to 0.1h. */
function totalHours(t: Task): number {
  return Math.round(t.assignments.reduce((s, a) => s + a.hoursLogged, 0) * 10) / 10;
}

/** Distinct contributor names on a task, in assignment order. */
function contributorNames(t: Task): string[] {
  return [...new Set(t.assignments.map((a) => a.user.name))];
}

/**
 * RFC-4180-ish CSV field escaping: wrap in double quotes when the value contains a
 * comma, quote, or newline, doubling any embedded quotes. Keeps pasted Salesforce
 * URLs and free-text leader names from breaking the column layout.
 */
function csvField(value: string): string {
  const s = value ?? '';
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Proposals() {
  const { data, loading, error } = useFetch<Task[]>('/api/tasks');
  // When on, hides proposals that already have a link so the remaining gaps stand out.
  const [onlyMissing, setOnlyMissing] = useState(false);

  // All proposal-bucket tasks, newest request first (matches the API's default order).
  const proposals = useMemo(
    () => (data || []).filter((t) => isProposalBucket(t.bucket)),
    [data],
  );

  const linkedCount = proposals.filter((t) => !!t.salesforceOpportunity).length;
  const missingCount = proposals.length - linkedCount;

  const rows = useMemo(
    () => (onlyMissing ? proposals.filter((t) => !t.salesforceOpportunity) : proposals),
    [proposals, onlyMissing],
  );

  // Build + download the proposal↔opportunity mapping as CSV, entirely client-side
  // (no server endpoint needed — the data is already loaded). "Completed" uses
  // updatedAt for complete tasks, the same proxy the board uses for completion date.
  const downloadCsv = () => {
    const header = [
      'Title',
      'Leader',
      'Contributors',
      'Status',
      'Bucket',
      'Date requested',
      'Completed',
      'Hours',
      'Salesforce opportunity',
      'Linked',
    ];
    const body = proposals.map((t) => [
      t.title,
      t.requestedBy,
      contributorNames(t).join('; '),
      STATUS_LABELS[t.status],
      t.bucket,
      fmtDay(t.submittedAt),
      t.status === 'complete' ? fmtDate(t.updatedAt) : '',
      String(totalHours(t)),
      t.salesforceOpportunity || '',
      t.salesforceOpportunity ? 'yes' : 'no',
    ]);
    const csv = [header, ...body].map((r) => r.map(csvField).join(',')).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proposals-salesforce-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Proposals</h1>
          <p className="text-[13px] text-muted mt-1">
            Salesforce opportunity links for matching proposals to influenced revenue
          </p>
        </div>
        <button className="btn-primary" onClick={downloadCsv} disabled={proposals.length === 0}>
          Download CSV
        </button>
      </div>

      {/* Summary strip: how many proposals, how many linked vs. still missing. */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="pill bg-paper-deep text-muted border-line">
          <span className="font-semibold tabular-nums text-ink">{proposals.length}</span> proposals
        </span>
        <span className="pill bg-success-bg text-success border-success-border">
          <span className="font-semibold tabular-nums">{linkedCount}</span> linked
        </span>
        <span className={`pill ${missingCount > 0 ? 'bg-warn-bg text-warn border-warn-border' : 'bg-paper-deep text-muted border-line'}`}>
          <span className="font-semibold tabular-nums">{missingCount}</span> missing
        </span>
        <label className="flex items-center gap-2 cursor-pointer ml-1 text-muted">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Only missing
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th pl-5">Proposal</th>
              <th className="th">Leader</th>
              <th className="th">Contributors</th>
              <th className="th">Status</th>
              <th className="th">Hours</th>
              <th className="th">Requested</th>
              <th className="th pr-5">Salesforce opportunity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((t) => {
              const contributors = contributorNames(t);
              return (
                <tr key={t.id} className="row-hover">
                  <td className="px-4 py-3 pl-5">
                    <Link
                      to={`/tasks/${t.id}`}
                      className="font-medium text-ink transition-colors hover:!text-aqua-text"
                    >
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{t.requestedBy}</td>
                  <td className="px-4 py-3 text-muted text-xs max-w-[200px] truncate" title={contributors.join(', ')}>
                    {contributors.length > 0 ? contributors.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs tabular-nums text-muted">{totalHours(t)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="mono-meta">{fmtDay(t.submittedAt)}</span>
                  </td>
                  <td className="px-4 py-3 pr-5">
                    {t.salesforceOpportunity ? (
                      <SalesforceLink value={t.salesforceOpportunity} />
                    ) : (
                      <NeedsSfBadge compact />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <EmptyState>
            {proposals.length === 0
              ? 'No proposals yet — tasks in the Proposal/Delivery Support bucket show up here.'
              : 'Every proposal has a Salesforce opportunity linked. 🎉'}
          </EmptyState>
        )}
      </div>
    </div>
  );
}
