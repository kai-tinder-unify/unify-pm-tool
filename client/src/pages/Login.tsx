import { FormEvent, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    // Light "Command Center" page: soft aqua glow over the warm paper background.
    // Replaces the old bright-blue radial glow (rgba(47,155,239,...)) which was tuned for the dark navy theme.
    <div className="min-h-screen flex items-center justify-center px-4 bg-paper bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(28,196,188,0.10),transparent)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="w-10 h-10 mx-auto mb-4 rounded-xl flex items-center justify-center text-white text-base font-bold"
            style={{
              // Aqua brand gradient (bright aqua -> deep aqua-text) replaces the old blue gradient.
              backgroundImage: 'linear-gradient(135deg, #1cc4bc, #0a6e6a)',
              // Subtle top highlight + soft navy-tinted drop shadow reads correctly on the light surface
              // (the old blue glow was too heavy against paper).
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 16px rgba(13,34,56,0.18)',
            }}
          >
            {/* Badge sits on the colored aqua fill, so the "A" stays white for contrast. */}
            A
          </div>
          {/* Eyebrow: aqua-text (AA-safe deep aqua) replaces the old gold accent. */}
          <div className="text-aqua-text text-[10px] font-semibold tracking-[0.18em] uppercase">Unify Consulting</div>
          {/* Title on the light page now uses navy instead of white. */}
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-navy mt-1">Ascend Command Center</h1>
        </div>
        <form onSubmit={submit} className="card shadow-raised p-7 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {/* Error text uses the shared danger token (readable red on the light card). */}
          {error && <div className="text-danger text-sm">{error}</div>}
          <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
