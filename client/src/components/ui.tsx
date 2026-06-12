import { ReactNode } from 'react';
import type { Priority, TaskStatus } from '../types';

const priorityStyles: Record<Priority, { pill: string; dot: string }> = {
  high: { pill: 'bg-red-500/10 text-red-300 border-red-500/25', dot: 'bg-red-400' },
  medium: { pill: 'bg-amber-500/10 text-amber-300 border-amber-500/25', dot: 'bg-amber-400' },
  low: { pill: 'bg-white/[0.04] text-slate-400 border-white/[0.08]', dot: 'bg-slate-500' },
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

export function WipPill() {
  return (
    <span className="pill bg-gold/10 text-gold border-gold/30">
      <span className="pill-dot bg-gold" />
      WIP
    </span>
  );
}

const statusLabels: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  complete: 'Complete',
};

const statusStyles: Record<string, { pill: string; dot: string }> = {
  not_started: { pill: 'bg-white/[0.04] text-slate-400 border-white/[0.08]', dot: 'bg-slate-500' },
  in_progress: { pill: 'bg-accent/10 text-accent-hover border-accent/25', dot: 'bg-accent' },
  blocked: { pill: 'bg-red-500/10 text-red-300 border-red-500/25', dot: 'bg-red-400' },
  complete: { pill: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25', dot: 'bg-emerald-400' },
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

export function Avatars({ names }: { names: string[] }) {
  return (
    <div className="flex -space-x-1.5">
      {names.slice(0, 4).map((n, i) => (
        <span
          key={i}
          title={n}
          className="w-6 h-6 rounded-full bg-gradient-to-br from-navy-700 to-navy-850 border border-black/40 text-[10px] text-ink flex items-center justify-center font-medium"
        >
          {n
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')}
        </span>
      ))}
      {names.length > 4 && (
        <span className="w-6 h-6 rounded-full bg-navy-850 border border-black/40 text-[10px] text-slate-400 flex items-center justify-center font-mono">
          +{names.length - 4}
        </span>
      )}
    </div>
  );
}

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
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px] flex items-start justify-center pt-16 px-4 overflow-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`animate-modal-in w-full bg-navy-800 border border-strong rounded-xl shadow-modal ${
          wide ? 'max-w-2xl' : 'max-w-md'
        } mb-16`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 -mr-1.5 rounded-md flex items-center justify-center text-slate-500 transition-colors hover:text-ink hover:bg-white/[0.06]"
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

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.08] text-red-200 text-sm px-4 py-3">
      {message}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center text-slate-600 text-[13px] py-12">{children}</div>;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "YYYY-MM-DD" for date inputs. */
export function toInputDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}
