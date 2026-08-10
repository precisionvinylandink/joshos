import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { isWeb } from '../lib/buildTarget';

const HOME = isWeb ? '/jobs' : '/today';
const SUBTEXT = isWeb ? 'Precision Vinyl & Ink' : 'Personal Operating System';

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? HOME;

  if (session) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-login-bg p-4">
      <div className="w-[400px] max-w-full rounded-xl border border-border bg-surface p-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-white">JoshOS</h1>
          <p className="mt-1 text-[13px] text-muted">{SUBTEXT}</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={loading} className="mt-1 w-full">
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
