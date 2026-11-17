import { useEffect, useState } from 'react';

export function UserAvatar({ name, avatar, className = 'h-9 w-9' }: { name: string; avatar: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'G';
  return <span className={`${className} shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)] inline-flex items-center justify-center font-semibold text-[var(--red)]`}>
    {avatar && !failed
      ? <img src={avatar} alt={`${name}'s profile photo`} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      : <span aria-label={`${name}'s initials`}>{initials}</span>}
  </span>;
}
