import { useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import type { UserDocument } from '../types';
import { apiRequest } from '../api/client';

export function AccountSecurity({ user, onSignedOut, onLogoutAll, onUpdated, deliveryAvailable }: { user: UserDocument; onSignedOut: () => void; onLogoutAll: () => Promise<void>; onUpdated: (user: UserDocument) => void; deliveryAvailable: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const send = async (path: string, body = {}) => {
    const res = await apiRequest(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'This request failed. Please try again.');
    return data;
  };
  const action = async (name: string, fn: () => Promise<void>) => {
    if (busy) return; setBusy(name); setError(null); setMessage(null);
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : 'Check your connection and try again.'); } finally { setBusy(null); }
  };
  const input = 'w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm';
  return <section aria-labelledby="account-security" className="mx-auto mb-20 max-w-[1120px] px-5 sm:px-8">
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
      <h2 id="account-security" className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-[var(--red)]" />Account security</h2>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}{message && <p role="status" className="mt-4 text-sm">{message}</p>}
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="space-y-5 text-sm">
          <p className="text-[var(--text-body)]">Email: <strong className="text-[var(--text-primary)]">{user.isDemoAccount ? 'Shared demo account' : user.emailVerifiedAt ? 'Verified' : 'Not verified'}</strong></p>
          {!user.isDemoAccount && !user.emailVerifiedAt && <><button type="button" disabled={Boolean(busy) || !deliveryAvailable} onClick={() => void action('verification', async () => { const result = await send('resend-verification'); setMessage(result.message); })} className="btn-secondary-outline inline-flex items-center gap-2 rounded-full px-5 py-2 disabled:opacity-50">{busy === 'verification' && <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />}Send verification link</button><p className="text-xs text-[var(--text-body)]">{deliveryAvailable ? 'Email messages are saved in the developer’s local mail outbox for this demo.' : 'Email delivery is unavailable in this demo.'}</p></>}
          {user.role === 'student' && <div className="space-y-3 border-t border-[var(--border)] pt-5"><h3 className="font-semibold">Interested in teaching?</h3><p className="text-[var(--text-body)]">{user.instructorApplicationStatus === 'pending' ? 'Your teaching application is awaiting admin approval. Verify your email and complete your professional title and bio.' : user.instructorApplicationStatus === 'rejected' ? 'Your previous application was declined. Update your profile before applying again.' : 'Apply using the professional title and bio in your profile. Every account can continue learning while the application is reviewed.'}</p>{user.instructorApplicationStatus !== 'pending' && <button type="button" disabled={Boolean(busy)} className="btn-secondary-outline rounded-full px-5 py-2 disabled:opacity-50" onClick={() => void action('application', async () => { const result = await send('instructor-application'); onUpdated(result.user); setMessage('Teaching application submitted.'); })}>Apply to teach</button>}</div>}
          <button type="button" disabled={Boolean(busy)} onClick={() => void action('logout', onLogoutAll)} className="btn-secondary-outline rounded-full px-5 py-2 disabled:opacity-50">Sign out everywhere</button>
        </div>
        {user.isDemoAccount ? <p className="text-sm text-[var(--text-body)]">Shared demo email and passwords stay fixed. Create a personal account to try password changes, recovery and verification.</p> : <form aria-busy={busy === 'password'} onSubmit={event => { event.preventDefault(); if (newPassword !== confirm) { setError('The new passwords do not match.'); return; } void action('password', async () => { await send('change-password', { currentPassword, newPassword }); setCurrentPassword(''); setNewPassword(''); setConfirm(''); onSignedOut(); }); }} className="space-y-4">
          <h3 className="font-semibold">Change password</h3>
          <div><label htmlFor="security-current" className="mb-2 block text-sm">Current password</label><input id="security-current" type="password" autoComplete="current-password" required maxLength={1024} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className={input} /></div>
          <div><label htmlFor="security-new" className="mb-2 block text-sm">New password</label><input id="security-new" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} className={input} /></div>
          <div><label htmlFor="security-confirm" className="mb-2 block text-sm">Confirm new password</label><input id="security-confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)} className={input} /></div>
          <p className="text-xs text-[var(--text-body)]">At least 8 characters. This signs you out on every device, including this one.</p>
          <button type="submit" disabled={Boolean(busy)} className="btn-crimson inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm disabled:opacity-50">{busy === 'password' && <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />}Change password</button>
        </form>}
      </div>
    </div>
  </section>;
}
