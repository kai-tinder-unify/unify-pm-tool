import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch, useLabels, useUsers } from '../hooks';
import { Spinner, ErrorNote, EmptyState, fmtDate } from '../components/ui';
import { currentQuarter, quarterOf, quarterRange } from '../lib/quarters';
import type { Task } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Closed-tasks reporting view.
//
// A bounded, filterable record of work that has been closed, for after-the-fact
// reporting (e.g. "what did we wrap up last quarter, and who worked on it"). The
// board's Closed column only shows the current quarter; this page lets you page
// back through recent quarters, narrow by person or bucket, and export the
// filtered rows to CSV. Read-only — closing/reopening happens on the task itself.
// ─────────────────────────────────────────────────────────────────────────────

// How many recent quarters to offer in the dropdown (including the current one).
// 8 ≈ two years of history, enough for any practical reporting look-back without a
// runaway list; older closed work is still reachable by widening this if needed.
const QUARTERS_BACK = 8;

/** A quarter option for the dropdown: its key ("2026-2" = Q2 2026) and label. */
interface QuarterOption {
  key: string;
  label: string;
  q: number;
  year: number;
}

/**
 * Build the list of selectable quarters, newest first, starting from the current
 * calendar quarter and stepping back `QUARTERS_BACK` quarters. We decrement the
 * quarter number and roll the year back when it drops below Q1, so the list stays
 * a correct contiguous run across year boundaries.
 */
function recentQuarters(): QuarterOption[] {
  const cur = currentQuarter();
  const out: QuarterOption[] = [];
  let q = cur.q;
  let year = cur.year;
  for (let i = 0; i < QUARTERS_BACK; i++) {
    out.push({ key: `${year}-${q}`, label: `Q${q} ${year}`, q, year });
    // Step back one quarter, wrapping Q1 → Q4 of the previous year.
    q -= 1;
    if (q < 1) {
      q = 4;
      year -= 1;
    }
  }
  return out;
}

/** Distinct contributor names on a task, in assignment order. */
function contributorNames(t: Task): string[] {
  return [...new Set(t.assignments.map((a) => a.user.name))];
}

/**
 * RFC-4180-ish CSV field escaping: wrap in double quotes when the value contains a
 * comma, quote, or newline, doubling any embedded quotes. Mirrors the helper used
 * by the Proposals export so the two CSVs stay consistent.
 */
function csvField(value: string): string {
  const s = value ?? '';
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ClosedTasks() {
  const { buckets, initiatives } = useLabels();
  const { users } = useUsers(true); // include inactive so historical contributors still resolve
  const quarters = useMemo(recentQuarters, []);

  // Selected quarter (defaults to the current one — the first option) plus the
  // person/bucket/initiative filters that narrow the fetched set client-side.
  const [quarterKey, setQuarterKey] = useState(() => quarters[0].key);
  const [person, setPerson] = useState('');
  const [bucket, setBucket] = useState('');
  const [initiative, setInitiative] = useState('');

  const selected = quarters.find((opt) => opt.key === quarterKey) ?? quarters[0];

  // Server-side quarter window: pass the quarter's start/end as closedFrom/closedTo
  // so we only pull that quarter's closed rows. Dates are sent as plain YYYY-MM-DD;
  // the server treats closedTo as inclusive-to-end-of-day.
  const { start, end } = quarterRange(selected.q, selected.year);
  const qs = new URLSearchParams({
    status: 'closed',
    closedFrom: start.toISOString().slice(0, 10),
    closedTo: end.toISOString().slice(0, 10),
  }).toString();
  const { data, loading, error } = useFetch<Task[]>(`/api/tasks?${qs}`);

  // Apply the person/bucket/initiative filters in the client (cheap — the quarter set
  // is small).
  const rows = useMemo(() => {
    return (data || []).filter((t) => {
      // Report top-level tasks only — a closed subtask's work is represented by its
      // parent (e.g. a proposal), and the board nests subtasks under their parent
      // too, so listing them flat here would double-count and confuse the report.
      if (t.parentId != null) return false;
      if (bucket && t.bucket !== bucket) return false;
      if (initiative && t.initiative !== initiative) return false;
      if (person && !t.assignments.some((a) => a.userId === person)) return false;
      return true;
    });
  }, [data, bucket, initiative, person]);

  /**
   * Build + download the currently-filtered rows as a CSV, entirely client-side
   * (no server export endpoint). Columns match the spec: Title, Bucket, Requested
   * by, Contributors, Closed date, Quarter. The closed date/quarter come from
   * closedAt (falling back to updatedAt for any pre-closedAt row, same as the board).
   */
  const downloadCsv = () => {
    const header = ['Title', 'Bucket', 'Requested by', 'Contributors', 'Closed date', 'Quarter'];
    const body = rows.map((t) => {
      const closed = t.closedAt ?? t.updatedAt;
      return [
        t.title,
        t.bucket,
        t.requestedBy,
        contributorNames(t).join('; '),
        fmtDate(closed),
        quarterOf(closed).label,
      ];
    });
    const csv = [header, ...body].map((r) => r.map(csvField).join(',')).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Filename carries the quarter so multiple exports don't collide, e.g. closed-Q2-2026.csv.
    a.download = `closed-Q${selected.q}-${selected.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Closed tasks</h1>
          <p className="text-[13px] text-muted mt-1">
            Work wrapped up by quarter — filter and export for reporting
          </p>
        </div>
        <button className="btn-primary" onClick={downloadCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
      </div>

      {/* Filters: quarter (drives the fetch) + person + bucket (client-side). */}
      <div className="card px-4 py-3 flex flex-wrap gap-2 items-center text-sm">
        <select
          className="input !w-auto"
          value={quarterKey}
          onChange={(e) => setQuarterKey(e.target.value)}
          title="Quarter"
        >
          {quarters.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <select className="input !w-auto" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">All people</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select className="input !w-auto" value={bucket} onChange={(e) => setBucket(e.target.value)}>
          <option value="">All buckets</option>
          {buckets.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          className="input !w-auto max-w-[220px]"
          value={initiative}
          onChange={(e) => setInitiative(e.target.value)}
        >
          <option value="">All initiatives</option>
          {initiatives.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        {(person || bucket || initiative) && (
          <button
            className="btn-ghost"
            onClick={() => {
              setPerson('');
              setBucket('');
              setInitiative('');
            }}
          >
            Clear
          </button>
        )}
        <span className="ml-auto mono-meta">
          {rows.length} closed in {selected.label}
        </span>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-5">Task</th>
                <th className="th">Contributors</th>
                <th className="th">Bucket</th>
                <th className="th">Closed</th>
                <th className="th pr-5">Quarter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((t) => {
                const contributors = contributorNames(t);
                const closed = t.closedAt ?? t.updatedAt;
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
                    <td
                      className="px-4 py-3 text-muted text-xs max-w-[220px] truncate"
                      title={contributors.join(', ')}
                    >
                      {contributors.length > 0 ? contributors.join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{t.bucket}</td>
                    <td className="px-4 py-3">
                      <span className="mono-meta">{fmtDate(closed)}</span>
                    </td>
                    <td className="px-4 py-3 pr-5">
                      <span className="mono-meta">{quarterOf(closed).label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <EmptyState>No closed tasks match these filters in {selected.label}.</EmptyState>
          )}
        </div>
      )}
    </div>
  );
}
