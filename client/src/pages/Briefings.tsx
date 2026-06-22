import { useState } from 'react';
import { marked } from 'marked';
import { api } from '../api';
import { useFetch } from '../hooks';
import { useToast } from '../context/ToastContext';
import { Spinner, ErrorNote, EmptyState, Modal, fmtDate, fmtDay } from '../components/ui';
import type { Briefing } from '../types';

// YYYY-MM-DD for `daysAgo` days before today (0 = today). Used to pre-fill the range
// pickers with the trailing week — the most common briefing window and the one the
// scheduled job uses.
function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export default function Briefings() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Briefing[]>('/api/briefings');
  const [selected, setSelected] = useState<Briefing | null>(null);
  // Date range for an on-demand briefing, defaulting to the trailing 7 days.
  const [from, setFrom] = useState(() => isoDaysAgo(7));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [busy, setBusy] = useState(false);

  // Generate a briefing for the chosen range. The server summarizes activity in the
  // window (per-person hours + tasks) and stores it; we reload to show it in the list.
  const generate = async () => {
    setBusy(true);
    try {
      await api('/api/briefings/generate', { method: 'POST', body: { from, to } });
      toast.success('Briefing generated');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">Your briefings</h1>
        <p className="text-[13px] text-muted mt-1">
          A snapshot of the hours you logged and the tasks you worked on over a date range — generated
          automatically each week and on demand. Only you can see your briefings.
        </p>
      </div>

      {/* Generate control: pick a date range (defaults to the trailing week) and build
          your own briefing. Available to every user — briefings are personal. */}
      <div className="card px-4 py-3 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="label">From</label>
          {/* max={to} keeps the start on/before the end so the range can't invert. */}
          <input type="date" className="input !w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input !w-auto" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={generate} disabled={busy || !from || !to}>
          {busy ? 'Generating…' : 'Generate briefing'}
        </button>
      </div>

      {(data || []).length === 0 ? (
        <div className="card p-8">
          <EmptyState>No briefings yet — generate your first one above</EmptyState>
        </div>
      ) : (
        <div className="space-y-2">
          {(data || []).map((b) => (
            <div key={b.id} className="card card-hover px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
              <button
                // Title is primary text (navy on light) with an aqua-text -> navy hover.
                className="text-left font-medium text-ink transition-colors hover:text-aqua-text"
                onClick={() => setSelected(b)}
              >
                {/* Range bounds are UTC calendar dates → format with fmtDay (UTC). */}
                {fmtDay(b.weekStart)} – {fmtDay(b.weekEnd)}
              </button>
              <span className="mono-meta">generated {fmtDate(b.generatedAt)}</span>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <Modal title={`${fmtDay(selected.weekStart)} – ${fmtDay(selected.weekEnd)}`} onClose={() => setSelected(null)} wide>
          <div
            // Rendered markdown viewer: h2 = navy heading, h3 = aqua-text subheading (both legible on the white modal).
            className="prose-briefing text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-navy [&_h3]:text-aqua-text [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5"
            dangerouslySetInnerHTML={{ __html: marked.parse(selected.content) as string }}
          />
        </Modal>
      )}
    </div>
  );
}
