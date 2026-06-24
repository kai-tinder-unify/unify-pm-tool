import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFetch, useUsers } from '../hooks';
import { useToast } from '../context/ToastContext';
import { Spinner, ErrorNote, Modal } from '../components/ui';
import type { Settings as SettingsType, User } from '../types';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function Settings() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<SettingsType>('/api/settings');
  const { allUsers, reload: reloadUsers } = useUsers(true);

  const [form, setForm] = useState<Record<string, string>>({});
  const [bucketsText, setBucketsText] = useState('');
  const [initiativesText, setInitiativesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [userModal, setUserModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });

  useEffect(() => {
    if (!data) return;
    setForm({
      defaultPingTime: data.defaultPingTime || '08:00',
      pingEnabled: data.pingEnabled || 'true',
      briefingDay: data.briefingDay || 'friday',
      briefingTime: data.briefingTime || '16:00',
      briefingEnabled: data.briefingEnabled || 'true',
      // Per-category Teams webhooks — the only Teams config now (the shared default
      // channel field was removed). A blank value disables that notification type.
      teamsWebhookPings: data.teamsWebhookPings || '',
      teamsWebhookDaily: data.teamsWebhookDaily || '',
      teamsWebhookTaskCreated: data.teamsWebhookTaskCreated || '',
      teamsPingEnabled: data.teamsPingEnabled || 'false',
      // Capacity (advisory): level→hours mapping and the soft reference line.
      capacityHoursLow: data.capacityHoursLow || '30',
      capacityHoursMedium: data.capacityHoursMedium || '40',
      capacityHoursHigh: data.capacityHoursHigh || '50',
      capacitySoftTargetHours: data.capacitySoftTargetHours || '40',
    });
    try {
      setBucketsText((JSON.parse(data.buckets || '[]') as string[]).join('\n'));
      setInitiativesText((JSON.parse(data.initiatives || '[]') as string[]).join('\n'));
    } catch {
      // keep empty on parse failure
    }
  }, [data]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {
        ...form,
        buckets: JSON.stringify(bucketsText.split('\n').map((s) => s.trim()).filter(Boolean)),
        initiatives: JSON.stringify(initiativesText.split('\n').map((s) => s.trim()).filter(Boolean)),
      };
      await api('/api/settings', { method: 'PUT', body });
      toast.success('Settings saved');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const testTeams = async () => {
    try {
      const res = await api<{ message: string }>('/api/settings/test-teams', { method: 'POST', body: {} });
      toast.success(res.message);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await api(`/api/users/${u.id}`, { method: 'PUT', body: { isActive: !u.isActive } });
      toast.success(u.isActive ? `${u.name} deactivated` : `${u.name} reactivated`);
      reloadUsers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="page-title">Settings</h1>

      {/* User management */}
      <section className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">User management</h2>
          <button className="btn-primary" onClick={() => setUserModal({ open: true, user: null })}>
            + Add user
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th !px-0 pr-3">Name</th>
              <th className="th !px-0 pr-3">Email</th>
              <th className="th !px-0 pr-3">Role</th>
              <th className="th !px-0 pr-3">Ping time</th>
              <th className="th !px-0 pr-3">Status</th>
              <th className="th !px-0"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {allUsers.map((u) => (
              <tr key={u.id} className={`row-hover ${u.isActive ? '' : 'opacity-50'}`}>
                <td className="py-3 pr-3 font-medium text-ink">{u.name}</td>
                {/* Secondary/meta text reads as muted on the light paper surface (slate-400 was too faint) */}
                <td className="py-3 pr-3 text-muted">{u.email}</td>
                <td className="py-3 pr-3 capitalize text-muted">{u.role}</td>
                <td className="py-3 pr-3">
                  <span className="mono-meta">{u.pingTime || 'team default'}</span>
                </td>
                <td className="py-3 pr-3">
                  {u.isActive ? (
                    // Active = success tint trio (tint bg + dark AA-safe text + soft border) for light surfaces
                    <span className="pill bg-success-bg text-success border-success-border">
                      <span className="pill-dot bg-success" />
                      Active
                    </span>
                  ) : (
                    // Deactivated = neutral chip; the old white-overlay fill was invisible on paper
                    <span className="pill bg-paper-deep text-muted border-line">
                      <span className="pill-dot bg-muted" />
                      Deactivated
                    </span>
                  )}
                </td>
                <td className="py-3 text-right whitespace-nowrap text-[13px] font-medium">
                  <button
                    // Link-style action: AA-safe aqua text -> navy on hover, aqua tint hover well
                    className="text-aqua-text px-2 py-1 rounded-md transition-colors hover:text-navy hover:bg-aqua/10 mr-1"
                    onClick={() => setUserModal({ open: true, user: u })}
                  >
                    Edit
                  </button>
                  <button
                    // Muted secondary action -> navy on hover with a recessed paper-deep hover well
                    className="text-muted px-2 py-1 rounded-md transition-colors hover:text-navy hover:bg-paper-deep"
                    onClick={() => toggleActive(u)}
                  >
                    {u.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Buckets & initiatives */}
      <section className="card p-6 space-y-4">
        <h2 className="section-title">Buckets &amp; initiatives</h2>
        <p className="text-xs text-muted">One label per line. Changes apply everywhere immediately — no deploy needed.</p>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Buckets</label>
            <textarea className="input" rows={4} value={bucketsText} onChange={(e) => setBucketsText(e.target.value)} />
          </div>
          <div>
            <label className="label">Initiatives</label>
            <textarea className="input" rows={4} value={initiativesText} onChange={(e) => setInitiativesText(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Capacity (advisory client-engagement view) */}
      <section className="card p-6 space-y-4">
        <h2 className="section-title">Capacity</h2>
        <p className="text-xs text-muted">
          Client-hours baseline per self-reported engagement level, and the soft reference line the
          Capacity page measures everyone against. Advisory only — nothing is blocked or capped.
        </p>
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="label">Low hours</label>
            <input
              type="number"
              className="input"
              value={form.capacityHoursLow || ''}
              onChange={(e) => set('capacityHoursLow', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Medium hours</label>
            <input
              type="number"
              className="input"
              value={form.capacityHoursMedium || ''}
              onChange={(e) => set('capacityHoursMedium', e.target.value)}
            />
          </div>
          <div>
            <label className="label">High hours</label>
            <input
              type="number"
              className="input"
              value={form.capacityHoursHigh || ''}
              onChange={(e) => set('capacityHoursHigh', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Soft target</label>
            <input
              type="number"
              className="input"
              value={form.capacitySoftTargetHours || ''}
              onChange={(e) => set('capacitySoftTargetHours', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Teams notifications — three per-category channel webhooks. Each routes one
          class of notification to its own Teams channel; a blank field disables that
          notification type. (The old shared "default channel" webhook was removed.) */}
      <section className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Microsoft Teams notifications</h2>
          <button className="btn-secondary" onClick={testTeams}>
            Send test message
          </button>
        </div>
        <p className="text-xs text-muted">
          For each channel, add a <span className="font-medium text-ink">Workflows</span> automation from the
          "Post to a channel when a webhook request is received" template in Teams, then paste its URL below.
        </p>

        <div className="grid gap-4">
          <div>
            <label className="label">Reminder pings channel webhook</label>
            <input
              className="input"
              value={form.teamsWebhookPings || ''}
              onChange={(e) => set('teamsWebhookPings', e.target.value)}
            />
            <p className="text-xs text-muted mt-1">
              Per-task "Send ping" nudges. Leave blank to disable.
            </p>
          </div>
          <div>
            <label className="label">Daily ping channel webhook</label>
            <input
              className="input"
              value={form.teamsWebhookDaily || ''}
              onChange={(e) => set('teamsWebhookDaily', e.target.value)}
            />
            <p className="text-xs text-muted mt-1">
              The daily check-in digest. Leave blank to disable.
            </p>
          </div>
          <div>
            <label className="label">New task channel webhook</label>
            <input
              className="input"
              value={form.teamsWebhookTaskCreated || ''}
              onChange={(e) => set('teamsWebhookTaskCreated', e.target.value)}
            />
            <p className="text-xs text-muted mt-1">
              Announces each newly created task (subtasks excluded). Leave blank to disable.
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.teamsPingEnabled === 'true'}
              onChange={(e) => set('teamsPingEnabled', e.target.checked ? 'true' : 'false')}
            />
            Post the daily check-in digest to Teams
          </label>
        </div>
      </section>

      {/* Ping schedule */}
      <section className="card p-6 space-y-4">
        <h2 className="section-title">Daily check-in pings</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Team-wide default ping time</label>
            <input type="time" className="input" value={form.defaultPingTime || ''} onChange={(e) => set('defaultPingTime', e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={form.pingEnabled === 'true'}
              onChange={(e) => set('pingEnabled', e.target.checked ? 'true' : 'false')}
            />
            Daily pings enabled
          </label>
        </div>
        <p className="text-xs text-muted">
          Individual users can override their own ping time from their profile page.
        </p>
      </section>

      {/* Briefing schedule */}
      <section className="card p-6 space-y-4">
        <h2 className="section-title">Weekly briefing schedule</h2>
        <p className="text-xs text-muted">
          When enabled, a personal trailing-7-day briefing is auto-generated on this day/time for each active
          person who logged hours that week. Everyone can also generate their own for any date range on the
          Briefings page, and each person only sees their own.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Day of week</label>
            <select className="input" value={form.briefingDay || 'friday'} onChange={(e) => set('briefingDay', e.target.value)}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Time</label>
            <input type="time" className="input" value={form.briefingTime || ''} onChange={(e) => set('briefingTime', e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={form.briefingEnabled === 'true'}
              onChange={(e) => set('briefingEnabled', e.target.checked ? 'true' : 'false')}
            />
            Briefing schedule enabled
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save all settings'}
        </button>
      </div>

      {userModal.open && (
        <UserModal
          user={userModal.user}
          onClose={() => setUserModal({ open: false, user: null })}
          onSaved={reloadUsers}
        />
      )}
    </div>
  );
}

function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState(user?.role || 'member');
  const [pingTime, setPingTime] = useState(user?.pingTime || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (user) {
        const body: Record<string, unknown> = { name, email, role, pingTime: pingTime || null };
        if (password) body.password = password;
        await api(`/api/users/${user.id}`, { method: 'PUT', body });
        toast.success('User updated');
      } else {
        if (!password) {
          toast.error('Password is required for new users');
          setSaving(false);
          return;
        }
        await api('/api/users', {
          method: 'POST',
          body: { name, email, role, pingTime: pingTime || null, password },
        });
        toast.success('User added');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={user ? 'Edit user' : 'Add user'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as any)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">Preferred ping time</label>
            <input type="time" className="input" value={pingTime} onChange={(e) => setPingTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">{user ? 'Reset password (optional)' : 'Password'}</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
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
