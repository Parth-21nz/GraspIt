import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, LoaderCircle, LockKeyhole, Save, UserRound } from 'lucide-react';
import type { ProfileDocument, ProfileUpdate, UploadAssetDocument, UserDocument } from '../types';
import { UserAvatar } from './UserAvatar';

interface Props {
  currentUser: UserDocument;
  onLoad: () => Promise<ProfileDocument>;
  onSave: (input: ProfileUpdate) => Promise<ProfileDocument>;
  onUploadAvatar: (file: File, progress: (percent: number) => void, signal: AbortSignal) => Promise<UploadAssetDocument>;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}
const inputClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-body)] focus:border-[var(--red)] focus:outline-none disabled:opacity-60';

export function ProfilePage({ currentUser, onLoad, onSave, onUploadAvatar, onBack, onDirtyChange }: Props) {
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('');
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortUpload = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);

  const fill = (data: ProfileDocument) => {
    setProfile(data); setName(data.user.name); setTitle(data.user.title); setBio(data.user.bio);
    setEmail(data.user.email); setAvatar(data.user.avatar); setAvatarAssetId(data.user.avatarAssetId ?? null); setPassword('');
  };
  const load = async () => {
    setLoading(true); setError(null);
    try { const data = await onLoad(); if (mounted.current) fill(data); }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Your profile could not be loaded.'); }
    finally { if (mounted.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true; heading.current?.focus(); void load();
    return () => { mounted.current = false; abortUpload.current?.abort(); };
    // Load once per signed-in account, without resetting a draft on parent renders.
  }, [currentUser._id]);

  const emailChanged = Boolean(profile && email.trim().toLowerCase() !== profile.user.email);
  const dirty = Boolean(profile && (name.trim() !== profile.user.name || title.trim() !== profile.user.title || bio.trim() !== profile.user.bio || emailChanged || avatar !== profile.user.avatar || avatarAssetId !== (profile.user.avatarAssetId ?? null)));
  useEffect(() => { onDirtyChange(dirty || uploading); return () => onDirtyChange(false); }, [dirty, uploading, onDirtyChange]);
  useEffect(() => {
    if (!emailChanged) setPassword('');
  }, [emailChanged]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || uploading) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, uploading]);

  const upload = async (file: File) => {
    abortUpload.current?.abort(); setUploading(false); setRetryFile(file); setNotice(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setUploadError('Choose a JPG, PNG or WebP photo up to 5 MB.'); return; }
    const controller = new AbortController(); abortUpload.current = controller;
    setUploading(true); setUploadProgress(0); setUploadError(null);
    try {
      const asset = await onUploadAvatar(file, setUploadProgress, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      setAvatar(asset.url); setAvatarAssetId(asset._id); setRetryFile(null);
    } catch (err) {
      if (!controller.signal.aborted && mounted.current) setUploadError(err instanceof Error ? err.message : 'Your photo could not be uploaded. Please retry.');
    } finally { if (!controller.signal.aborted && mounted.current) setUploading(false); }
  };
  const reset = () => {
    abortUpload.current?.abort(); setUploading(false); setUploadError(null); setRetryFile(null); setError(null); setNotice(null);
    if (fileInput.current) fileInput.current.value = '';
    if (profile) fill(profile);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || !dirty || saving || uploading || uploadError) return;
    setSaving(true); setError(null); setNotice(null);
    const input: ProfileUpdate = {};
    if (name.trim() !== profile.user.name) input.name = name.trim();
    if (title.trim() !== profile.user.title) input.title = title.trim();
    if (bio.trim() !== profile.user.bio) input.bio = bio.trim();
    if (emailChanged) { input.email = email.trim().toLowerCase(); input.currentPassword = password; }
    if (avatar !== profile.user.avatar || avatarAssetId !== (profile.user.avatarAssetId ?? null)) input.avatarAssetId = avatarAssetId;
    try {
      const updated = await onSave(input);
      if (mounted.current) { fill(updated); setNotice(updated.pendingEmail ? 'Profile saved. Confirm the verification link sent to your new email before the address changes.' : 'Your profile has been updated.'); }
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Your changes could not be saved. Please retry.'); }
    finally { if (mounted.current) setSaving(false); }
  };

  return <main id="profile" className="mx-auto max-w-[1120px] px-5 pb-20 pt-28 sm:px-8 md:pt-32">
    <button type="button" onClick={onBack} className="mb-7 inline-flex items-center gap-2 text-sm text-[var(--text-body)] hover:text-[var(--text-primary)]"><ArrowLeft className="h-4 w-4" />Back to workspace</button>
    <div className="mb-9 border-b border-[var(--border)] pb-7">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--red)]">Account</p>
      <h1 ref={heading} tabIndex={-1} className="font-display text-4xl font-bold text-[var(--text-primary)] outline-none sm:text-5xl">Your profile</h1>
      <p className="mt-3 text-sm text-[var(--text-body)]">A few details to make GraspIt feel like your workspace.</p>
    </div>
    {loading ? <p role="status" className="py-12 text-[var(--text-body)]">Loading your profile…</p> : !profile ? <div role="alert" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <p className="text-[var(--red)]">{error}</p><button type="button" onClick={() => void load()} className="btn-secondary-outline mt-4 rounded-full px-5 py-2 text-sm">Try again</button>
    </div> : <div className="grid items-start gap-7 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6">
        <UserAvatar name={profile.user.name} avatar={profile.user.avatar} className="mb-5 h-20 w-20 text-2xl" />
        <h2 className="break-words text-xl font-semibold text-[var(--text-primary)]">{profile.user.name}</h2>
        {profile.user.title && <p className="mt-2 break-words text-sm text-[var(--text-body)]">{profile.user.title}</p>}
        <p className="mt-5 inline-flex rounded-full border border-[var(--border)] px-3 py-1 text-xs capitalize text-[var(--red)]">{profile.user.role}</p>
        <dl className="mt-6 border-t border-[var(--border)] pt-5 text-sm"><dt className="text-[var(--text-body)]">Member since</dt><dd className="mt-1 text-[var(--text-body)]">{new Date(profile.user.joinedAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</dd></dl>
      </aside>
      <form onSubmit={submit} className="min-w-0 space-y-6">
        {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-primary)]"><CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--red)]" />{notice}</p>}
        {error && <p role="alert" className="rounded-xl border border-[var(--red)]/40 bg-[var(--surface)] p-4 text-sm text-red-300">{error}</p>}
        <fieldset disabled={saving} className="min-w-0 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
          <legend className="sr-only">Personal details</legend>
          <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><UserRound className="h-5 w-5 text-[var(--red)]" />Personal details</h2>
          <div className="mb-7 flex flex-wrap items-center gap-5">
            <UserAvatar name={name || profile.user.name} avatar={avatar} className="h-20 w-20 text-2xl" />
            <div className="min-w-0 flex-1">
              <input ref={fileInput} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || saving} className="hidden" aria-label="Choose a profile photo" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--red)] disabled:opacity-50"><Camera className="h-4 w-4" />Upload photo</button>
                {avatar && <button type="button" disabled={uploading} className="text-xs text-[var(--text-body)] underline hover:text-[var(--text-primary)]" onClick={() => { abortUpload.current?.abort(); setAvatar(''); setAvatarAssetId(null); setUploadError(null); setRetryFile(null); setNotice(null); if (fileInput.current) fileInput.current.value = ''; }}>Remove photo</button>}
              </div>
              <p className="mt-2 text-xs text-[var(--text-body)]">Optional. JPG, PNG or WebP, up to 5 MB.</p>
              {uploading && <div role="status" className="mt-3 text-xs text-[var(--text-body)]"><progress value={uploadProgress} max={100} aria-label="Profile photo upload progress" className="w-full" /><p>{uploadProgress < 99 ? `Uploading photo: ${uploadProgress}%` : 'Preparing your photo…'}</p></div>}
              {uploadError && <div role="alert" className="mt-3 text-sm text-red-300"><p>{uploadError}</p>{retryFile && <button type="button" className="mt-2 underline" onClick={() => void upload(retryFile)}>Retry photo upload</button>}<button type="button" className="ml-3 underline" onClick={() => { setUploadError(null); setRetryFile(null); if (fileInput.current) fileInput.current.value = ''; }}>Dismiss</button></div>}
            </div>
          </div>
          <div className="space-y-5">
            <div><label htmlFor="profile-name" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Full name <span className="text-[var(--red)]">*</span></label><input id="profile-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={(e) => { setNotice(null); setName(e.target.value); }} className={inputClass} /></div>
            <div><label htmlFor="profile-title" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Professional title</label><input id="profile-title" name="title" autoComplete="organization-title" maxLength={100} placeholder="e.g., Software engineer or design student" value={title} onChange={(e) => { setNotice(null); setTitle(e.target.value); }} className={inputClass} /></div>
            <div><label htmlFor="profile-bio" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">About you</label><textarea id="profile-bio" name="bio" rows={4} maxLength={500} aria-describedby="profile-bio-hint profile-bio-count" placeholder="What are you learning, building, or interested in?" value={bio} onChange={(e) => { setNotice(null); setBio(e.target.value); }} className={`${inputClass} resize-y`} /><div className="mt-2 flex justify-between gap-4 text-xs text-[var(--text-body)]"><p id="profile-bio-hint">A short introduction, in your own words.</p><span id="profile-bio-count">{bio.length}/500</span></div></div>
          </div>
        </fieldset>
        <fieldset disabled={saving} className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
          <legend className="sr-only">Sign-in details</legend>
          <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><LockKeyhole className="h-5 w-5 text-[var(--red)]" />Sign-in details</h2>
          <label htmlFor="profile-email" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Email address <span className="text-[var(--red)]">*</span></label>
          <input id="profile-email" name="email" type="email" autoComplete="email" required maxLength={200} readOnly={!profile.emailChangeAllowed} value={email} onChange={(e) => { setNotice(null); setEmail(e.target.value); }} aria-describedby="profile-email-hint" className={inputClass} />
          <p id="profile-email-hint" className="mt-2 text-xs text-[var(--text-body)]">{profile.emailChangeAllowed ? 'A change requires your current password and verification of the new address. Your current email stays active until confirmation.' : 'The shared demo email stays fixed. Personal accounts can change their sign-in email.'}</p>
          {profile.pendingEmail && <p role="status" className="mt-3 text-sm text-[var(--text-body)]">Awaiting confirmation: {profile.pendingEmail}. Email messages are stored in the local mail outbox for this demo.</p>}
          {emailChanged && profile.emailChangeAllowed && <div className="mt-5"><label htmlFor="profile-password" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Current password <span className="text-[var(--red)]">*</span></label><input id="profile-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></div>}
        </fieldset>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border)] pt-6">
          <button type="button" onClick={reset} disabled={saving || uploading || (!dirty && !uploadError)} className="btn-secondary-outline rounded-full px-6 py-3 text-sm disabled:opacity-40">Reset changes</button>
          <button type="submit" disabled={!dirty || saving || uploading || Boolean(uploadError)} className="btn-crimson inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving changes…' : 'Save changes'}</button>
        </div>
      </form>
    </div>}
  </main>;
}
