// S07 friends · S08 DM · S09 group DM (home side of the app)
import type { PrivateChannel, Relationship } from '@mncord/shared';
import { Check, MessageCircle, Phone, Plus, Search, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { Avatar, type Status } from '../../ui/Avatar';
import { MentionBadge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { api, ApiError } from '../api';
import { errorText } from '../i18n';
import { dmAsChannel, isUnread, mentionsIn, openProfile, set, sortedPrivate, useStore } from '../store';
import { joinVoice, useVoice } from '../voice';
import { ChatView } from './Chat';
import { MediaGrid } from './Media';
import { VoiceControls } from './VoiceRoom';

const statusOf = (p: string | undefined): Status => (p === 'online' || p === 'idle' || p === 'dnd' ? p : 'offline');
const nameOf = (u: { displayName: string | null; username: string }) => u.displayName ?? u.username;

export async function openDm(userId: string) {
  const pc = await api<PrivateChannel>('POST', '/users/@me/channels', { recipientIds: [userId] });
  set((s) => ({ privateChannels: { ...s.privateChannels, [pc.id]: pc }, selectedGuild: null, selectedPrivate: pc.id }));
  return pc;
}

export async function callDm(channelId: string) {
  set({ selectedGuild: null, selectedPrivate: channelId });
  await joinVoice(null, channelId);
  await api('POST', `/calls/${channelId}/ring`, {}).catch(() => {});
}

// ── sidebar
export function HomeSidebar() {
  const { t } = useTranslation();
  const selected = useStore((s) => s.selectedPrivate);
  const list = useStore(useShallow(sortedPrivate));
  const presence = useStore((s) => s.presence);
  const pending = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 'incoming').length);
  const readStates = useStore((s) => s.readStates);
  const [group, setGroup] = useState(false);

  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-border px-2.5">
        <div className="flex h-7 w-full items-center gap-2 rounded-xs bg-bg-deep px-2 text-sm text-faint"><Search className="size-4" />{t('friends.search')}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <button
          type="button"
          onClick={() => set({ selectedPrivate: null })}
          className={cn('flex h-11 w-full items-center gap-3 rounded-sm px-3 font-medium', !selected ? 'bg-surface-selected text-text' : 'text-muted hover:bg-surface-hover hover:text-text')}
        >
          <Users className="size-5" /> <span className="flex-1 text-start">{t('friends.title')}</span>
          <MentionBadge count={pending} />
        </button>
        <div className="mt-4 flex items-center justify-between px-2 pb-1">
          <h2 className="text-2xs font-bold uppercase tracking-wide text-faint">{t('friends.dms')}</h2>
          <Tooltip content={t('friends.newGroup')}>
            <button type="button" aria-label={t('friends.newGroup')} onClick={() => setGroup(true)} className="text-faint hover:text-text"><Plus className="size-4" /></button>
          </Tooltip>
        </div>
        <ul className="flex flex-col gap-0.5">
          {list.map((pc) => {
            const ch = dmAsChannel(pc);
            const other = pc.type === 'dm' ? pc.recipients[0] : undefined;
            return (
              <li key={pc.id} className="group relative">
                <button
                  type="button"
                  onClick={() => set({ selectedPrivate: pc.id })}
                  className={cn('flex h-11 w-full items-center gap-3 rounded-sm px-2 pe-8 text-start', selected === pc.id ? 'bg-surface-selected text-text' : 'text-muted hover:bg-surface-hover hover:text-text')}
                >
                  {other ? (
                    <Avatar name={nameOf(other)} size={32} status={statusOf(presence[other.id])} />
                  ) : (
                    <span className="grid size-8 place-items-center rounded-full bg-accent text-on-accent"><Users className="size-4" /></span>
                  )}
                  <span className="min-w-0 leading-tight">
                    <span className={cn('block truncate font-medium', isUnread({ readStates }, pc.id, pc.lastMessageId) && selected !== pc.id && 'font-bold text-text')}>{ch.name}</span>
                    {pc.type === 'group_dm' && <span className="block truncate text-xs text-faint">{t('joinGuild.preview', { count: pc.recipients.length + 1 })}</span>}
                  </span>
                </button>
                {mentionsIn({ readStates }, pc.id) > 0 && selected !== pc.id && <MentionBadge count={mentionsIn({ readStates }, pc.id)} className="absolute end-8 top-1/2 -translate-y-1/2 group-hover:hidden" />}
                <button
                  type="button"
                  aria-label={t('friends.closeDm')}
                  onClick={() => void api('DELETE', `/users/@me/channels/${pc.id}`)}
                  className="absolute end-2 top-1/2 hidden -translate-y-1/2 text-faint hover:text-text group-hover:block"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <CreateGroupModal open={group} onClose={() => setGroup(false)} />
    </>
  );
}

// ── main area
export function HomeMain() {
  const selected = useStore((s) => s.selectedPrivate);
  const pc = useStore((s) => (selected ? s.privateChannels[selected] : undefined));
  if (pc) return <DmView pc={pc} />;
  return <FriendsView />;
}

type FTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

function FriendsView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<FTab>('online');
  const rels = useStore((s) => s.relationships);
  const presence = useStore((s) => s.presence);
  const all = Object.values(rels);
  const friends = all.filter((r) => r.type === 'friend');
  const lists: Record<Exclude<FTab, 'add'>, Relationship[]> = {
    online: friends.filter((r) => statusOf(presence[r.id]) !== 'offline'),
    all: friends,
    pending: all.filter((r) => r.type === 'incoming' || r.type === 'outgoing'),
    blocked: all.filter((r) => r.type === 'blocked'),
  };
  const pendingIn = lists.pending.filter((r) => r.type === 'incoming').length;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border px-4 shadow-low">
        <span className="flex items-center gap-2 font-semibold"><Users className="size-5 text-faint" />{t('friends.title')}</span>
        <span className="h-6 w-px bg-border" />
        <nav className="flex items-center gap-2" role="tablist">
          {(['online', 'all', 'pending', 'blocked'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={cn('flex items-center gap-1.5 rounded-xs px-2 py-0.5 font-medium', tab === id ? 'bg-surface-selected text-text' : 'text-muted hover:bg-surface-hover hover:text-text')}>
              {t(`friends.${id}`)}{id === 'pending' && <MentionBadge count={pendingIn} />}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={tab === 'add'} onClick={() => setTab('add')}
            className={cn('rounded-xs px-2 py-0.5 font-semibold', tab === 'add' ? 'bg-transparent text-success' : 'bg-success-solid text-on-success')}>
            {t('friends.add')}
          </button>
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {tab === 'add' ? <AddFriend /> : <FriendList tab={tab} list={lists[tab]} />}
      </div>
    </>
  );
}

function AddFriend() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const u = name.trim().replace(/^@/, '').toLowerCase();
    if (!u) return;
    setBusy(true);
    try {
      await api('POST', '/users/@me/relationships', { username: u });
      setMsg({ ok: true, text: t('friends.sent', { name: u }) });
      setName('');
    } catch (e) {
      setMsg({ ok: false, text: errorText((e as ApiError).code) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border-b border-border pb-6">
      <h2 className="font-display text-lg font-semibold">{t('friends.addTitle')}</h2>
      <p className="mb-4 text-sm text-muted">{t('friends.addSub')}</p>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className={cn('flex items-center gap-2 rounded-md border bg-bg-deep p-2 ps-4', msg ? (msg.ok ? 'border-success' : 'border-danger') : 'border-border-input focus-within:border-focus')}>
        <input value={name} onChange={(e) => { setName(e.target.value); setMsg(null); }} placeholder={t('friends.addPlaceholder')} dir="ltr" aria-label={t('friends.addPlaceholder')} className="h-9 flex-1 bg-transparent text-base outline-none placeholder:text-faint" />
        <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>{t('friends.send')}</Button>
      </form>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('mt-2 text-sm', msg.ok ? 'text-success' : 'text-danger-text')}>{msg.text}</p>}
    </section>
  );
}

function FriendList({ tab, list }: { tab: Exclude<FTab, 'add'>; list: Relationship[] }) {
  const { t } = useTranslation();
  const presence = useStore((s) => s.presence);
  const counts = { online: 'countOnline', all: 'countAll', pending: 'countPending', blocked: 'countBlocked' } as const;
  const empties = { online: 'emptyOnline', all: 'emptyAll', pending: 'emptyPending', blocked: 'emptyBlocked' } as const;
  const act = (method: string, id: string, body?: unknown) => void api(method, `/users/@me/relationships/${id}`, body).catch(() => {});
  const Icon = ({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) => (
    <Tooltip content={label}>
      <button type="button" aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={cn('grid size-9 place-items-center rounded-full bg-surface text-muted', danger ? 'hover:text-danger-text' : 'hover:text-text')}>{children}</button>
    </Tooltip>
  );
  if (!list.length) return <p className="mt-16 text-center text-muted">{t(`friends.${empties[tab]}`)}</p>;
  return (
    <>
      <h3 className="mb-2 text-2xs font-bold uppercase tracking-wide text-faint">{t(`friends.${counts[tab]}`, { count: list.length })}</h3>
      <ul>
        {list.map((r) => {
          const st = statusOf(presence[r.id]);
          return (
            <li key={r.id} className="group flex h-[62px] items-center gap-3 rounded-sm border-t border-border px-2 hover:bg-surface-hover" onClick={(e) => openProfile(r.id, e)}>
              <Avatar name={nameOf(r.user)} size={32} status={r.type === 'friend' ? st : undefined} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate font-semibold">{r.nickname ?? nameOf(r.user)} <span className="hidden text-sm font-normal text-muted group-hover:inline">@{r.user.username}</span></p>
                <p className="truncate text-sm text-muted">
                  {r.type === 'friend' ? t(`status.${st}`) : r.type === 'incoming' ? t('friends.incoming') : r.type === 'outgoing' ? t('friends.outgoing') : `@${r.user.username}`}
                </p>
              </div>
              <div className="flex gap-2">
                {r.type === 'friend' && (
                  <>
                    <Icon label={t('friends.message')} onClick={() => void openDm(r.id)}><MessageCircle className="size-5" /></Icon>
                    <Icon label={t('friends.call')} onClick={() => void openDm(r.id).then((pc) => callDm(pc.id))}><Phone className="size-5" /></Icon>
                    <Icon label={t('friends.remove')} danger onClick={() => act('DELETE', r.id)}><UserMinus className="size-5" /></Icon>
                  </>
                )}
                {r.type === 'incoming' && (
                  <>
                    <Icon label={t('friends.accept')} onClick={() => act('PUT', r.id, { type: 'friend' })}><Check className="size-5 text-success" /></Icon>
                    <Icon label={t('friends.decline')} danger onClick={() => act('DELETE', r.id)}><X className="size-5" /></Icon>
                  </>
                )}
                {r.type === 'outgoing' && <Icon label={t('friends.cancel')} danger onClick={() => act('DELETE', r.id)}><X className="size-5" /></Icon>}
                {r.type === 'blocked' && <Icon label={t('friends.unblock')} onClick={() => act('DELETE', r.id)}><UserPlus className="size-5" /></Icon>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function DmView({ pc }: { pc: PrivateChannel }) {
  const { t } = useTranslation();
  const channel = useMemo(() => dmAsChannel(pc), [pc]);
  const voice = useStore((s) => s.voice);
  const names = useStore((s) => s.names);

  const call = useStore((s) => s.calls[pc.id]);
  const v = useVoice();
  const inCall = Object.values(voice).filter((x) => x.channelId === pc.id);
  const imIn = v.channelId === pc.id;
  const active = inCall.length > 0 || !!call;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {active && (
        <div className="flex h-[45%] min-h-[260px] shrink-0 flex-col border-b border-border bg-bg-deep">
          {inCall.length > 0 ? <MediaGrid users={inCall} /> : <div className="flex-1" />}
          {call?.ringing.length ? <p className="pb-1 text-center text-sm text-muted">{t('call.ringing')} {call.ringing.map((u) => names[u] ?? '…').join(', ')}</p> : null}
          <div className="flex justify-center pb-4">
            {imIn ? <VoiceControls compact /> : <Button variant="success" icon={<Phone className="size-4" />} onClick={() => void joinVoice(null, pc.id)}>{t('call.join')}</Button>}
          </div>
        </div>
      )}
      <ChatView
        channel={channel}
        headerExtra={
          !active && (
            <Tooltip content={t('friends.call')} side="bottom">
              <button type="button" aria-label={t('friends.call')} onClick={() => void callDm(pc.id)} className="grid size-8 place-items-center rounded-sm text-muted hover:text-text"><Phone className="size-5" /></button>
            </Tooltip>
          )
        }
      />
    </div>
  );
}

function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const friends = useStore(useShallow((s) => Object.values(s.relationships).filter((r) => r.type === 'friend')));
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const shown = friends.filter((f) => `${f.user.username} ${f.user.displayName ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const create = async () => {
    if (!picked.length) return;
    setBusy(true);
    try {
      const pc = await api<PrivateChannel>('POST', '/users/@me/channels', { recipientIds: picked });
      set((s) => ({ privateChannels: { ...s.privateChannels, [pc.id]: pc }, selectedPrivate: pc.id }));
      setPicked([]);
      onClose();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={t('friends.groupTitle')} description={t('friends.groupSub', { left: 9 - picked.length })} closeLabel={t('common.close')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!picked.length} onClick={() => void create()}>{t('friends.create')}</Button></>}>
      <Input variant="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('friends.search')} aria-label={t('friends.search')} />
      <ul className="mt-3 max-h-72 overflow-y-auto">
        {shown.map((f) => {
          const on = picked.includes(f.id);
          return (
            <li key={f.id}>
              <label className="flex h-11 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-surface-hover">
                <Avatar name={nameOf(f.user)} size={32} />
                <span className="flex-1 truncate">{nameOf(f.user)} <span className="text-sm text-faint">@{f.user.username}</span></span>
                <input type="checkbox" className="size-5 accent-[var(--c-accent)]" checked={on} disabled={!on && picked.length >= 9}
                  onChange={() => setPicked((p) => (on ? p.filter((x) => x !== f.id) : [...p, f.id]))} />
              </label>
            </li>
          );
        })}
      </ul>
      {err && <p role="alert" className="mt-2 text-sm text-danger-text">{err}</p>}
    </Modal>
  );
}
