import { useEffect, useState } from 'react';
import { LoaderCircle, LockKeyhole, Mail, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../api/client';

export function AccountRecoveryPage({ mode, onDone, deliveryAvailable }: { mode: 'forgot-password' | 'reset-password' | 'verify-email'; onDone: (signIn: boolean) => void; deliveryAvailable: boolean }) {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]).get('token') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  useEffect(() => {
    const read = () => {
      const [route, query] = window.location.hash.slice(1).split('?');
      const value = new URLSearchParams(query).get('token');
      if (route === mode && value) { setToken(value); window.history.replaceState(null, '', `#${mode}`); }
    };
    read(); window.addEventListener('hashchange', read);
    const previous = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const meta = previous ?? document.createElement('meta');
    const old = meta.content;
    meta.name = 'referrer'; meta.content = 'no-referrer';
    if (!previous) document.head.append(meta);
    return () => { window.removeEventListener('hashchange', read); meta.content = old || 'strict-origin-when-cross-origin'; };
  }, [mode]);
  const forgot = mode === 'forgot-password';
  const reset = mode === 'reset-password';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setError(null);
    if (reset && password !== confirm) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await apiRequest(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forgot ? { email } : reset ? { token, newPassword: password } : { token }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'This request could not be completed. Please try again.');
      setMessage(data.message); setRequiresSignIn(reset || Boolean(data.requiresSignIn)); setPassword(''); setConfirm(''); setToken('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  const input = 'w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)]';
  return <main className="mx-auto max-w-lg px-6 pb-20 pt-32 text-[var(--text-primary)]">
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-7 sm:p-9">
      {forgot ? <Mail aria-hidden="true" className="mb-5 h-7 w-7 text-[var(--red)]" /> : <LockKeyhole aria-hidden="true" className="mb-5 h-7 w-7 text-[var(--red)]" />}
      <h1 className="text-3xl font-bold">{forgot ? 'Reset your password' : reset ? 'Choose a new password' : 'Verify your email'}</h1>
      <p className="mt-3 text-sm text-[var(--text-body)]">{forgot ? 'Enter your account email to request a reset link.' : reset ? 'After resetting, sign in again on each device.' : 'Confirm the address you provided to GraspIt.'}</p>
      {message ? <div className="mt-6"><p role="status" className="flex items-start gap-2 text-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--red)]" />{message}</p><button type="button" onClick={() => onDone(requiresSignIn || forgot)} className="btn-crimson mt-6 rounded-full px-6 py-3 text-sm">{requiresSignIn || forgot ? 'Go to sign in' : 'Continue'}</button></div> : <form onSubmit={submit} aria-busy={busy} className="mt-6 space-y-5">
        {forgot ? <div><label htmlFor="recovery-email" className="mb-2 block text-sm">Email address</label><input id="recovery-email" type="email" autoComplete="email" required maxLength={200} value={email} onChange={event => setEmail(event.target.value)} className={input} /></div> : !token ? <p role="alert" className="text-sm text-red-300">Open the complete link from your email. If it has expired, request a new message.</p> : reset ? <><div><label htmlFor="reset-password" className="mb-2 block text-sm">New password</label><input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} className={input} /></div><div><label htmlFor="reset-confirm" className="mb-2 block text-sm">Confirm new password</label><input id="reset-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)} className={input} /></div></> : null}
        {forgot && <p className="text-xs text-[var(--text-body)]">{deliveryAvailable ? 'This local demo saves email messages in the developer’s mail outbox; no email is sent to a real inbox.' : 'Password recovery is unavailable in this demonstration.'}</p>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy || (forgot ? !deliveryAvailable : !token)} className="btn-crimson inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm disabled:opacity-50">{busy && <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}{busy ? 'Please wait…' : forgot ? 'Send reset link' : reset ? 'Reset password' : 'Verify email'}</button>
      </form>}
      <a href="#auth" className="mt-6 block text-sm text-[var(--text-body)] underline">Back to sign in</a>
    </div>
  </main>;
}
