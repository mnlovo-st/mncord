import { DevBadge } from '../../ui/DevBadge';
// S17 profile card (opens where you clicked) · S36 incoming call
import type { FullProfile } from '@mncord/shared';
import { Ban, MessageCircle, Phone, PhoneOff, UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, type Status } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { api, avatarUrl } from '../api';
import { loopSound, playSound } from '../sounds';
import { set, useStore } from '../store';
import { joinVoice } from '../voice';
import { openDm } from './Home';

export function ProfileCard() {
  const { t, i18n } = useTranslation();
  const target = useStore((s) => s.profile);
  const me = useStore((s) => s.me);
  const rel = useStore((s) => (target ? s.relationships[target.userId]?.type : undefined));
  const presence = useStore((s) => (target ? s.presence[target.userId] : undefined));
  const [p, setP] = useState<FullProfile | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    setP(null);
    if (!target) return;
    void api<FullProfile>('GET', `/users/${target.userId}/profile`).then(setP).catch(() => set({ profile: null }));
  }, [target]);

  // keep the card on screen
  useLayoutEffect(() => {
    if (!target || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.min(Math.max(8, target.x + 12), innerWidth - r.width - 8), top: Math.min(Math.max(8, target.y - 40), innerHeight - r.height - 8) });
  }, [target, p]);

  useEffect(() => {
    if (!target) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) set({ profile: null });
    };
    setTimeout(() => {
      addEventListener('mousedown', close);
      addEventListener('keydown', close);
    });
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [target]);

  if (!target) return null;
  const isMe = target.userId === me?.id;
  const status: Status = isMe ? 'online' : presence === 'online' || presence === 'idle' || presence === 'dnd' ? presence : 'offline';
  const relationship = rel ?? p?.relationship ?? null;
  const since = p ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(p.createdAt)) : '';
  const act = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => {});
    set({ profile: null });
  };

  return (
    <div ref={ref} role="dialog" aria-label={p?.displayName ?? p?.username ?? ''} className="anim-pop fixed z-50 w-[300px] overflow-hidden rounded-lg bg-popover shadow-pop" style={pos}>
      <div className="h-[60px] bg-cover bg-center" style={{ backgroundImage: p?.bannerKey ? `url(${avatarUrl(p.bannerKey)})` : undefined, background: p?.bannerKey ? undefined : p?.accentColor != null ? `#${p.accentColor.toString(16).padStart(6, '0')}` : 'linear-gradient(120deg, color-mix(in srgb, var(--c-accent) 50%, #000), color-mix(in srgb, var(--c-text-link) 40%, #000))' }} />
      <div className="px-4 pb-4">
        <div className="-mt-10 mb-2 w-fit rounded-full border-[6px] border-popover"><Avatar name={p?.displayName ?? p?.username ?? '…'} src={avatarUrl(p?.avatarKey)} size={80} status={status} cutout="border-popover" /></div>
        {!p ? (
          <div className="h-24 animate-pulse rounded-md bg-surface-raised" />
        ) : (
          <>
            <h3 className="flex items-center gap-2 font-display text-lg font-bold leading-tight" dir="auto">{p.displayName ?? p.username}<DevBadge flags={p.flags} size="md" /></h3>
            <p className="text-sm text-muted">@{p.username}{p.pronouns ? ` · ${p.pronouns}` : ''}</p>
            <div className="mt-3 rounded-md bg-bg-deep/60 p-3 text-sm">
              {p.bio && (
                <>
                  <p className="text-2xs font-bold uppercase tracking-wide text-faint">{t('profile.aboutMe')}</p>
                  <p className="mb-3 mt-1 whitespace-pre-wrap" dir="auto">{p.bio}</p>
                </>
              )}
              <p className="text-2xs font-bold uppercase tracking-wide text-faint">{t('profile.member')}</p>
              <p className="mt-1">{since}</p>
              {!isMe && (p.mutualGuilds.length > 0 || p.mutualFriends.length > 0) && (
                <p className="mt-3 text-xs text-muted">
                  {[p.mutualGuilds.length ? t('profile.mutualServers', { count: p.mutualGuilds.length }) : '', p.mutualFriends.length ? t('profile.mutualFriends', { count: p.mutualFriends.length }) : ''].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {isMe ? (
              <p className="mt-3 text-center text-sm text-faint">{t('profile.you')}</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {relationship !== 'blocked' && (
                  <Button size="sm" className="flex-1 justify-center" icon={<MessageCircle className="size-4" />} onClick={() => void act(() => openDm(p.id))}>{t('profile.message')}</Button>
                )}
                {relationship === null && <Button size="sm" variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => void act(() => api('POST', '/users/@me/relationships', { username: p.username }))}>{t('profile.addFriend')}</Button>}
                {relationship === 'outgoing' && <Button size="sm" variant="secondary" disabled>{t('profile.pending')}</Button>}
                {relationship === 'incoming' && <Button size="sm" variant="success" icon={<UserCheck className="size-4" />} onClick={() => void act(() => api('PUT', `/users/@me/relationships/${p.id}`, { type: 'friend' }))}>{t('friends.accept')}</Button>}
                {relationship === 'blocked' ? (
                  <Button size="sm" variant="secondary" onClick={() => void act(() => api('DELETE', `/users/@me/relationships/${p.id}`))}>{t('profile.unblock')}</Button>
                ) : (
                  <Button size="sm" variant="ghost" icon={<Ban className="size-4" />} onClick={() => void act(() => api('PUT', `/users/@me/relationships/${p.id}`, { type: 'blocked' }))}>{t('profile.block')}</Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Rings while someone calls you in a DM. Accept joins the call, decline stops your ring. */
export function IncomingCall() {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const calls = useStore((s) => s.calls);
  const names = useStore((s) => s.names);
  const call = Object.values(calls).find((c) => me && c.ringing.includes(me.id) && c.callerId !== me.id);

  useEffect(() => {
    if (!call) return;
    const stop = loopSound('ring_in');
    return stop;
  }, [call?.channelId]); // eslint-disable-line react-hooks/exhaustive-deps
  // you're calling someone: soft outgoing ring until they pick up or decline
  const outgoing = Object.values(calls).find((c) => me && c.callerId === me.id && c.ringing.length > 0);
  useEffect(() => {
    if (!outgoing) return;
    return loopSound('ring_out');
  }, [outgoing?.channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!call) return null;
  const caller = names[call.callerId] ?? '…';
  return (
    <div role="alertdialog" aria-label={t('call.incoming')} className="anim-pop fixed bottom-6 end-6 z-50 w-[300px] rounded-xl bg-popover p-5 text-center shadow-modal">
      <div className="mx-auto mb-3 w-fit animate-pulse rounded-full ring-4 ring-online/60"><Avatar name={caller} size={80} /></div>
      <p className="font-display text-lg font-bold">{caller}</p>
      <p className="mb-4 text-sm text-muted">{t('call.from', { name: caller })}</p>
      <div className="flex justify-center gap-6">
        <button type="button" aria-label={t('call.decline')} onClick={() => { playSound('call_end'); void api('POST', `/calls/${call.channelId}/decline`, {}); }}
          className="grid size-14 place-items-center rounded-full bg-danger-solid text-on-danger hover:brightness-110"><PhoneOff className="size-6" /></button>
        <button type="button" aria-label={t('call.accept')} onClick={() => { set({ selectedGuild: null, selectedPrivate: call.channelId }); void joinVoice(null, call.channelId); }}
          className="grid size-14 place-items-center rounded-full bg-success-solid text-on-success hover:brightness-110"><Phone className="size-6" /></button>
      </div>
    </div>
  );
}
