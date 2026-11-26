// App shell: guild rail · channel sidebar · main view · member list
import type { Channel, Guild, Member } from '@mncord/shared';
import { has, P } from '@mncord/shared';
import { Gamepad2, LogIn, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { ChannelCategory, ChannelItem } from '../../ui/ChannelItem';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuCheckbox, MenuItem, MenuSeparator } from '../../ui/ContextMenu';
import { nameplateClass, StyledName } from '../../ui/Cosmetics';
import { DevBadge } from '../../ui/DevBadge';
import { GuildIcon, HomeMark } from '../../ui/GuildIcon';
import { Modal } from '../../ui/Modal';
import { NoticeBar } from '../../ui/Toast';
import { UserPanel, VoiceConnectedPanel, VoiceUser } from '../../ui/Voice';
import { api, avatarUrl } from '../api';
import { errorText } from '../i18n';
import { isMuted, setNotification, useNotif } from '../notify';
import { setPrefs, usePrefs } from '../prefs';
import { firstTextChannel, isUnread, mentionsIn, openProfile, rememberUsers, set, useStore } from '../store';
import { joinVoice, leaveVoice, setDeafened, setMuted, setSuppression, stopStream, toggleCamera, usePing, useVoice } from '../voice';
import { MicMenu, OutputMenu } from './AudioMenus';
import { ChannelSettings, CreateChannelModal, ServerMenu } from './ChannelModals';
import { ChatView } from './Chat';
import { GuildSettings } from './GuildSettings';
import { HomeMain, HomeSidebar } from './Home';
import { GoLivePicker } from './Media';
import { LinkGuard, Lightbox } from './MessageParts';
import { CreateGuildModal, InviteModal, JoinGuildModal } from './Modals';
import { IncomingCall, ProfileCard } from './Overlays';
import { RightPanel } from './Panels';
import { QuickSwitcher } from './QuickSwitcher';
import { EditModal, SettingsScreen, type Tab as SettingsTab } from './Settings';
import { StatusPicker } from './StatusPicker';
import { UpdateCenter } from './Update';
import { ErrorBoundary } from '../ErrorBoundary';
import { useActivityText } from '../activityText';
import { UserContextMenu } from './UserMenu';
import { VoiceRoom } from './VoiceRoom';

/** ask the sidebar of a server to open one of its dialogs (from the rail's right-click menu) */
const guildAction = (id: string, action: 'settings' | 'channel' | 'category' | 'invite' | 'leave') =>
  setTimeout(() => dispatchEvent(new CustomEvent('mncord:guild', { detail: { id, action } })), 30);

export function Shell() {
  const { t } = useTranslation();
  const connection = useStore((s) => s.connection);
  const guildOrder = useStore((s) => s.guildOrder);
  const guilds = useStore((s) => s.guilds);
  const selectedGuild = useStore((s) => s.selectedGuild);
  const [modal, setModal] = useState<'create' | 'join' | 'invite' | 'verify' | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const me = useStore((s) => s.me);
  const guild = selectedGuild ? guilds[selectedGuild] : undefined;
  const rightPanel = useStore((s) => s.rightPanel);
  useNotif((s) => s.list); // re-render when mute settings change
  const readStates = useStore((s) => s.readStates);
  const layout = { rail: !usePrefs((p) => p.hideRail), sidebar: !usePrefs((p) => p.hideSidebar), members: !usePrefs((p) => p.hideMembers) };
  const selectedChannelKey = useStore((s) => (s.selectedGuild ? s.selectedChannel[s.selectedGuild] : s.selectedPrivate) ?? '');

  useEffect(() => {
    const open = (e: Event) => setSettingsTab(((e as CustomEvent<string>).detail as SettingsTab) || 'account');
    const invite = () => setModal('invite');
    addEventListener('mncord:settings', open);
    addEventListener('mncord:invite', invite);
    return () => {
      removeEventListener('mncord:settings', open);
      removeEventListener('mncord:invite', invite);
    };
  }, []);

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
      {me && !me.emailVerified && connection === 'ready' && (
        <NoticeBar tone="warning" action={<Button size="sm" variant="secondary" className="h-6" onClick={() => setModal('verify')}>{t('verifyEmail.action')}</Button>}>{t('verifyEmail.banner')}</NoticeBar>
      )}
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Servers" style={layout.rail ? undefined : { display: 'none' }} className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-bg-deep py-3 [scrollbar-width:none]">
          <GuildIcon name={t('rail.home')} selected={!selectedGuild} onClick={() => selectGuild(null)}><HomeMark /></GuildIcon>
          <div className="h-0.5 w-8 shrink-0 rounded-full bg-border" />
          {guildOrder.map((id) => {
            const g = guilds[id];
            if (!g) return null;
            const text = g.channels.filter((c) => c.type === 'text' || c.type === 'announcement');
            const unread = !isMuted(g.id) && text.some((c) => !isMuted(g.id, c.id) && isUnread({ readStates }, c.id, c.lastMessageId));
            const mentions = text.reduce((n, c) => n + mentionsIn({ readStates }, c.id), 0);
            const perms = BigInt(g.myGuildPermissions);
            const canSettings = [P.MANAGE_GUILD, P.MANAGE_ROLES, P.KICK_MEMBERS, P.BAN_MEMBERS, P.VIEW_AUDIT_LOG, P.MANAGE_EXPRESSIONS].some((p) => has(perms, p));
            return (
              <ContextMenu key={id}>
                <ContextMenuTrigger asChild>
                  <div className="w-full"><GuildIcon name={g.name} src={g.iconUrl ?? undefined} selected={selectedGuild === id} unread={unread} mentions={mentions} onClick={() => selectGuild(id)} /></div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <MenuItem onSelect={() => markGuildRead(g)}>{t('ctx.markRead')}</MenuItem>
                  <MenuSeparator />
                  <MenuItem onSelect={() => { selectGuild(id); guildAction(id, 'invite'); }}><span className="text-link">{t('gs.invite')}</span></MenuItem>
                  <MenuSeparator />
                  <MenuCheckbox checked={isMuted(g.id)} onCheckedChange={(on) => void setNotification({ guildId: g.id }, on ? 'nothing' : 'default')}>{t('ctx.muteServer')}</MenuCheckbox>
                  <MenuCheckbox checked={usePrefs.getState().hideMutedChannels} onCheckedChange={(on) => setPrefs({ hideMutedChannels: on })}>{t('ctx.hideMuted')}</MenuCheckbox>
                  {(canSettings || has(perms, P.MANAGE_CHANNELS)) && <MenuSeparator />}
                  {canSettings && <MenuItem onSelect={() => { selectGuild(id); guildAction(id, 'settings'); }}>{t('gs.settings')}</MenuItem>}
                  {has(perms, P.MANAGE_CHANNELS) && <MenuItem onSelect={() => { selectGuild(id); guildAction(id, 'channel'); }}>{t('gs.createChannel')}</MenuItem>}
                  {has(perms, P.MANAGE_CHANNELS) && <MenuItem onSelect={() => { selectGuild(id); guildAction(id, 'category'); }}>{t('gs.createCategory')}</MenuItem>}
                  {g.ownerId !== me?.id && (
                    <>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => { selectGuild(id); guildAction(id, 'leave'); }}>{t('gs.leave')}</MenuItem>
                    </>
                  )}
                  <MenuSeparator />
                  <MenuItem onSelect={() => void navigator.clipboard.writeText(g.id)} icon={<IdIcon />}>{t('ctx.copyServerId')}</MenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          <GuildIcon name={t('rail.add')} tone="action" onClick={() => setModal('create')}><Plus className="size-6" /></GuildIcon>
          <GuildIcon name={t('rail.join')} tone="action" onClick={() => setModal('join')}><LogIn className="size-5 rtl:-scale-x-100" /></GuildIcon>
        </nav>

        <aside style={layout.sidebar ? undefined : { display: 'none' }} className="flex w-60 shrink-0 flex-col bg-surface">
          <ErrorBoundary area="sidebar" resetKey={selectedGuild}>
            {guild ? <GuildSidebar key={guild.id} guild={guild} onInvite={() => setModal('invite')} /> : <HomeSidebar />}
          </ErrorBoundary>
          <ErrorBoundary area="panels"><BottomPanels onSettings={() => setSettingsTab('account')} /></ErrorBoundary>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-bg"><ErrorBoundary area="main" resetKey={`${selectedGuild}:${selectedChannelKey}`}>{guild ? <GuildMain guild={guild} /> : <HomeMain />}</ErrorBoundary></main>
        <ErrorBoundary area="right"><RightPanel /></ErrorBoundary>
        {guild && !rightPanel && layout.members && <ErrorBoundary area="members" resetKey={guild.id}><MemberList guild={guild} /></ErrorBoundary>}
      </div>

      <CreateGuildModal open={modal === 'create'} onClose={() => setModal(null)} onCreated={(g) => selectGuild(g.id)} />
      <JoinGuildModal open={modal === 'join'} onClose={() => setModal(null)} onJoined={(g) => selectGuild(g.id)} />
      {guild && <InviteModal open={modal === 'invite'} onClose={() => setModal(null)} guild={guild} />}
      <EditModal kind={modal === 'verify' ? 'verify' : null} onClose={() => setModal(null)} />
      {settingsTab && <ErrorBoundary area="settings"><SettingsScreen initialTab={settingsTab} onClose={() => setSettingsTab(null)} /></ErrorBoundary>}
      <ErrorBoundary area="profile"><ProfileCard /></ErrorBoundary>
      <IncomingCall />
      <QuickSwitcher />
      <Lightbox />
      <LinkGuard />
      <UpdateCenter />
    </div>
  );
}

const IdIcon = () => <span className="rounded-[3px] border border-current px-0.5 text-[9px] font-bold leading-none">ID</span>;

function GuildSidebar({ guild, onInvite }: { guild: Guild; onInvite: () => void }) {
  const { t } = useTranslation();
  const selected = useStore((s) => s.selectedChannel[guild.id]);
  const voice = useStore((s) => s.voice);
  const names = useStore((s) => s.names);
  const people = useStore((s) => s.users);
  const speaking = useStore((s) => s.speaking);
  const me = useStore((s) => s.me);
  const readStates = useStore((s) => s.readStates);
  const collapsed = usePrefs((p) => p.collapsed);
  const hideMuted = usePrefs((p) => p.hideMutedChannels);
  const [gs, setGs] = useState(false);
  const [create, setCreate] = useState<{ category: Channel | null; kind: 'channel' | 'category'; type?: 'text' | 'voice' } | null>(null);
  const [editCh, setEditCh] = useState<string | null>(null);
  const [del, setDel] = useState<Channel | null>(null);
  const [leave, setLeave] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const perms = BigInt(guild.myGuildPermissions);
  const canManage = has(perms, P.MANAGE_CHANNELS);
  const chPerm = (c: Channel, p: bigint) => has(BigInt(guild.myPermissions[c.id] ?? '0'), p);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; action: string }>).detail;
      if (d.id !== guild.id) return;
      if (d.action === 'settings') setGs(true);
      if (d.action === 'channel') setCreate({ category: null, kind: 'channel' });
      if (d.action === 'category') setCreate({ category: null, kind: 'category' });
      if (d.action === 'invite') onInvite();
      if (d.action === 'leave') setLeave(true);
    };
    addEventListener('mncord:guild', on);
    return () => removeEventListener('mncord:guild', on);
  }, [guild.id, onInvite]);

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
  const toggle = (id: string) => setPrefs({ collapsed: { ...usePrefs.getState().collapsed, [id]: !usePrefs.getState().collapsed[id] } });
  const markRead = (c: Channel) => {
    if (!c.lastMessageId) return;
    set((s) => ({ readStates: { ...s.readStates, [c.id]: { channelId: c.id, lastReadMessageId: c.lastMessageId, mentionCount: 0 } } }));
    void api('POST', `/channels/${c.id}/ack`, { messageId: c.lastMessageId }).catch(() => {});
  };
  const duplicate = (c: Channel) => void api('POST', `/guilds/${guild.id}/channels`, { type: c.type, name: c.name ?? 'channel', parentId: c.parentId ?? null, topic: c.topic ?? undefined }).catch((e) => setErr(errorText(e.code)));

  const renderChannel = (c: Channel) => {
    if (c.type !== 'text' && c.type !== 'voice' && c.type !== 'announcement') return null;
    const muted = c.type !== 'voice' && isMuted(guild.id, c.id);
    if (hideMuted && muted && selected !== c.id) return null;
    const inVoice = Object.values(voice).filter((v) => v.channelId === c.id);
    return (
      <ContextMenu key={c.id}>
        <ContextMenuTrigger asChild>
          <div>
            <ChannelItem type={c.type} name={c.name ?? ''} selected={selected === c.id} onClick={() => open(c)} inviteLabel={t('guild.invite')} muted={muted}
              unread={c.type !== 'voice' && isUnread({ readStates }, c.id, c.lastMessageId)} mentions={mentionsIn({ readStates }, c.id)}
              onInvite={chPerm(c, P.CREATE_INVITE) ? onInvite : undefined}
              onSettings={chPerm(c, P.MANAGE_CHANNELS) ? () => setEditCh(c.id) : undefined} settingsLabel={t('ch.settings')}>
              {inVoice.length > 0
                ? inVoice.map((v) => {
                    const u = people[v.userId];
                    return (
                      <UserContextMenu key={v.userId} userId={v.userId} guildId={guild.id}>
                        <div>
                          <VoiceUser name={names[v.userId] ?? '…'} avatarSrc={avatarUrl(u?.avatarKey)} decoration={u?.style?.decoration} speaking={!!speaking[v.userId]} muted={v.selfMute || v.serverMute} serverMuted={v.serverMute} deafened={v.selfDeaf || v.serverDeaf} live={v.selfStream} self={v.userId === me?.id}
                            onClick={(e) => openProfile(v.userId, e)} />
                        </div>
                      </UserContextMenu>
                    );
                  })
                : undefined}
            </ChannelItem>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {c.type !== 'voice' && <MenuItem onSelect={() => markRead(c)}>{t('ctx.markRead')}</MenuItem>}
          {c.type === 'voice' && <MenuItem onSelect={() => open(c)}>{t('ctx.joinVoice')}</MenuItem>}
          {chPerm(c, P.CREATE_INVITE) && <MenuItem onSelect={onInvite}>{c.type === 'voice' ? t('ctx.inviteVoice') : t('guild.invite')}</MenuItem>}
          <MenuItem onSelect={() => void navigator.clipboard.writeText(`mncord://channels/${guild.id}/${c.id}`)}>{t('ctx.copyLink')}</MenuItem>
          <MenuSeparator />
          {c.type !== 'voice' && <MenuCheckbox checked={muted} onCheckedChange={(on) => void setNotification({ channelId: c.id }, on ? 'nothing' : 'default')}>{t('ctx.muteChannel')}</MenuCheckbox>}
          {chPerm(c, P.MANAGE_CHANNELS) && (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => setEditCh(c.id)}>{t('ctx.editChannel')}</MenuItem>
              <MenuItem onSelect={() => duplicate(c)}>{t('ctx.duplicate')}</MenuItem>
              <MenuItem onSelect={() => setCreate({ category: guild.channels.find((x) => x.id === c.parentId) ?? null, kind: 'channel', type: c.type === 'voice' ? 'voice' : 'text' })}>{c.type === 'voice' ? t('ctx.createVoice') : t('ctx.createText')}</MenuItem>
              <MenuItem danger onSelect={() => setDel(c)}>{t('ctx.deleteChannel')}</MenuItem>
            </>
          )}
          <MenuSeparator />
          <MenuItem onSelect={() => void navigator.clipboard.writeText(c.id)} icon={<IdIcon />}>{t('ctx.copyChannelId')}</MenuItem>
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
          <ContextMenu key={cat.id}>
            <ContextMenuTrigger asChild>
              <div>
                <ChannelCategory name={cat.name ?? ''} collapsed={collapsed[cat.id]} onToggle={() => toggle(cat.id)}
                  onAdd={canManage ? () => setCreate({ category: cat, kind: 'channel' }) : undefined} addLabel={t('gs.createChannel')}>
                  {children.map(renderChannel)}
                </ChannelCategory>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <MenuItem onSelect={() => children.forEach((c) => c.type !== 'voice' && markRead(c))}>{t('ctx.markRead')}</MenuItem>
              <MenuSeparator />
              <MenuCheckbox checked={!!collapsed[cat.id]} onCheckedChange={() => toggle(cat.id)}>{t('ctx.collapseCategory')}</MenuCheckbox>
              <MenuItem onSelect={() => setPrefs({ collapsed: { ...collapsed, ...Object.fromEntries(cats.map((x) => [x.cat.id, true])) } })}>{t('ctx.collapseAll')}</MenuItem>
              <MenuSeparator />
              <MenuCheckbox checked={children.length > 0 && children.every((c) => c.type === 'voice' || isMuted(guild.id, c.id))} onCheckedChange={(on) => children.forEach((c) => c.type !== 'voice' && void setNotification({ channelId: c.id }, on ? 'nothing' : 'default'))}>{t('ctx.muteCategory')}</MenuCheckbox>
              {canManage && (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={() => setEditCh(cat.id)}>{t('ctx.editCategory')}</MenuItem>
                  <MenuItem onSelect={() => setCreate({ category: cat, kind: 'channel' })}>{t('gs.createChannel')}</MenuItem>
                  <MenuItem danger onSelect={() => setDel(cat)}>{t('ctx.deleteCategory')}</MenuItem>
                </>
              )}
              <MenuSeparator />
              <MenuItem onSelect={() => void navigator.clipboard.writeText(cat.id)} icon={<IdIcon />}>{t('ctx.copyCategoryId')}</MenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </ul>
      {err && <p role="alert" className="px-3 pb-2 text-xs text-danger-text">{err}</p>}
      {gs && <GuildSettings guild={guild} onClose={() => setGs(false)} />}
      {create && <CreateChannelModal guild={guild} category={create.category} kind={create.kind} initialType={create.type} onClose={() => setCreate(null)} />}
      {editCh && guild.channels.find((c) => c.id === editCh) && <ChannelSettings guild={guild} channel={guild.channels.find((c) => c.id === editCh)!} onClose={() => setEditCh(null)} />}
      {del && (
        <Modal open onOpenChange={(o) => !o && setDel(null)} title={del.type === 'category' ? t('ctx.deleteCategory') : t('ctx.deleteChannel')} description={t('ctx.deleteConfirm', { name: del.name ?? '' })} closeLabel={t('common.close')}
          footer={<><Button variant="ghost" onClick={() => setDel(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void api('DELETE', `/channels/${del.id}`).then(() => setDel(null), (e) => { setErr(errorText(e.code)); setDel(null); })}>{t('common.delete')}</Button></>} />
      )}
      {leave && (
        <Modal open onOpenChange={(o) => !o && setLeave(false)} title={t('gs.leave')} description={t('gs.leaveConfirm', { name: guild.name })} closeLabel={t('common.close')}
          footer={<><Button variant="ghost" onClick={() => setLeave(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void api('DELETE', `/users/@me/guilds/${guild.id}`).then(() => { setLeave(false); set({ selectedGuild: null }); })}>{t('gs.leave')}</Button></>} />
      )}
    </>
  );
}

function BottomPanels({ onSettings }: { onSettings: () => void }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const guilds = useStore((s) => s.guilds);
  const v = useVoice();
  const ping = usePing((s) => s.ms);
  const [picker, setPicker] = useState(false);
  const [popout, setPopout] = useState(false);
  const [menu, setMenu] = useState<{ kind: 'mic' | 'out'; el: HTMLElement } | null>(null);
  const privateCh = useStore((s) => (v.channelId ? s.privateChannels[v.channelId] : undefined));
  const channel = v.channelId && v.guildId ? guilds[v.guildId]?.channels.find((c) => c.id === v.channelId) : privateCh ? { name: privateCh.recipients.map((r) => r.displayName ?? r.username).join(', ') } : undefined;
  if (!me) return null;
  const goToCall = () => {
    if (v.guildId && v.channelId) set((s) => ({ selectedGuild: v.guildId, selectedChannel: { ...s.selectedChannel, [v.guildId!]: v.channelId! } }));
    else if (v.channelId) set({ selectedGuild: null, selectedPrivate: v.channelId });
  };
  return (
    <>
      {v.status !== 'idle' && channel && (
        <VoiceConnectedPanel
          channel={v.guildId ? `${channel.name} / ${guilds[v.guildId]?.name ?? ''}` : String(channel.name)}
          connecting={v.status === 'connecting'}
          ping={ping}
          labels={{
            connected: v.status === 'connecting' ? t('voice.connecting') : t('voice.connected'),
            disconnect: t('voice.leave'),
            camera: t('live.camera'),
            cameraOff: t('live.cameraOff'),
            screen: v.streaming ? t('live.stop') : t('live.goLive'),
            noise: `${t('voice.noise')}: ${t(`settings.sup.${v.suppression}`)}`,
            ping: ping != null ? t('voice.ping', { ms: ping }) : v.status,
          }}
          onDisconnect={() => void leaveVoice()}
          onOpen={goToCall}
          camera={v.camera}
          streaming={v.streaming}
          noiseOn={v.suppression !== 'off'}
          onCamera={() => void toggleCamera()}
          onScreen={() => (v.streaming ? void stopStream() : setPicker(true))}
          onNoise={() => void setSuppression(v.suppression === 'off' ? 'rnnoise' : 'off')}
        />
      )}
      <UserPanel
        name={me.displayName ?? me.username}
        nameNode={<StyledName style={me.style}>{me.displayName ?? me.username}</StyledName>}
        avatarSrc={avatarUrl(me.avatarKey)}
        decoration={me.style?.decoration}
        plate={nameplateClass(me.style)}
        tag={me.customStatus?.text ?? (me.status === 'invisible' ? t('status.invisible') : me.username)}
        status={me.status === 'invisible' ? 'offline' : me.status}
        onAvatarClick={() => setPopout((o) => !o)}
        muted={v.muted || v.serverMuted}
        deafened={v.deafened || v.serverDeafened}
        onMute={() => void setMuted(!v.muted)}
        onDeafen={() => void setDeafened(!v.deafened)}
        onMicMenu={(el) => setMenu(menu?.kind === 'mic' ? null : { kind: 'mic', el })}
        onOutputMenu={(el) => setMenu(menu?.kind === 'out' ? null : { kind: 'out', el })}
        labels={{ mute: t('voice.mute'), unmute: t('voice.unmute'), deafen: t('voice.deafen'), undeafen: t('voice.undeafen'), settings: t('voice.settings'), status: t('guild.online'), inputOptions: t('am.inputOptions'), outputOptions: t('am.outputOptions') }}
        onSettings={onSettings}
      />
      {menu?.kind === 'mic' && <MicMenu anchor={menu.el} onClose={() => setMenu(null)} />}
      {menu?.kind === 'out' && <OutputMenu anchor={menu.el} onClose={() => setMenu(null)} />}
      {picker && <GoLivePicker onClose={() => setPicker(false)} />}
      {popout && <StatusPicker onClose={() => setPopout(false)} />}
    </>
  );
}

function GuildMain({ guild }: { guild: Guild }) {
  const selected = useStore((s) => s.selectedChannel[guild.id]);
  // opened without a remembered channel (back button, inbox, new server): show the first text channel
  const channel = guild.channels.find((c) => c.id === selected) ?? guild.channels.find((c) => c.type === 'text' || c.type === 'announcement');
  if (!channel) return null;
  if (channel.type === 'voice') return <VoiceRoom guild={guild} channel={channel} />;
  return <ChatView guild={guild} channel={channel} />;
}

function MemberRow({ m, on, guild }: { m: Member; on: boolean; guild: Guild }) {
  const presence = useStore((s) => s.presence[m.userId]);
  const live = useStore((s) => s.users[m.userId]);
  const act = useActivityText(m.userId);
  const u = { ...m.user, ...live };
  const name = m.nick ?? u.displayName ?? u.username;
  return (
    <li className={on ? '' : 'opacity-40 hover:opacity-100'}>
      <UserContextMenu userId={m.userId} guildId={guild.id}>
        <div className={cn2('flex h-[42px] cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-surface-hover', on && nameplateClass(u.style))} onClick={(e) => openProfile(m.userId, e)}>
          <Avatar name={name} src={avatarUrl(u.avatarKey)} size={32} status={on ? presenceStatus(presence) : 'offline'} decoration={on ? u.style?.decoration : null} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5">
              <StyledName style={u.style} className="truncate font-medium" >
                <span style={{ color: u.style?.nameStyle ? undefined : m.userId === guild.ownerId ? 'var(--c-accent-text)' : 'var(--c-text-muted)' }}>{name}</span>
              </StyledName>
              <DevBadge flags={u.flags} />
            </span>
            {on && act && <span className="flex items-center gap-1 truncate text-xs text-faint"><Gamepad2 aria-hidden className="size-3 shrink-0" /><span className="truncate">{act.line}</span></span>}
          </span>
        </div>
      </UserContextMenu>
    </li>
  );
}
const cn2 = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

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
      rememberUsers(m.map((x) => x.user));
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
  return (
    <aside aria-label={t('guild.members')} className="hidden w-60 shrink-0 overflow-y-auto bg-surface px-2 py-4 lg:block">
      <h3 className="px-2 text-2xs font-bold uppercase tracking-wide text-faint">{t('guild.online')} — {online.length}</h3>
      <ul className="mb-4 mt-1 flex flex-col gap-0.5">{online.map((m) => <MemberRow key={m.userId} m={m} on guild={guild} />)}</ul>
      {offline.length > 0 && (
        <>
          <h3 className="px-2 text-2xs font-bold uppercase tracking-wide text-faint">{t('guild.offline')} — {offline.length}</h3>
          <ul className="mt-1 flex flex-col gap-0.5">{offline.map((m) => <MemberRow key={m.userId} m={m} on={false} guild={guild} />)}</ul>
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
