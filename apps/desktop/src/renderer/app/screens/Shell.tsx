// App shell: guild rail · channel sidebar · main view · member list
import type { Channel, Guild, Member } from '@mncord/shared';
import { LogIn, LogOut, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import mark from '../../assets/mark-m.webp';
import { Avatar } from '../../ui/Avatar';
import { ChannelCategory, ChannelItem } from '../../ui/ChannelItem';
import { GuildIcon } from '../../ui/GuildIcon';
import { NoticeBar } from '../../ui/Toast';
import { UserPanel, VoiceConnectedPanel, VoiceUser } from '../../ui/Voice';
import { api, avatarUrl, signOut } from '../api';
import { firstTextChannel, isUnread, mentionsIn, openProfile, set, useStore } from '../store';
import { joinVoice, leaveVoice, setDeafened, setMuted, setSuppression, stopStream, toggleCamera, useVoice } from '../voice';
import { GoLivePicker } from './Media';
import { StatusPicker } from './StatusPicker';
import { QuickSwitcher } from './QuickSwitcher';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuCheckbox, MenuItem, MenuSeparator } from '../../ui/ContextMenu';
import { isMuted, setNotification, useNotif } from '../notify';
import { ChatView } from './Chat';
import { CreateGuildModal, InviteModal, JoinGuildModal } from './Modals';
import { EditModal, SettingsScreen } from './Settings';
import { Button } from '../../ui/Button';
import { VoiceRoom } from './VoiceRoom';
import { HomeMain, HomeSidebar } from './Home';
import { IncomingCall, ProfileCard } from './Overlays';
import { LinkGuard, Lightbox } from './MessageParts';
import { RightPanel } from './Panels';
import { ChannelSettings, CreateChannelModal, ServerMenu } from './ChannelModals';
import { GuildSettings } from './GuildSettings';
import { has, P } from '@mncord/shared';

export function Shell() {
  const { t } = useTranslation();
  const connection = useStore((s) => s.connection);
  const guildOrder = useStore((s) => s.guildOrder);
  const guilds = useStore((s) => s.guilds);
  const selectedGuild = useStore((s) => s.selectedGuild);
  const [modal, setModal] = useState<'create' | 'join' | 'invite' | 'verify' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [update, setUpdate] = useState<string | null>(null);
  useEffect(() => window.mncord?.update.onReady(setUpdate), []);
  const me = useStore((s) => s.me);
  const guild = selectedGuild ? guilds[selectedGuild] : undefined;
  const rightPanel = useStore((s) => s.rightPanel);
  useNotif((s) => s.list); // re-render when mute settings change
  const readStates = useStore((s) => s.readStates);

  const selectGuild = (id: string | null) => {
    set((s) => {
      const g = id ? s.guilds[id] : undefined;
      const ch = g && !s.selectedChannel[g.id] ? firstTextChannel(g) : null;
      return { selectedGuild: id, selectedChannel: ch && g ? { ...s.selectedChannel, [g.id]: ch } : s.selectedChannel };
    });
  };

  return (
    <div className="flex h-full flex-col">
      {connection === 'reconnecting' && <NoticeBar tone="warning">{t('app.reconnecting')}</NoticeBar>}
      {connection === 'offline' && <NoticeBar tone="error">{t('app.offline')}</NoticeBar>}
      {update && <NoticeBar tone="success" action={<Button size="sm" variant="secondary" className="h-6" onClick={() => void window.mncord?.update.install()}>{t('app.restartNow')}</Button>}>{t('app.updateReady', { version: update })}</NoticeBar>}
      {me && !me.emailVerified && connection === 'ready' && (
        <NoticeBar tone="warning" action={<Button size="sm" variant="secondary" className="h-6" onClick={() => setModal('verify')}>{t('verifyEmail.action')}</Button>}>{t('verifyEmail.banner')}</NoticeBar>
      )}
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Servers" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-bg-deep py-3">
          <GuildIcon name={t('rail.home')} src={mark} selected={!selectedGuild} onClick={() => selectGuild(null)} />
          <div className="h-0.5 w-8 shrink-0 rounded-full bg-border" />
          {guildOrder.map((id) => {
            const g = guilds[id];
            if (!g) return null;
            const text = g.channels.filter((c) => c.type === 'text' || c.type === 'announcement');
            const unread = text.some((c) => isUnread({ readStates }, c.id, c.lastMessageId));
            const mentions = text.reduce((n, c) => n + mentionsIn({ readStates }, c.id), 0);
            return (
              <ContextMenu key={id}>
                <ContextMenuTrigger asChild>
                  <div className="w-full"><GuildIcon name={g.name} src={g.iconUrl ?? undefined} selected={selectedGuild === id} unread={unread} mentions={mentions} onClick={() => selectGuild(id)} /></div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <MenuItem onSelect={() => markGuildRead(g)}>{t('ctx.markRead')}</MenuItem>
                  <MenuCheckbox checked={isMuted(g.id)} onCheckedChange={(on) => void setNotification({ guildId: g.id }, on ? 'nothing' : 'default')}>{t('ctx.muteServer')}</MenuCheckbox>
                  <MenuSeparator />
                  <MenuItem onSelect={() => void navigator.clipboard.writeText(g.id)}>{t('ctx.copyId')}</MenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          <GuildIcon name={t('rail.add')} tone="action" onClick={() => setModal('create')}><Plus className="size-6" /></GuildIcon>
          <GuildIcon name={t('rail.join')} tone="action" onClick={() => setModal('join')}><LogIn className="size-5 rtl:-scale-x-100" /></GuildIcon>
          <div className="mt-auto pt-2">
            <GuildIcon name={t('auth.signOut')} tone="action" onClick={() => void signOut()}><LogOut className="size-5 text-danger-text rtl:-scale-x-100" /></GuildIcon>
          </div>
        </nav>

        <aside className="flex w-60 shrink-0 flex-col bg-surface">
          {guild ? <GuildSidebar guild={guild} onInvite={() => setModal('invite')} /> : <HomeSidebar />}
          <BottomPanels onSettings={() => setSettingsOpen(true)} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-bg">{guild ? <GuildMain guild={guild} /> : <HomeMain />}</main>
        <RightPanel />
        {guild && !rightPanel && <MemberList guild={guild} />}
      </div>

      <CreateGuildModal open={modal === 'create'} onClose={() => setModal(null)} onCreated={(g) => selectGuild(g.id)} />
      <JoinGuildModal open={modal === 'join'} onClose={() => setModal(null)} onJoined={(g) => selectGuild(g.id)} />
      {guild && <InviteModal open={modal === 'invite'} onClose={() => setModal(null)} guild={guild} />}
      <EditModal kind={modal === 'verify' ? 'verify' : null} onClose={() => setModal(null)} />
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      <ProfileCard />
      <IncomingCall />
      <QuickSwitcher />
      <Lightbox />
      <LinkGuard />
    </div>
  );
}



function GuildSidebar({ guild, onInvite }: { guild: Guild; onInvite: () => void }) {
  const { t } = useTranslation();
  const selected = useStore((s) => s.selectedChannel[guild.id]);
  const voice = useStore((s) => s.voice);
  const names = useStore((s) => s.names);
  const speaking = useStore((s) => s.speaking);
  const me = useStore((s) => s.me);
  const readStates = useStore((s) => s.readStates);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [gs, setGs] = useState(false);
  const [create, setCreate] = useState<{ category: Channel | null; kind: 'channel' | 'category' } | null>(null);
  const [editCh, setEditCh] = useState<string | null>(null);
  const canManage = has(BigInt(guild.myGuildPermissions), P.MANAGE_CHANNELS);

  const { cats, loose } = useMemo(() => {
    const sorted = [...guild.channels].sort((a, b) => a.position - b.position);
    const cats = sorted.filter((c) => c.type === 'category').map((c) => ({ cat: c, children: sorted.filter((x) => x.parentId === c.id) }));
    const loose = sorted.filter((c) => c.type !== 'category' && !c.parentId);
    return { cats, loose };
  }, [guild.channels]);

  const open = (c: Channel) => {
    set((s) => ({ selectedChannel: { ...s.selectedChannel, [guild.id]: c.id } }));
    if (c.type === 'voice') void joinVoice(guild.id, c.id);
  };

  const renderChannel = (c: Channel) => {
    if (c.type !== 'text' && c.type !== 'voice' && c.type !== 'announcement') return null;
    const inVoice = Object.values(voice).filter((v) => v.channelId === c.id);
    return (
      <ContextMenu key={c.id}>
      <ContextMenuTrigger asChild>
      <div>
      <ChannelItem type={c.type} name={c.name ?? ''} selected={selected === c.id} onClick={() => open(c)} inviteLabel={t('guild.invite')}
        unread={c.type !== 'voice' && isUnread({ readStates }, c.id, c.lastMessageId)} mentions={mentionsIn({ readStates }, c.id)}
        onInvite={has(BigInt(guild.myPermissions[c.id] ?? '0'), P.CREATE_INVITE) ? onInvite : undefined}
        onSettings={has(BigInt(guild.myPermissions[c.id] ?? '0'), P.MANAGE_CHANNELS) ? () => setEditCh(c.id) : undefined} settingsLabel={t('ch.settings')}>
        {inVoice.length > 0
          ? inVoice.map((v) => <VoiceUser key={v.userId} name={names[v.userId] ?? '…'} speaking={!!speaking[v.userId]} muted={v.selfMute} live={v.selfStream} self={v.userId === me?.id} />)
          : undefined}
      </ChannelItem>
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {c.type !== 'voice' && c.lastMessageId && (
          <MenuItem onSelect={() => { set((s) => ({ readStates: { ...s.readStates, [c.id]: { channelId: c.id, lastReadMessageId: c.lastMessageId, mentionCount: 0 } } })); void api('POST', `/channels/${c.id}/ack`, { messageId: c.lastMessageId }).catch(() => {}); }}>{t('ctx.markRead')}</MenuItem>
        )}
        {c.type !== 'voice' && <MenuCheckbox checked={isMuted(guild.id, c.id)} onCheckedChange={(on) => void setNotification({ channelId: c.id }, on ? 'nothing' : 'default')}>{t('ctx.muteChannel')}</MenuCheckbox>}
        {has(BigInt(guild.myPermissions[c.id] ?? '0'), P.MANAGE_CHANNELS) && <MenuItem onSelect={() => setEditCh(c.id)}>{t('ch.settings')}</MenuItem>}
        <MenuSeparator />
        <MenuItem onSelect={() => void navigator.clipboard.writeText(c.id)}>{t('ctx.copyId')}</MenuItem>
      </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <>
      <ServerMenu guild={guild} onInvite={onInvite} onSettings={() => setGs(true)} onCreateChannel={() => setCreate({ category: null, kind: 'channel' })} onCreateCategory={() => setCreate({ category: null, kind: 'category' })} />
      <ul className="flex-1 overflow-y-auto px-2 pb-3">
        {loose.map(renderChannel)}
        {cats.map(({ cat, children }) => (
          <ChannelCategory key={cat.id} name={cat.name ?? ''} collapsed={collapsed[cat.id]} onToggle={() => setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
            onAdd={canManage ? () => setCreate({ category: cat, kind: 'channel' }) : undefined} addLabel={t('gs.createChannel')}>
            {children.map(renderChannel)}
          </ChannelCategory>
        ))}
      </ul>
      {gs && <GuildSettings guild={guild} onClose={() => setGs(false)} />}
      {create && <CreateChannelModal guild={guild} category={create.category} kind={create.kind} onClose={() => setCreate(null)} />}
      {editCh && guild.channels.find((c) => c.id === editCh) && <ChannelSettings guild={guild} channel={guild.channels.find((c) => c.id === editCh)!} onClose={() => setEditCh(null)} />}
    </>
  );
}

function BottomPanels({ onSettings }: { onSettings: () => void }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const guilds = useStore((s) => s.guilds);
  const v = useVoice();
  const [picker, setPicker] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const privateCh = useStore((s) => (v.channelId ? s.privateChannels[v.channelId] : undefined));
  const channel = v.channelId && v.guildId ? guilds[v.guildId]?.channels.find((c) => c.id === v.channelId) : privateCh ? { name: privateCh.recipients.map((r) => r.displayName ?? r.username).join(', ') } : undefined;
  if (!me) return null;
  return (
    <>
      {v.status !== 'idle' && channel && (
        <VoiceConnectedPanel
          channel={v.guildId ? `${channel.name} / ${guilds[v.guildId]?.name ?? ''}` : String(channel.name)}
          labels={{
            connected: v.status === 'connecting' ? t('voice.connecting') : t('voice.connected'),
            disconnect: t('voice.leave'),
            camera: t('live.camera'),
            screen: v.streaming ? t('live.stop') : t('live.goLive'),
            noise: `${t('voice.noise')}: ${v.suppression === 'off' ? 'off' : v.suppression === 'gtcrn' ? 'AI' : 'RNNoise'}`,
            ping: v.status,
          }}
          onDisconnect={() => void leaveVoice()}
          camera={v.camera}
          streaming={v.streaming}
          onCamera={() => void toggleCamera()}
          onScreen={() => (v.streaming ? void stopStream() : setPicker(true))}
          onNoise={() => void setSuppression(v.suppression === 'gtcrn' ? 'rnnoise' : v.suppression === 'rnnoise' ? 'off' : 'gtcrn')}
        />
      )}
      <UserPanel
            name={me.displayName ?? me.username}
            avatarSrc={avatarUrl(me.avatarKey)}
            tag={me.customStatus?.text ?? `@${me.username}`}
            status={me.status === 'invisible' ? 'offline' : me.status}
            onAvatarClick={() => setStatusOpen((o) => !o)}
            muted={v.muted}
            deafened={v.deafened}
            onMute={() => void setMuted(!v.muted)}
            onDeafen={() => void setDeafened(!v.deafened)}
            labels={{ mute: t('voice.mute'), unmute: t('voice.unmute'), deafen: t('voice.deafen'), undeafen: t('voice.undeafen'), settings: t('voice.settings'), status: t('guild.online') }}
            onSettings={onSettings}
          />
      {picker && <GoLivePicker onClose={() => setPicker(false)} />}
      {statusOpen && <StatusPicker onClose={() => setStatusOpen(false)} />}
    </>
  );
}

function GuildMain({ guild }: { guild: Guild }) {
  const selected = useStore((s) => s.selectedChannel[guild.id]);
  const channel = guild.channels.find((c) => c.id === selected);
  if (!channel) return null;
  if (channel.type === 'voice') return <VoiceRoom guild={guild} channel={channel} />;
  return <ChatView guild={guild} channel={channel} />;
}

function MemberList({ guild }: { guild: Guild }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<(Member & { online?: boolean })[] | null>(null);
  const presence = useStore((s) => s.presence);
  const me = useStore((s) => s.me);
  const memberCount = guild.memberCount;
  useEffect(() => {
    let live = true;
    setMembers(null);
    void api<(Member & { online?: boolean })[]>('GET', `/guilds/${guild.id}/members`).then((m) => {
      if (!live) return;
      setMembers(m);
      set((s) => ({ names: { ...s.names, ...Object.fromEntries(m.map((x) => [x.userId, x.nick ?? x.user.displayName ?? x.user.username])) } }));
    }).catch((err) => console.warn('[members] load failed', err));
    return () => {
      live = false;
    };
    // presence changes are applied live through isOnline(); refetching on every status change flooded the API
  }, [guild.id, memberCount]);
  const isOnline = (m: Member & { online?: boolean }) => m.userId === me?.id || (presence[m.userId] ? presence[m.userId] !== 'offline' : !!m.online);
  if (!members)
    return (
      <aside aria-label={t('guild.members')} aria-busy="true" className="hidden w-60 shrink-0 bg-surface px-4 py-5 lg:block">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mb-3 flex items-center gap-3 opacity-60">
            <div className="size-8 animate-pulse rounded-full bg-surface-raised" />
            <div className="h-3 flex-1 animate-pulse rounded-full bg-surface-raised" />
          </div>
        ))}
      </aside>
    );
  const online = members.filter(isOnline);
  const offline = members.filter((m) => !isOnline(m));
  const row = (m: Member, on: boolean) => (
    <li key={m.userId} className={on ? '' : 'opacity-40 hover:opacity-100'}>
      <div className="flex h-11 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-surface-hover" onClick={(e) => openProfile(m.userId, e)}>
        <Avatar name={m.nick ?? m.user.displayName ?? m.user.username} src={avatarUrl(m.user.avatarKey)} size={32} status={on ? presenceStatus(presence[m.userId]) : 'offline'} />
        <span className="min-w-0 truncate font-medium" style={{ color: m.userId === guild.ownerId ? 'var(--c-accent-text)' : 'var(--c-text-muted)' }}>
          {m.nick ?? m.user.displayName ?? m.user.username}
        </span>
      </div>
    </li>
  );
  return (
    <aside aria-label={t('guild.members')} className="hidden w-60 shrink-0 overflow-y-auto bg-surface px-2 py-4 lg:block">
      <h3 className="px-2 text-2xs font-bold uppercase tracking-wide text-faint">{t('guild.online')} — {online.length}</h3>
      <ul className="mb-4 mt-1">{online.map((m) => row(m, true))}</ul>
      {offline.length > 0 && (
        <>
          <h3 className="px-2 text-2xs font-bold uppercase tracking-wide text-faint">{t('guild.offline')} — {offline.length}</h3>
          <ul className="mt-1">{offline.map((m) => row(m, false))}</ul>
        </>
      )}
    </aside>
  );
}

const presenceStatus = (p: string | undefined) => (p === 'idle' || p === 'dnd' ? p : 'online');

/** Marks every text channel in a server as read (ack its last message). */
function markGuildRead(g: Guild) {
  for (const c of g.channels) {
    if ((c.type !== 'text' && c.type !== 'announcement') || !c.lastMessageId) continue;
    set((s) => ({ readStates: { ...s.readStates, [c.id]: { channelId: c.id, lastReadMessageId: c.lastMessageId, mentionCount: 0 } } }));
    void api('POST', `/channels/${c.id}/ack`, { messageId: c.lastMessageId }).catch(() => {});
  }
}
