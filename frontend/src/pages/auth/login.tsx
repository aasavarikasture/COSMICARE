import { useState } from 'react';
import { useAuth } from '../../lib/auth/context';
import { Button, Input, Label, Alert } from '@/components/ui';
import { useNavigate, useLocation, Link } from 'react-router-dom';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function roleDestination(role: string): string {
  switch (role) {
    case 'astronaut':
      return '/astronaut';
    case 'medical':
      return '/medical';
    case 'mission_control':
      return '/mission-control';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

export const LoginPage = () => {
  const { login, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Password is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);

    if (result.success && result.user) {
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from && from !== '/login' ? from : roleDestination(result.user.role), { replace: true });
    } else {
      setError(result.error || 'Login failed. Please check your credentials.');
    }
  };

  const busy = loading || authLoading;

  return (
    <section className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center mb-6">
          <Link to="/" className="inline-block">
            <h1 className="text-3xl font-serif text-warm-ivory tracking-tighter">
              COSMICARE
            </h1>
          </Link>
          <p className="text-sm text-muted-silver mt-1">
            Intelligent Care for the Final Frontier
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="text-center mb-2">
            <h2 className="text-xl font-serif text-warm-ivory">Sign In</h2>
            <p className="text-xs text-muted-silver mt-1">
              Access your mission health intelligence
            </p>
          </div>

          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
              }}
              placeholder="astronaut@cosmicare.demo"
              disabled={busy}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p className="text-xs text-restrained-red">{fieldErrors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                }}
                placeholder="••••••••"
                disabled={busy}
                aria-invalid={!!fieldErrors.password}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-silver hover:text-warm-ivory text-xs"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={busy}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-xs text-restrained-red">{fieldErrors.password}</p>
            )}
          </div>

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <div className="text-center">
          <p className="text-sm text-muted-silver">
            Don't have an account?{' '}
            <Link to="/register" className="text-celestial-blue hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
};
