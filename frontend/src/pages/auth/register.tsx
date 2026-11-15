import { useState } from 'react';
import { useAuth } from '../../lib/auth/context';
import { Button, Input, Label, Alert } from '@/components/ui';
import { useNavigate, Link } from 'react-router-dom';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PRIVILEGED_ROLES = ['mission_control', 'admin'] as const;

function roleDestination(role: string): string {
  switch (role) {
    case 'astronaut':
      return '/astronaut';
    case 'medical':
    case 'mission_control':
      return '/mission-control';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

export const RegisterPage = () => {
  const { register, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'astronaut' | 'medical' | 'mission_control' | 'admin'>('astronaut');
  const [callsign, setCallsign] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!fullName.trim() || fullName.trim().length < 2) errs.fullName = 'Full name must be at least 2 characters';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address';
    if (!password || password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (role === 'astronaut' && callsign && callsign.length > 24) errs.callsign = 'Callsign too long';
    if (PRIVILEGED_ROLES.includes(role as any) && !inviteCode.trim()) {
      // In dev backend allows empty invite code, but ask anyway for clarity; allow empty submission.
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    const result = await register(
      email.trim(),
      password,
      fullName.trim(),
      role,
      role === 'astronaut' ? (callsign.trim() || undefined) : undefined,
      PRIVILEGED_ROLES.includes(role as any) ? (inviteCode.trim() || undefined) : undefined,
    );
    setLoading(false);

    if (result.success && result.user) {
      setSuccess(true);
      setTimeout(() => navigate(roleDestination(result.user!.role), { replace: true }), 800);
    } else {
      setError(result.error || 'Registration failed. Please try again.');
    }
  };

  const busy = loading || authLoading;
  const isPrivileged = PRIVILEGED_ROLES.includes(role as any);

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
            <h2 className="text-xl font-serif text-warm-ivory">Create Account</h2>
            <p className="text-xs text-muted-silver mt-1">
              Join the COSMICARE health intelligence network
            </p>
          </div>

          {error && <Alert variant="destructive">{error}</Alert>}
          {success && <Alert variant="success">Account created. Redirecting…</Alert>}

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearFieldError('fullName');
              }}
              placeholder="Demo User"
              disabled={busy}
            />
            {fieldErrors.fullName && <p className="text-xs text-restrained-red">{fieldErrors.fullName}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
              }}
              placeholder="user@cosmicare.demo"
              disabled={busy}
            />
            {fieldErrors.email && <p className="text-xs text-restrained-red">{fieldErrors.email}</p>}
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
                  clearFieldError('password');
                }}
                placeholder="At least 8 characters"
                disabled={busy}
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
            {fieldErrors.password && <p className="text-xs text-restrained-red">{fieldErrors.password}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearFieldError('confirmPassword');
              }}
              placeholder="Repeat password"
              disabled={busy}
            />
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-restrained-red">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              disabled={busy}
              className="w-full rounded-md border border-input bg-background p-2.5 text-sm text-warm-ivory focus-visible:outline-none focus-visible:ring-2 focus:ring-ring"
            >
              <option value="astronaut">Astronaut</option>
              <option value="medical">Medical Personnel</option>
              <option value="mission_control">Mission Control</option>
              <option value="admin">Admin (requires invite code)</option>
            </select>
          </div>

          {role === 'astronaut' && (
            <div className="space-y-2">
              <Label htmlFor="callsign">Callsign (optional)</Label>
              <Input
                id="callsign"
                type="text"
                value={callsign}
                onChange={(e) => {
                  setCallsign(e.target.value);
                  clearFieldError('callsign');
                }}
                placeholder="REYES"
                disabled={busy}
              />
              {fieldErrors.callsign && <p className="text-xs text-restrained-red">{fieldErrors.callsign}</p>}
            </div>
          )}

          {isPrivileged && (
            <div className="space-y-2">
              <Label htmlFor="inviteCode">Invite Code</Label>
              <Input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Required for privileged roles"
                disabled={busy}
              />
              <p className="text-xs text-muted-silver">
                Privileged roles require an authorized invite code.
              </p>
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating account…' : 'Create Account'}
          </Button>
        </form>

        <div className="text-center">
          <p className="text-sm text-muted-silver">
            Already have an account?{' '}
            <Link to="/login" className="text-celestial-blue hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
};
