import { CornerUpLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

export interface Reaction { emoji: string; count: number; me?: boolean }
export interface MessageAction { key: string; icon: ReactNode; label: string; onClick: (e: React.MouseEvent) => void; danger?: boolean }

export function Message({
  author, authorColor, time, children, grouped, highlighted, state = 'sent', reactions, reply, compact, edited, onAuthorClick,
  actions, onReactionClick, onReplyClick, editing, flash, renderEmoji = (e: string) => e, avatarSrc,
  labels = { failed: 'Message failed to send.', edited: '(edited)', toolbar: 'Message actions' },
}: {
  author: string;
  authorColor?: string;
  time: string;
  children: ReactNode;
  grouped?: boolean;
  highlighted?: boolean;
  state?: 'sent' | 'sending' | 'failed';
  reactions?: Reaction[];
  reply?: { author: string; text: string } | null;
  compact?: boolean;
  edited?: boolean;
  onAuthorClick?: (e: React.MouseEvent) => void;
  actions?: MessageAction[];
  onReactionClick?: (emoji: string, me: boolean) => void;
  onReplyClick?: () => void;
  /** replaces the content while editing */
  editing?: ReactNode;
  flash?: boolean;
  renderEmoji?: (emoji: string) => ReactNode;
  avatarSrc?: string;
  labels?: { failed: string; edited: string; toolbar: string };
}) {
  return (
    <article
      aria-label={`${author}, ${time}`}
      className={cn(
        'group relative pe-12 transition-colors duration-(--motion-slow)',
        compact ? 'py-0.5 ps-4' : 'ps-[72px]',
        !compact && (grouped ? 'py-0.5' : 'mt-4 py-0.5'),
        highlighted ? 'bg-mention before:absolute before:inset-y-0 before:start-0 before:w-0.5 before:bg-accent' : 'hover:bg-surface-hover/40',
        flash && 'bg-link/15',
        editing && 'bg-surface-hover/40',
      )}
    >
      {reply && !compact && (
        <button type="button" onClick={onReplyClick} className="relative mb-1 flex max-w-full items-center gap-1.5 text-start text-sm text-muted hover:text-text">
          <span aria-hidden className="absolute -start-[38px] top-1/2 h-3 w-[30px] rounded-ss-md border-s-2 border-t-2 border-border-input" />
          <Avatar name={reply.author} size={16} />
          <span className="shrink-0 font-semibold">@{reply.author}</span>
          <span className="truncate">{reply.text}</span>
        </button>
      )}
      {!grouped && !compact && (
        <button type="button" tabIndex={-1} onClick={onAuthorClick} className="absolute start-4 mt-0.5 rounded-full"><Avatar name={author} src={avatarSrc} size={40} /></button>
      )}
      {grouped && !compact && (
        <time className="absolute start-0 hidden w-[72px] pt-1 text-center text-2xs font-medium text-faint group-hover:block">{time.split(' ').pop()}</time>
      )}
      {!grouped && !compact && (
        <h3 className="flex items-baseline gap-2">
          <button type="button" onClick={onAuthorClick} className="cursor-pointer font-medium hover:underline" style={{ color: authorColor ?? 'var(--c-text)' }}>{author}</button>
          <time className="text-xs font-medium text-faint">{time}</time>
        </h3>
      )}
      {editing ?? (
        <div
          dir="auto"
          className={cn('whitespace-pre-wrap break-words text-base leading-[22px] [html[dir=ltr]_&]:text-left [html[dir=rtl]_&]:text-right', state === 'sending' ? 'text-faint' : 'text-text', state === 'failed' && 'text-danger-text')}
        >
          {compact && (
            <>
              <time className="me-2 text-xs text-faint">{time.split(' ').pop()}</time>
              <button type="button" onClick={onAuthorClick} className="me-1 font-medium" style={{ color: authorColor ?? 'var(--c-text)' }}>{author}</button>
            </>
          )}
          {children}
          {edited && <span className="ms-1 text-2xs text-faint">{labels.edited}</span>}
        </div>
      )}
      {state === 'failed' && <p className="mt-1 text-xs text-danger-text">{labels.failed}</p>}
      {reactions && reactions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              aria-pressed={!!r.me}
              onClick={() => onReactionClick?.(r.emoji, !!r.me)}
              className={cn(
                'inline-flex h-6 items-center gap-1.5 rounded-sm border px-1.5 text-sm transition-colors',
                r.me ? 'border-accent bg-mention text-text' : 'border-transparent bg-surface-raised text-muted hover:border-border-input',
              )}
            >
              <span className="inline-flex">{renderEmoji(r.emoji)}</span>
              <span className="text-xs font-semibold tabular-nums">{r.count}</span>
            </button>
          ))}
        </div>
      )}
      {actions && actions.length > 0 && !editing && state === 'sent' && (
        <div role="toolbar" aria-label={labels.toolbar} className="absolute -top-4 end-4 z-10 hidden items-center rounded-sm border border-border bg-surface-raised shadow-card group-focus-within:flex group-hover:flex">
          {actions.map((a) => (
            <Tooltip key={a.key} content={a.label}>
              <button type="button" aria-label={a.label} onClick={a.onClick} className={cn('grid size-8 place-items-center hover:bg-surface-hover', a.danger ? 'text-danger-text' : 'text-muted hover:text-text')}>
                {a.icon}
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </article>
  );
}

export function TypingIndicator({ text }: { text: string }) {
  return (
    <div className="flex h-6 items-center gap-2 ps-4 text-xs text-muted" aria-live="polite">
      <span aria-hidden className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-muted" style={{ animation: `typing 1.2s ${i * 0.15}s infinite` }} />
        ))}
      </span>
      <span><strong className="font-semibold text-text">{text}</strong></span>
    </div>
  );
}

export const ReplyIcon = () => <CornerUpLeft className="size-[18px] rtl:-scale-x-100" />;
