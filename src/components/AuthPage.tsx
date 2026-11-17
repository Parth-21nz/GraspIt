import React, { useEffect, useRef, useState } from 'react';
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  LoaderCircle,
} from 'lucide-react';
import type { UserDocument, UserRole } from '../types';

interface AuthPageProps {
  initialMode?: 'login' | 'signup';
  onAuthSuccess: (user: UserDocument, token: string) => void;
  showDemoAccounts?: boolean;
  onBackToLanding: () => void;
}

const TEST_ACCOUNTS: Array<{
  roleLabel: string;
  role: UserRole;
  name: string;
  email: string;
  password: string;
  description: string;
}> = [
    {
      roleLabel: 'Student Account',
      role: 'student',
      name: 'Elena Vance',
      email: 'student@graspit.dev',
      password: 'password123',
      description:
        'Access enrolled tracks, video course player, syllabus checklist, notes, and certificates.',
    },
    {
      roleLabel: 'Instructor Account',
      role: 'instructor',
      name: 'Marcus Sterling',
      email: 'instructor@graspit.dev',
      password: 'password123',
      description:
        'Author new courses (with cover upload & lecture video URLs), manage modules, and view revenue.',
    },
    {
      roleLabel: 'Admin Account',
      role: 'admin',
      name: 'Devon Kael',
      email: 'admin@graspit.dev',
      password: 'password123',
      description:
        'Approve pending instructor courses, govern global categories, and moderate user accounts.',
    },
  ];

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode = 'login',
  onAuthSuccess,
  onBackToLanding,
  showDemoAccounts = false,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'instructor'>('student');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const authRequest = useRef<AbortController | null>(null);
  useEffect(() => () => authRequest.current?.abort(), []);

  const handleLogin = async (
    targetEmail: string,
    targetPassword: string
  ) => {
    if (submitting) return;
    const controller = new AbortController();
    authRequest.current?.abort(); authRequest.current = controller;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail.trim(),
          password: targetPassword,
        }),
      });
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setError(data.error || 'Authentication failed. Check your credentials.');
        return;
      }
      onAuthSuccess(data.user as UserDocument, data.token as string);
    } catch {
      if (!controller.signal.aborted) setError('Network error while attempting to sign in.');
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (mode === 'login') {
      await handleLogin(email, password);
      return;
    }

    if (!name.trim() || !email.trim() || password.length < 8) {
      setError(
        'Please provide your full name, a valid email, and a password of at least 8 characters.'
      );
      return;
    }

    const controller = new AbortController();
    authRequest.current?.abort(); authRequest.current = controller;
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/signup', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          title:
            title.trim() ||
            (role === 'instructor' ? 'Faculty Instructor' : 'Software Engineer'),
        }),
      });
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setError(data.error || 'Could not create account.');
        return;
      }
      onAuthSuccess(data.user as UserDocument, data.token as string);
    } catch {
      if (!controller.signal.aborted) setError('Network error while creating account.');
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] pt-28 pb-20 px-6 md:px-12">
      <div className="max-w-[1160px] mx-auto space-y-8">
        <div>
          <button
            type="button"
            onClick={onBackToLanding}
            className="btn-secondary-outline rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[var(--red)]" />
            <span>Back to Home</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left 6 Columns: Sign In / Sign Up Form */}
          <div className={`lg:col-span-6 ${showDemoAccounts ? '' : 'lg:col-start-4'} rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-7 md:p-10 space-y-7`}>
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--red)] font-semibold block">
                {mode === 'login' ? 'Member Access' : 'New Account Registration'}
              </span>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                {mode === 'login'
                  ? 'Sign In to GraspIt'
                  : 'Create Your GraspIt Account'}
              </h1>
              <p className="text-xs text-[var(--text-body)]">
                {mode === 'login'
                  ? 'Enter your credentials below or use the verified test accounts on the right.'
                  : 'Register as a Student or Instructor to access courses and curriculum tools.'}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-[var(--bg)] border border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${mode === 'login'
                  ? 'bg-[var(--red)] text-[var(--text-primary)]'
                  : 'text-[var(--text-body)] hover:text-[var(--text-primary)]'
                  }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={`py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${mode === 'signup'
                  ? 'bg-[var(--red)] text-[var(--text-primary)]'
                  : 'text-[var(--text-body)] hover:text-[var(--text-primary)]'
                  }`}
              >
                Sign Up
              </button>
            </div>

            {error && (
              <div className="p-4 rounded-[16px] bg-[var(--surface-2)] border border-[var(--red)] flex items-start gap-3 text-xs text-[var(--text-primary)]">
                <AlertCircle className="w-4 h-4 text-[var(--red)] shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} aria-busy={submitting} className="space-y-5">
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                      Full Name *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[var(--red)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your full name..."
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                        Account Role *
                      </label>
                      <select
                        value={role}
                        onChange={(e) =>
                          setRole(e.target.value as 'student' | 'instructor')
                        }
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
                      >
                        <option value="student">Student</option>
                        <option value="instructor">Instructor</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                        Professional Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Systems Engineer"
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[var(--red)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@graspit.dev"
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-3 text-sm font-mono-num text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--red)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-3 text-sm font-mono-num text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-crimson rounded-full py-3.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting && <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
                <span>
                  {submitting
                    ? mode === 'login' ? 'Signing you in…' : 'Creating your account…'
                    : mode === 'login'
                      ? 'Sign In to Workspace'
                      : 'Create Account & Continue'}
                </span>
                <ArrowRight className="w-4 h-4 text-[var(--red)]" />
              </button>
            </form>
          </div>

          {/* Right 6 Columns: Verified Test Login Information for Easier Testing */}
          {showDemoAccounts && (
            <div className="lg:col-span-6 rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-7 md:p-10 space-y-6">
              <div className="flex items-start gap-3.5 border-b border-[var(--border)] pb-5">
                <span className="icon-circle-crimson">
                  <KeyRound className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-xs uppercase tracking-[0.2em] text-[var(--red)] font-semibold block">
                    Sandbox Credentials
                  </span>
                  <h2 className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                    Verified Test Login Information
                  </h2>
                  <p className="text-xs text-[var(--text-body)] mt-1">
                    Use these pre-configured credentials to test Student,
                    Instructor, and Admin roles. You can type them manually or click
                    <strong> Fill Credentials</strong> / <strong>Instant Login</strong>.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {TEST_ACCOUNTS.map((acct, idx) => (
                  <div
                    key={acct.email}
                    className="p-5 rounded-[20px] bg-[var(--surface-2)] border border-[var(--border)] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono-num font-bold text-[var(--red)]">
                          0{idx + 1}
                        </span>
                        <span className="text-sm font-bold text-[var(--text-primary)]">
                          {acct.roleLabel}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          ({acct.name})
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full border border-[var(--border)] text-[11px] font-mono-num uppercase text-[var(--red)] font-semibold">
                        Role: {acct.role}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-body)] leading-relaxed">
                      {acct.description}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-mono-num">
                      <div>
                        <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                          Email
                        </span>
                        <span className="text-[var(--text-primary)] select-all">
                          {acct.email}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                          Password
                        </span>
                        <span className="text-[var(--text-primary)] select-all">
                          {acct.password}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setEmail(acct.email);
                          setPassword(acct.password);
                          setError(null);
                        }}
                        className="btn-secondary-outline rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                      >
                        Fill Credentials
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleLogin(acct.email, acct.password)}
                        className="btn-crimson rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {submitting ? <LoaderCircle aria-hidden="true" className="w-3.5 h-3.5 text-[var(--red)] motion-safe:animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-[var(--red)]" />}
                        <span>Login as {acct.role}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
