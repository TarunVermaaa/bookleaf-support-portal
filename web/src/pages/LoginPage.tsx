import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ui';

const DEMO = [
  { label: 'Author — Priya Sharma', email: 'priya.sharma@email.com', password: 'Author@123' },
  { label: 'Author — Sneha Kulkarni (book in production)', email: 'sneha.kulkarni@email.com', password: 'Author@123' },
  { label: 'Admin — Support team', email: 'admin@bookleafpub.com', password: 'Admin@123' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/books'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      navigate(u.role === 'admin' ? '/admin' : '/books');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand big">
          <span className="logo">/</span> BookLeaf Publishing
        </div>
        <p className="muted">Sign in to your author account or the support desk.</p>
        <ErrorBanner message={error} />
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="demo">
          <span className="muted small">Demo accounts (all authors use Author@123):</span>
          {DEMO.map((d) => (
            <button
              type="button"
              key={d.email}
              className="link small"
              onClick={() => {
                setEmail(d.email);
                setPassword(d.password);
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
