import { useState } from 'react';
import { marked } from 'marked';
import { api } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner, ErrorNote, EmptyState, Modal, fmtDate } from '../components/ui';
import type { Briefing } from '../types';

export default function Briefings() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Briefing[]>('/api/briefings');
  const [selected, setSelected] = useState<Briefing | null>(null);
  const [sendModal, setSendModal] = useState<Briefing | null>(null);
  const [viaEmail, setViaEmail] = useState(true);
  const [viaTeams, setViaTeams] = useState(false);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      await api('/api/briefings/generate', { method: 'POST' });
      toast.success('Briefing generated');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!sendModal) return;
    setBusy(true);
    try {
      await api(`/api/briefings/${sendModal.id}/send`, {
        method: 'POST',
        body: { viaEmail, viaTeams },
      });
      toast.success('Briefing sent');
      setSendModal(null);
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
      <div className="flex items-center justify-between">
        <h1 className="page-title">Weekly briefings</h1>
        {isAdmin && (
          <button className="btn-primary" onClick={generate} disabled={busy}>
            {busy ? 'Working…' : 'Generate now'}
          </button>
        )}
      </div>

      {(data || []).length === 0 ? (
        <div className="card p-8">
          <EmptyState>No briefings yet{isAdmin ? ' — generate the first one' : ''}</EmptyState>
        </div>
      ) : (
        <div className="space-y-2">
          {(data || []).map((b) => (
            <div key={b.id} className="card card-hover px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
              <button
                className="text-left font-medium text-ink transition-colors hover:text-accent-hover"
                onClick={() => setSelected(b)}
              >
                Week of {fmtDate(b.weekStart)} – {fmtDate(b.weekEnd)}
              </button>
              <div className="flex items-center gap-2 text-xs">
                {!b.sentViaEmail && !b.sentViaTeams && (
                  <span className="pill bg-white/[0.04] text-slate-400 border-white/[0.08]">
                    <span className="pill-dot bg-slate-500" />
                    Draft
                  </span>
                )}
                {b.sentViaEmail && (
                  <span className="pill bg-emerald-500/10 text-emerald-300 border-emerald-500/25">
                    <span className="pill-dot bg-emerald-400" />
                    Email sent
                  </span>
                )}
                {b.sentViaTeams && (
                  <span className="pill bg-accent/10 text-accent-hover border-accent/25">
                    <span className="pill-dot bg-accent" />
                    Teams sent
                  </span>
                )}
                <span className="mono-meta">generated {fmtDate(b.generatedAt)}</span>
                {isAdmin && (
                  <button
                    className="btn-secondary !py-1 !px-3"
                    onClick={() => {
                      setSendModal(b);
                      setViaEmail(true);
                      setViaTeams(false);
                    }}
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <Modal title={`Week of ${fmtDate(selected.weekStart)}`} onClose={() => setSelected(null)} wide>
          <div
            className="prose-briefing text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h3]:text-gold [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5"
            dangerouslySetInnerHTML={{ __html: marked.parse(selected.content) as string }}
          />
        </Modal>
      )}

      {sendModal && (
        <Modal title="Send briefing" onClose={() => setSendModal(null)}>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={viaEmail} onChange={(e) => setViaEmail(e.target.checked)} />
              Email distribution list
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={viaTeams} onChange={(e) => setViaTeams(e.target.checked)} />
              Teams channel webhook
            </label>
            <div className="flex justify-end gap-2 pt-3">
              <button className="btn-secondary" onClick={() => setSendModal(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={send} disabled={busy || (!viaEmail && !viaTeams)}>
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
