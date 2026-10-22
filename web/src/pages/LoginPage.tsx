import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ui';
import { Eye, EyeOff, Sparkles, ChevronRight } from '../components/icons';

const DEMO = [
  {
    roleTitle: 'Published Author',
    name: 'Priya Sharma',
    detail: 'Active royalties & live titles',
    email: 'priya.sharma@email.com',
    password: 'Author@123',
    icon: 'PS',
  },
  {
    roleTitle: 'Author in Production',
    name: 'Sneha Kulkarni',
    detail: 'Book in cover design phase',
    email: 'sneha.kulkarni@email.com',
    password: 'Author@123',
    icon: 'SK',
  },
  {
    roleTitle: 'Support Desk Admin',
    name: 'BookLeaf Ops Team',
    detail: 'Triage queue & AI drafting',
    email: 'admin@bookleafpub.com',
    password: 'Admin@123',
    icon: 'AD',
  },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      setError(err instanceof ApiError ? err.message : 'Invalid credentials. Please verify your email and password.');
    } finally {
      setBusy(false);
    }
  }

  const handleSelectDemo = (d: (typeof DEMO)[0]) => {
    setEmail(d.email);
    setPassword(d.password);
  };

  return (
    <div className="login-container">
      {/* Left Brand Showcase */}
      <div className="login-hero">
        <div className="login-hero-content">
          <div className="brand" style={{ color: '#ffffff' }}>
            <div className="brand-logo-icon" style={{ background: '#ffffff', color: '#0f766e' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10" />
                <path d="M6 10h10" />
              </svg>
            </div>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em' }}>BookLeaf Publishing</span>
          </div>

          <h1>Empowering authors to write, publish, and flourish.</h1>
          <p>
            Track your book sales and quarterly royalties with full transparency, or reach our dedicated editorial and operations desk anytime.
          </p>

          <div className="hero-stats-grid">
            <div className="hero-stat-card">
              <strong>50,000+</strong>
              <span>Titles Published Across India</span>
            </div>
            <div className="hero-stat-card">
              <strong>₹4.2 Cr+</strong>
              <span>Author Royalties Disbursed</span>
            </div>
            <div className="hero-stat-card">
              <strong>&lt; 24h</strong>
              <span>Target Query Resolution SLA</span>
            </div>
            <div className="hero-stat-card">
              <strong>AI Copilot</strong>
              <span>Grounded Knowledge Base Triage</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.82rem', color: '#94a3b8', zIndex: 2 }}>
          © {new Date().getFullYear()} BookLeaf Publishing. All author rights reserved.
        </div>
      </div>

      {/* Right Login Form */}
      <div className="login-form-side">
        <div className="card login-card">
          <div className="login-header">
            <div className="badge status-open" style={{ marginBottom: '0.75rem' }}>
              <Sparkles size={12} />
              <span>Support Desk & Author Portal</span>
            </div>
            <h2>Sign in to your account</h2>
            <p className="muted" style={{ margin: 0 }}>
              Enter your registered BookLeaf credentials to continue.
            </p>
          </div>

          <ErrorBanner message={error} />

          <form onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label>
              <div className="label-row">
                <span>Password</span>
                <button
                  type="button"
                  className="link small"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={13} style={{ marginRight: 3 }} /> : <Eye size={13} style={{ marginRight: 3 }} />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <button type="submit" className="primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }} disabled={busy}>
              {busy ? 'Signing you in…' : 'Sign in to Portal'}
            </button>
          </form>

          {/* Quick Demo Personas */}
          <div className="demo-personas-grid">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="muted small" style={{ fontWeight: 600 }}>
                Instant Demo Personas
              </span>
              <span className="hint" style={{ margin: 0 }}>
                Click to autofill
              </span>
            </div>

            {DEMO.map((d) => (
              <div
                key={d.email}
                className="demo-persona-card"
                onClick={() => handleSelectDemo(d)}
                role="button"
                tabIndex={0}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: d.icon === 'AD' ? '#ccfbf1' : '#f1f5f9',
                      color: d.icon === 'AD' ? '#0f766e' : '#334155',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {d.icon}
                  </div>
                  <div>
                    <strong>{d.name}</strong>
                    <span>{d.detail}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="badge muted" style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>
                    {d.roleTitle}
                  </span>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
