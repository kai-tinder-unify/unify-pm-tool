import { useState } from 'react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { Modal, toInputDate } from './ui';
import type { Assignment, Task } from '../types';

/**
 * Create/update an assignment. For the current user it upserts via the task
 * endpoint; when an admin edits someone else's record it PUTs the assignment.
 * All dates may be set to any past or future value (retrospective logging).
 */
export default function LogHoursModal({
  task,
  existing,
  onClose,
  onSaved,
}: {
  task: Task;
  existing: Assignment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [startDate, setStartDate] = useState(toInputDate(existing?.startDate));
  const [endDate, setEndDate] = useState(toInputDate(existing?.endDate));
  const [hours, setHours] = useState(existing ? String(existing.hoursLogged) : '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        startDate: startDate || null,
        endDate: endDate || null,
        hoursLogged: hours === '' ? 0 : Number(hours),
        notes: notes || null,
      };
      if (existing) {
        await api(`/api/assignments/${existing.id}`, { method: 'PUT', body });
      } else {
        await api(`/api/tasks/${task.id}/assignments`, { method: 'POST', body });
      }
      toast.success('Hours saved');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Log hours — ${task.title}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">End date</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            {/* Helper text uses text-muted (the AA-safe secondary ink) — slate-500 read fine on the old navy theme but text-muted is the standard meta color on the new light paper surface */}
            <p className="text-[11px] text-muted mt-1">Leave empty while still active</p>
          </div>
        </div>
        <div>
          <label className="label">Total hours logged</label>
          <input
            type="number"
            min="0"
            step="0.5"
            className="input"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="e.g. 6.5"
          />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context for the team"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
