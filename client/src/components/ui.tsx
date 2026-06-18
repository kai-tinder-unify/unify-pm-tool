import { ReactNode } from 'react';
import type { Priority, TaskStatus } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives (status/priority pills, avatars, modal chrome, spinner,
// notes). This file is the single source of truth for badge styling, so the
// status/priority color language lives here.
//
// Re-skinned for the Unify Command Center light theme: every chip is now a
// "tint background + same-hue dark text + matching border" pairing (replacing
// the old pale-text-on-dark, white-alpha-fill chips that were unreadable on a
// light surface). Semantic mapping: aqua = in-progress, green = complete/done,
// red = blocked/high, amber = paused/medium, yellow = WIP emphasis, neutral
// (paper-deep + muted) = not-started/low.
// ─────────────────────────────────────────────────────────────────────────────

// Priority → chip styles. `pill` is the bg/text/border trio; `dot` is the leading dot.
const priorityStyles: Record<Priority, { pill: string; dot: string }> = {
  high: { pill: 'bg-danger-bg text-danger border-danger-border', dot: 'bg-danger' },
  medium: { pill: 'bg-warn-bg text-warn border-warn-border', dot: 'bg-warn' },
  // Low priority is intentionally neutral so it recedes next to high/medium.
  low: { pill: 'bg-paper-deep text-muted border-line', dot: 'bg-[#C2C2C2]' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = priorityStyles[priority];
  return (
    <span className={`pill capitalize ${s.pill}`}>
      <span className={`pill-dot ${s.dot}`} />
      {priority}
    </span>
  );
}

// WIP (work-in-progress / ongoing, no due date) uses the brand yellow as emphasis.
// Yellow has poor text contrast, so the chip pairs a pale-yellow fill with dark
// amber text and a bright-yellow dot — legible while still reading as "yellow".
export function WipPill() {
  return (
    <span className="pill bg-yellow-soft text-yellow-deep border-[#f0e3a0]">
      <span className="pill-dot bg-yellow" />
      WIP
    </span>
  );
}

const statusLabels: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  paused: 'Paused',
  blocked: 'Blocked',
  complete: 'Complete',
};

const statusStyles: Record<string, { pill: string; dot: string }> = {
  not_started: { pill: 'bg-paper-deep text-muted border-line', dot: 'bg-[#C2C2C2]' },
  // In-progress is the "active" state → brand aqua (the one decorative accent).
  in_progress: { pill: 'bg-aqua-light text-aqua-text border-aqua/30', dot: 'bg-aqua' },
  paused: { pill: 'bg-warn-bg text-warn border-warn-border', dot: 'bg-warn' },
  blocked: { pill: 'bg-danger-bg text-danger border-danger-border', dot: 'bg-danger' },
  complete: { pill: 'bg-success-bg text-success border-success-border', dot: 'bg-success' },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const s = statusStyles[status];
  return (
    <span className={`pill ${s.pill}`}>
      <span className={`pill-dot ${s.dot}`} />
      {statusLabels[status]}
    </span>
  );
}

// Stacked initials avatars. Light theme: pale-aqua tile with navy initials and a
// hairline border (was a dark navy gradient with light ink, which only worked on
// a dark surface). Overflow "+N" chip uses the recessed paper-deep fill.
export function Avatars({ names }: { names: string[] }) {
  return (
    <div className="flex -space-x-1.5">
      {names.slice(0, 4).map((n, i) => (
        <span
          key={i}
          title={n}
          className="w-6 h-6 rounded-full bg-aqua-light border border-line text-[10px] text-navy flex items-center justify-center font-semibold"
        >
          {n
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')}
        </span>
      ))}
      {names.length > 4 && (
        <span className="w-6 h-6 rounded-full bg-paper-deep border border-line text-[10px] text-muted flex items-center justify-center font-mono">
          +{names.length - 4}
        </span>
      )}
    </div>
  );
}

// Centered modal dialog. Light theme: white panel + hairline border + soft modal
// shadow, navy title, and a navy-tinted (not near-black) backdrop scrim.
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-navy/40 backdrop-blur-[2px] flex items-start justify-center pt-16 px-4 overflow-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`animate-modal-in w-full bg-white border border-line rounded-xl shadow-modal ${
          wide ? 'max-w-2xl' : 'max-w-md'
        } mb-16`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-navy">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 -mr-1.5 rounded-md flex items-center justify-center text-muted transition-colors hover:text-navy hover:bg-paper-deep"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// Loading spinner — aqua ring (brand accent) on a transparent top edge.
export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Inline error banner — danger tint + dark danger text (was pale red-on-dark).
export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger-border bg-danger-bg text-danger text-sm px-4 py-3">
      {message}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center text-muted text-[13px] py-12">{children}</div>;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Formats a calendar-day value (due date, requested date, start/end) — stored at
 * UTC midnight — by its UTC day, so the day shown matches the day picked
 * regardless of the viewer's timezone. Use fmtDate for true timestamps instead.
 */
export function fmtDay(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "YYYY-MM-DD" for date inputs. */
export function toInputDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Salesforce opportunity capture (for proposals → influenced-revenue matching).
// The tool has no concept of "proposal" beyond the `Proposal/Delivery Support`
// bucket, so we treat that whole bucket as "proposals" for the nudge below.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when a task's bucket is the proposal bucket (`Proposal/Delivery Support`).
 * Matched by substring (case-insensitive) rather than an exact string so it keeps
 * working if the bucket label is ever renamed or another "Proposal …" bucket is
 * added — the goal is just "is this proposal-ish work that should carry an SF link".
 */
export function isProposalBucket(bucket: string): boolean {
  return bucket.toLowerCase().includes('proposal');
}

/**
 * Pull a Salesforce Opportunity Id (15- or 18-char, "006" key-prefix) out of a
 * pasted link or raw value, so the UI can surface the stable ID even when handed a
 * full Lightning URL. Returns null when no opportunity-shaped token is present.
 */
function extractOpportunityId(value: string): string | null {
  const m = value.match(/\b006[0-9A-Za-z]{12}(?:[0-9A-Za-z]{3})?\b/);
  return m ? m[0] : null;
}

const externalLinkIcon = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
    <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" strokeLinecap="round" />
    <path d="M9.5 2.5H13.5V6.5M13 3L7.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Renders a captured Salesforce opportunity value. A URL becomes a new-tab link
 * (labelled with the opportunity Id when one can be extracted, else "Open"); a
 * bare Id is shown as selectable mono text — we can't build a link from an Id
 * alone because the org's Salesforce instance URL isn't known to this tool.
 */
export function SalesforceLink({ value, className = '' }: { value: string; className?: string }) {
  const v = value.trim();
  const isUrl = /^https?:\/\//i.test(v);
  if (isUrl) {
    const label = extractOpportunityId(v) ?? 'Open';
    return (
      <a
        href={v}
        target="_blank"
        rel="noreferrer"
        title={v}
        className={`inline-flex items-center gap-1 font-mono text-xs text-aqua-text hover:text-navy transition-colors ${className}`}
      >
        <span className="truncate">{label}</span>
        {externalLinkIcon}
      </a>
    );
  }
  // Not a URL — show the raw Id/value as copyable mono text (title carries the full value).
  return (
    <span className={`font-mono text-xs text-ink ${className}`} title={v}>
      {v}
    </span>
  );
}

const warningTriangle = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
    <path d="M8 1.5L15 14H1L8 1.5z" strokeLinejoin="round" />
    <path d="M8 6.5v3.5M8 12h.01" strokeLinecap="round" />
  </svg>
);

/**
 * Passive amber flag shown on a proposal that has no Salesforce opportunity yet —
 * the cue for whoever has Salesforce access (an Ascender or solution/delivery) to
 * add it. Uses the shared `warn` trio so it reads correctly on the light theme.
 * `compact` swaps to a shorter label for tight spots like board cards.
 */
export function NeedsSfBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="pill bg-warn-bg text-warn border-warn-border"
      title="No Salesforce opportunity linked yet — needed to match this proposal to influenced revenue"
    >
      {warningTriangle}
      {compact ? 'Needs SF link' : 'Needs Salesforce opportunity'}
    </span>
  );
}
