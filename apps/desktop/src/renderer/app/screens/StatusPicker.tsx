// Your own profile popout (click your avatar bottom-left), like Discord's: banner, avatar, badges,
// custom status, Edit Profile, status (online / idle / do not disturb / invisible) and Copy User ID.
import type { SelfUser } from '@mncord/shared';
import { ChevronRight, Copy, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { ProfileEffect, StyledName } from '../../ui/Cosmetics';
import { DevBadge } from '../../ui/DevBadge';
import { cn } from '../../ui/cn';
import { api, avatarUrl } from '../api';
import { set, useStore } from '../store';

const STATUSES = [
  { id: 'online', color: 'bg-online' },
  { id: 'idle', color: 'bg-idle' },
  { id: 'dnd', color: 'bg-dnd' },
  { id: 'invisible', color: 'bg-offline' },
] as const;

export function StatusPicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const [text, setText] = useState(me?.customStatus?.text ?? '');
  const [statusOpen, setStatusOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) && onClose();
    setTimeout(() => {
      addEventListener('mousedown', close);
      addEventListener('keydown', close);
    });
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [onClose]);
  if (!me) return null;
  const patch = async (body: Record<string, unknown>) => {
    const u = await api<SelfUser>('PATCH', '/users/@me', body).catch(() => null);
    if (u) set({ me: u });
  };
  const banner = me.bannerKey ? avatarUrl(me.bannerKey) : undefined;
  const color = me.accentColor != null ? `#${me.accentColor.toString(16).padStart(6, '0')}` : null;
  const cur = STATUSES.find((s) => s.id === me.status) ?? STATUSES[0];
  const row = 'flex h-9 w-full items-center gap-3 rounded-sm px-2 text-sm text-muted hover:bg-surface-selected hover:text-text';
  return (
    <div ref={ref} role="dialog" aria-label={me.displayName ?? me.username} className="anim-pop fixed bottom-[60px] start-2 z-50 w-[300px] overflow-hidden rounded-xl bg-popover shadow-pop">
      <ProfileEffect id={me.style?.effect} />
      <div className="h-[72px] bg-cover bg-center" style={banner ? { backgroundImage: `url(${banner})` } : { background: color ?? 'linear-gradient(120deg, color-mix(in srgb, var(--c-accent) 55%, #000), color-mix(in srgb, var(--c-text-link) 40%, #000))' }} />
      <div className="relative px-4 pb-3">
        <div className="-mt-11 mb-2 w-fit rounded-full border-[6px] border-popover">
          <Avatar name={me.displayName ?? me.username} src={avatarUrl(me.avatarKey)} size={80} status={me.status === 'invisible' ? 'offline' : me.status} cutout="border-popover" decoration={me.style?.decoration} />
        </div>
        <p className="flex items-center gap-2 font-display text-xl font-bold leading-tight" dir="auto"><StyledName style={me.style}>{me.displayName ?? me.username}</StyledName><DevBadge flags={me.flags} size="md" /></p>
        <p className="text-sm text-muted">{me.username}</p>
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void patch({ customStatus: text.trim() ? { text: text.trim() } : null }); onClose(); }}>
          <input value={text} maxLength={128} onChange={(e) => setText(e.target.value)} dir="auto" placeholder={t('status.custom')} aria-label={t('status.custom')}
            className="h-9 w-full rounded-md bg-bg-deep/70 px-3 text-sm text-text outline-none ring-accent placeholder:text-faint focus:ring-1" />
        </form>
        <div className="mt-3 rounded-lg bg-bg-deep/60 p-1.5">
          <button type="button" className={row} onClick={() => { onClose(); dispatchEvent(new CustomEvent('mncord:settings', { detail: 'profile' })); }}><Pencil className="size-4" />{t('um.editProfile')}</button>
          <div className="mx-2 my-1 h-px bg-border" />
          <button type="button" className={cn(row, 'justify-between')} aria-expanded={statusOpen} onClick={() => setStatusOpen((o) => !o)}>
            <span className="flex items-center gap-3"><span className={cn('size-2.5 rounded-full', cur.color)} />{t(`status.${cur.id}`)}</span>
            <ChevronRight className={cn('size-4 transition-transform', statusOpen && 'rotate-90')} />
          </button>
          {statusOpen && STATUSES.map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={me.status === s.id} onClick={() => { void patch({ status: s.id }); onClose(); }} className={cn(row, 'ps-6', me.status === s.id && 'text-text')}>
              <span className={cn('size-2.5 rounded-full', s.color)} />
              <span className="min-w-0">
                <span className="block">{t(`status.${s.id}`)}</span>
                {s.id === 'dnd' && <span className="block text-xs text-faint">{t('status.dndSub')}</span>}
                {s.id === 'invisible' && <span className="block text-xs text-faint">{t('status.invisibleSub')}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 rounded-lg bg-bg-deep/60 p-1.5">
          <button type="button" className={row} onClick={() => { void navigator.clipboard.writeText(me.id); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
            <Copy className="size-4" />{copied ? t('um.copied') : t('um.copyId')}
          </button>
        </div>
      </div>
    </div>
  );
}
