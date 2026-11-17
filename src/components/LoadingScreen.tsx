import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';

export function LoadingScreen({ message }: { message: string }) {
  return <main aria-busy="true" className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 text-[var(--text-primary)]">
    <div role="status" aria-live="polite" className="w-full max-w-sm rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
      <div aria-hidden="true" className="font-display text-2xl font-bold tracking-tight">GRASP<span className="text-[var(--red)]">IT</span></div>
      <LoaderCircle aria-hidden="true" className="mx-auto my-6 h-8 w-8 text-[var(--red)] motion-safe:animate-spin" />
      <p className="text-lg font-semibold">{message}</p>
      <p className="mt-2 text-sm text-[var(--text-body)]">Getting everything ready for you.</p>
    </div>
  </main>;
}

export function LoadErrorScreen({ onRetry, onSignOut }: { onRetry: () => void; onSignOut?: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 text-[var(--text-primary)]">
    <div className="w-full max-w-md rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
      <AlertCircle aria-hidden="true" className="mx-auto mb-5 h-8 w-8 text-[var(--red)]" />
      <h1 className="text-2xl font-bold">We couldn’t load GraspIt</h1>
      <p role="alert" className="mt-3 text-sm text-[var(--text-body)]">Check your connection and try again. {onSignOut ? 'You can also sign out to use another account.' : ''}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onRetry} className="btn-crimson inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm"><RefreshCw aria-hidden="true" className="h-4 w-4" />Try again</button>
        {onSignOut && <button type="button" onClick={onSignOut} className="btn-secondary-outline rounded-full px-5 py-3 text-sm">Sign out</button>}
      </div>
    </div>
  </main>;
}
