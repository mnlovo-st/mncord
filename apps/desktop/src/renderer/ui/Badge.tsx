import type { ReactNode } from 'react';
import { cn } from './cn';

export function MentionBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-grid h-4 min-w-4 place-items-center rounded-full bg-danger-solid px-1 text-2xs font-bold text-on-danger tabular-nums',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Tag({ children, tone = 'chrome' }: { children: ReactNode; tone?: 'chrome' | 'accent' | 'live' }) {
  return (
    <span
      className={cn(
        'inline-flex h-4 items-center rounded-xs px-1.5 text-2xs font-bold uppercase tracking-wide',
        tone === 'chrome' && 'bg-chrome text-on-chrome',
        tone === 'accent' && 'bg-accent text-on-accent',
        tone === 'live' && 'bg-danger-solid text-on-danger',
      )}
    >
      {children}
    </span>
  );
}

export function RolePill({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-xs bg-surface-raised px-2 text-xs font-medium text-text">
      <span aria-hidden className="size-3 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}
