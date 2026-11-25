import { ChevronDown, Plus, Hash, Lock, Megaphone, MessagesSquare, Pin, Radio, Settings, UserPlus, Volume2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { MentionBadge } from './Badge';
import { cn } from './cn';

export type ChannelType = 'text' | 'voice' | 'stage' | 'forum' | 'announcement';

const icons: Record<ChannelType, typeof Hash> = {
  text: Hash,
  voice: Volume2,
  stage: Radio,
  forum: MessagesSquare,
  announcement: Megaphone,
};

export function ChannelItem({ type, name, selected, unread, muted, locked, pinned, mentions = 0, onClick, children, inviteLabel = 'Create invite', settingsLabel = 'Edit channel', onInvite, onSettings }: {
  onInvite?: () => void;
  onSettings?: () => void;
  type: ChannelType;
  name: string;
  selected?: boolean;
  unread?: boolean;
  muted?: boolean;
  locked?: boolean;
  pinned?: boolean;
  mentions?: number;
  onClick?: () => void;
  /** connected voice users rendered under a voice channel */
  children?: ReactNode;
  inviteLabel?: string;
  settingsLabel?: string;
}) {
  const Icon = icons[type];
  return (
    <li className="relative">
      {unread && !selected && <span aria-hidden className="absolute -start-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-e-full bg-text" />}
      <div
        className={cn(
          'group flex h-8 items-center gap-1.5 rounded-sm px-2 transition-colors duration-(--motion-fast)',
          selected ? 'bg-surface-selected text-text' : 'text-faint hover:bg-surface-hover hover:text-muted',
          unread && !selected && 'font-semibold text-text',
          muted && !selected && 'opacity-60',
        )}
      >
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-1.5 text-start outline-none" aria-current={selected ? 'page' : undefined}>
          <span className="relative shrink-0">
            <Icon aria-hidden className="size-5" />
            {locked && <Lock aria-hidden className="absolute -bottom-0.5 -end-1 size-2.5 rounded-full bg-surface" />}
          </span>
          <span className="truncate text-base font-medium" title={name}>{name}</span>
          {pinned && <Pin aria-hidden className="size-3 shrink-0 text-accent-text" />}
        </button>
        <span className={cn('flex items-center gap-1', !selected && 'hidden group-hover:flex')}>
          {onInvite && <button type="button" aria-label={inviteLabel} onClick={onInvite} className="grid size-4 place-items-center text-muted hover:text-text"><UserPlus className="size-4" /></button>}
          {onSettings && <button type="button" aria-label={settingsLabel} onClick={onSettings} className="grid size-4 place-items-center text-muted hover:text-text"><Settings className="size-4" /></button>}
        </span>
        {mentions > 0 && !selected && <MentionBadge count={mentions} className="group-hover:hidden" />}
      </div>
      {children && <ul className="ms-8 mt-0.5 flex flex-col gap-0.5 pb-1">{children}</ul>}
    </li>
  );
}

export function ChannelCategory({ name, collapsed, onToggle, children, onAdd, addLabel = 'Create channel' }: { name: string; collapsed?: boolean; onToggle?: () => void; children: ReactNode; onAdd?: () => void; addLabel?: string }) {
  return (
    <li className="group/cat pt-4">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-0.5 px-0.5 text-2xs font-bold uppercase tracking-wide text-faint hover:text-muted"
        >
          <ChevronDown aria-hidden className={cn('size-3 shrink-0 transition-transform duration-(--motion-fast)', collapsed && '-rotate-90 rtl:rotate-90')} />
          <span className="truncate">{name}</span>
        </button>
        {onAdd && (
          <button type="button" aria-label={addLabel} onClick={onAdd} className="me-1 text-faint opacity-0 hover:text-text focus-visible:opacity-100 group-hover/cat:opacity-100">
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {!collapsed && <ul className="mt-1 flex flex-col gap-0.5">{children}</ul>}
    </li>
  );
}
