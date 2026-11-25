import type { ReactNode } from 'react';
import { MentionBadge } from './Badge';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

/**
 * Server icon on the rail. Circle → rounded square on hover/selected with mncord's chrome sheen.
 * The indicator pill sits on the inline-start edge, so it flips to the right in Arabic.
 */
/** mncord's home mark for the top of the rail: a bold rounded "M", white on the button. */
export function HomeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden className={cn('size-7', className)} fill="none">
      <path d="M5.5 21V8.6c0-1.1 1.4-1.6 2.1-.8L14 15.2l6.4-7.4c.7-.8 2.1-.3 2.1.8V21" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GuildIcon({ name, src, children, selected, unread, mentions = 0, onClick, tone = 'default' }: {
  name: string;
  src?: string;
  children?: ReactNode;
  selected?: boolean;
  unread?: boolean;
  mentions?: number;
  onClick?: () => void;
  tone?: 'default' | 'action';
}) {
  const initials = name.split(/\s+/).map((w) => [...w][0]).join('').slice(0, 3);
  return (
    <div className="group relative flex w-full justify-center">
      <span
        aria-hidden
        className={cn(
          'absolute start-0 top-1/2 w-1 -translate-y-1/2 rounded-e-full bg-text transition-all duration-(--motion-base) ease-spring',
          selected ? 'h-10' : unread ? 'h-2 group-hover:h-5' : 'h-0 group-hover:h-5',
        )}
      />
      <Tooltip content={name} side="right">
        <button
          type="button"
          onClick={onClick}
          aria-label={name}
          aria-current={selected ? 'page' : undefined}
          data-active={selected}
          className={cn(
            'sheen grid size-12 place-items-center overflow-hidden font-display text-base font-semibold',
            'transition-[border-radius,background-color,color] duration-(--motion-base) ease-out',
            selected ? 'rounded-guild' : 'rounded-[24px] hover:rounded-guild',
            tone === 'action'
              ? 'bg-surface-raised text-online hover:bg-online hover:text-on-chrome'
              : selected
                ? 'bg-accent text-on-accent'
                : 'bg-surface-raised text-text hover:bg-accent hover:text-on-accent',
          )}
        >
          {src ? <img src={src} alt="" className="size-full object-cover" draggable={false} /> : (children ?? initials)}
        </button>
      </Tooltip>
      {mentions > 0 && (
        <MentionBadge count={mentions} className="pointer-events-none absolute -bottom-0.5 end-2 h-5 min-w-5 border-[3px] border-bg-deep text-xs" />
      )}
    </div>
  );
}
