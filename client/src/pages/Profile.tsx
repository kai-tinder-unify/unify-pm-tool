import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [pingTime, setPingTime] = useState(user?.pingTime || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api(`/api/users/${user.id}`, {
        method: 'PUT',
        body: { name, email, pingTime: pingTime || null },
      });
      toast.success('Profile updated');
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/users/${user.id}`, {
        method: 'PUT',
        body: { password: newPassword, currentPassword },
      });
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="page-title">My profile</h1>

      <section className="card p-6 space-y-4">
        <h2 className="section-title">Details</h2>
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Preferred ping time</label>
          <div className="flex items-center gap-3">
            <input type="time" className="input max-w-[160px]" value={pingTime} onChange={(e) => setPingTime(e.target.value)} />
            {pingTime && (
              <button className="btn-ghost" onClick={() => setPingTime('')}>
                Use team default
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Overrides the team default for your daily check-in email. Leave empty to use the team default.
          </p>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="section-title">Change password</h2>
        <div>
          <label className="label">Current password</label>
          <input type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={changePassword} disabled={saving || !newPassword}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </section>
    </div>
  );
}
