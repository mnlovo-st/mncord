// Discord-style top bar (Windows): back / forward on the left, where you are in the middle, inbox + help on
// the right next to Windows' own caption buttons. The empty parts drag the window.
import type { Message } from '@mncord/shared';
import { ArrowLeft, ArrowRight, AtSign, CircleHelp, Inbox, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { HomeMark } from '../ui/GuildIcon';
import { cn } from '../ui/cn';
import { api } from './api';
import { set, useStore } from './store';

// ── navigation history (server / DM / channel) for the arrows
interface Place { guild: string | null; dm: string | null; channel: string | null }
const useHistory = create<{ back: Place[]; fwd: Place[] }>(() => ({ back: [], fwd: [] }));
let moving = false;
const here = (): Place => {
  const s = useStore.getState();
  return { guild: s.selectedGuild, dm: s.selectedPrivate, channel: s.selectedGuild ? (s.selectedChannel[s.selectedGuild] ?? null) : null };
};
const same = (a: Place, b: Place) => a.guild === b.guild && a.dm === b.dm && a.channel === b.channel;
let last = here();
useStore.subscribe(() => {
  const now = here();
  if (same(now, last)) return;
  if (!moving) useHistory.setState((h) => ({ back: [...h.back.slice(-49), last], fwd: [] }));
  last = now;
});
function go(p: Place) {
  moving = true;
  set((s) => ({ selectedGuild: p.guild, selectedPrivate: p.dm, selectedChannel: p.guild && p.channel ? { ...s.selectedChannel, [p.guild]: p.channel } : s.selectedChannel }));
  last = here();
  moving = false;
}
const goBack = () => {
  const { back, fwd } = useHistory.getState();
  const p = back.at(-1);
  if (!p) return;
  useHistory.setState({ back: back.slice(0, -1), fwd: [here(), ...fwd] });
  go(p);
};
const goForward = () => {
  const { back, fwd } = useHistory.getState();
  const p = fwd[0];
  if (!p) return;
  useHistory.setState({ back: [...back, here()], fwd: fwd.slice(1) });
  go(p);
};

function Where() {
  const { t } = useTranslation();
  const guild = useStore((s) => (s.selectedGuild ? s.guilds[s.selectedGuild] : undefined));
  const dm = useStore((s) => (!s.selectedGuild && s.selectedPrivate ? s.privateChannels[s.selectedPrivate] : undefined));
  if (guild)
    return (
      <>
        {guild.iconUrl ? <img src={guild.iconUrl} alt="" className="size-4 rounded-[5px] object-cover" draggable={false} /> : <span className="grid size-4 place-items-center rounded-[5px] bg-surface-raised text-[9px] font-bold">{[...guild.name][0]}</span>}
        <span className="truncate">{guild.name}</span>
      </>
    );
  if (dm)
    return (
      <>
        <AtSign className="size-4 text-faint" aria-hidden />
        <span className="truncate">{dm.name ?? dm.recipients.map((r) => r.displayName ?? r.username).join(', ')}</span>
      </>
    );
  return (
    <>
      <Users className="size-4 text-faint" aria-hidden />
      <span className="truncate">{t('home.title')}</span>
    </>
  );
}

function InboxButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<(Message & { guildId?: string | null })[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setItems(null);
    void api<(Message & { guildId?: string | null })[]>('GET', '/users/@me/mentions?limit=25').then(setItems).catch(() => setItems([]));
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, [open]);
  const jump = (m: Message & { guildId?: string | null }) => {
    setOpen(false);
    if (m.guildId) set((s) => ({ selectedGuild: m.guildId!, selectedChannel: { ...s.selectedChannel, [m.guildId!]: m.channelId } }));
    else set({ selectedGuild: null, selectedPrivate: m.channelId });
  };
  return (
    <div ref={ref} className="relative [-webkit-app-region:no-drag]">
      <button type="button" aria-label={t('titlebar.inbox')} title={t('titlebar.inbox')} onClick={() => setOpen((o) => !o)} className={cn('grid size-7 place-items-center rounded-sm text-muted hover:bg-surface-hover hover:text-text', open && 'bg-surface-hover text-text')}>
        <Inbox className="size-[18px]" />
      </button>
      {open && (
        <div className="anim-pop absolute end-0 top-9 z-[70] w-[420px] overflow-hidden rounded-md border border-border bg-popover shadow-pop">
          <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 font-display font-semibold"><AtSign className="size-4" />{t('titlebar.mentions')}</h2>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {items === null ? (
              <div className="m-2 h-12 animate-pulse rounded bg-surface-raised" />
            ) : items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted">{t('titlebar.noMentions')}</p>
            ) : (
              items.map((m) => (
                <button key={m.id} type="button" onClick={() => jump(m)} className="block w-full rounded-sm px-3 py-2 text-start hover:bg-surface-hover">
                  <span className="block text-xs font-semibold text-muted">{m.author?.displayName ?? m.author?.username ?? '…'}</span>
                  <span className="line-clamp-2 text-sm" dir="auto">{m.content || '…'}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TitleBar({ app }: { app: boolean }) {
  const { t } = useTranslation();
  const canBack = useHistory((h) => h.back.length > 0);
  const canFwd = useHistory((h) => h.fwd.length > 0);
  return (
    <div dir="ltr" className="fixed inset-x-0 top-0 z-[60] flex h-[var(--titlebar-h)] items-center bg-bg-deep pe-[146px] ps-2 text-sm [-webkit-app-region:drag]">
      <div className="flex w-[200px] items-center gap-1">
        {app ? (
          <>
            <button type="button" aria-label={t('titlebar.back')} disabled={!canBack} onClick={goBack} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-30 [-webkit-app-region:no-drag]"><ArrowLeft className="size-4" /></button>
            <button type="button" aria-label={t('titlebar.forward')} disabled={!canFwd} onClick={goForward} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-30 [-webkit-app-region:no-drag]"><ArrowRight className="size-4" /></button>
          </>
        ) : (
          <span className="flex items-center gap-1.5 ps-1 font-display text-xs font-semibold text-muted"><HomeMark className="size-4 text-accent" />mncord</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 font-semibold text-text">{app ? <Where /> : null}</div>
      <div className="flex w-[200px] items-center justify-end gap-1">
        {app && <InboxButton />}
        <a href="https://github.com/mnlovo-st/mncord#readme" target="_blank" rel="noreferrer" aria-label={t('titlebar.help')} title={t('titlebar.help')} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-surface-hover hover:text-text [-webkit-app-region:no-drag]"><CircleHelp className="size-[18px]" /></a>
      </div>
    </div>
  );
}
