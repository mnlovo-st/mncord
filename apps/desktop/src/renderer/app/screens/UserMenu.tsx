// Right-click menu for a person: voice tiles, the voice list in the sidebar, the member list, chat names.
// Shows what you're allowed to do: your own call controls on yourself; volume / local mute / DM on others;
// server mute, deafen, move and disconnect when you have those permissions in this server.
import { has, P } from '@mncord/shared';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuCheckbox, MenuItem, MenuSeparator, MenuSlot, MenuSub } from '../../ui/ContextMenu';
import { Slider } from '../../ui/Slider';
import { api } from '../api';
import { usePrefs } from '../prefs';
import { openProfile, useStore } from '../store';
import { setDeafened, setLocalMute, setMuted, setUserVolume, useVoice } from '../voice';
import { openDm } from './Home';

export function UserContextMenu({ userId, guildId, children, extra }: { userId: string; guildId?: string | null; children: ReactNode; extra?: ReactNode }) {
  const pos = useRef({ x: 200, y: 200 });
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={(e) => (pos.current = { x: e.clientX, y: e.clientY })}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <UserMenuItems userId={userId} guildId={guildId ?? null} pos={pos.current} extra={extra} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function UserMenuItems({ userId, guildId, pos, extra }: { userId: string; guildId: string | null; pos: { x: number; y: number }; extra?: ReactNode }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const guild = useStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const vs = useStore((s) => s.voice[userId]);
  const rel = useStore((s) => s.relationships[userId]?.type);
  const v = useVoice();
  const volume = usePrefs((p) => p.userVolumes[userId] ?? 1);
  const localMuted = usePrefs((p) => !!p.localMutes[userId]);
  const isMe = userId === me?.id;
  const perms = guild ? BigInt(guild.myGuildPermissions) : 0n;
  const inGuildVoice = !!vs && !!guild && vs.guildId === guild.id;
  const voiceChannels = guild ? guild.channels.filter((c) => c.type === 'voice' && c.id !== vs?.channelId).sort((a, b) => a.position - b.position) : [];
  const patch = (body: Record<string, unknown>) => guild && void api('PATCH', `/guilds/${guild.id}/members/${userId}`, body).catch(() => {});

  return (
    <>
      <MenuItem onSelect={() => openProfile(userId, { clientX: pos.x, clientY: pos.y })}>{t('um.profile')}</MenuItem>
      {!isMe && rel !== 'blocked' && <MenuItem onSelect={() => void openDm(userId)}>{t('um.message')}</MenuItem>}
      {isMe && <MenuItem onSelect={() => dispatchEvent(new CustomEvent('mncord:settings', { detail: 'profile' }))}>{t('um.editProfile')}</MenuItem>}
      {extra}

      {isMe && v.channelId && (
        <>
          <MenuSeparator />
          <MenuCheckbox checked={v.muted} onCheckedChange={(on) => void setMuted(on)}>{t('voice.mute')}</MenuCheckbox>
          <MenuCheckbox checked={v.deafened} onCheckedChange={(on) => void setDeafened(on)}>{t('voice.deafen')}</MenuCheckbox>
          <MenuCheckbox checked={usePrefs.getState().showNonVideo} onCheckedChange={(on) => usePrefs.setState({ showNonVideo: on })}>{t('um.showNonVideo')}</MenuCheckbox>
        </>
      )}

      {!isMe && vs && (
        <>
          <MenuSeparator />
          <MenuSlot>
            <Slider label={t('live.volume')} value={Math.round(volume * 100)} min={0} max={400} step={5} format={(x) => `${x}%`} onValueChange={(x) => setUserVolume(userId, x / 100)} />
          </MenuSlot>
          <MenuCheckbox checked={localMuted} onCheckedChange={(on) => setLocalMute(userId, on)}>{t('um.localMute')}</MenuCheckbox>
        </>
      )}

      {inGuildVoice && (has(perms, P.MUTE_MEMBERS) || has(perms, P.DEAFEN_MEMBERS) || has(perms, P.MOVE_MEMBERS)) && (
        <>
          <MenuSeparator />
          {has(perms, P.MUTE_MEMBERS) && <MenuCheckbox checked={!!vs.serverMute} onCheckedChange={(on) => patch({ serverMute: on })}><span className="text-danger-text">{t('um.serverMute')}</span></MenuCheckbox>}
          {has(perms, P.DEAFEN_MEMBERS) && <MenuCheckbox checked={!!vs.serverDeaf} onCheckedChange={(on) => patch({ serverDeaf: on })}><span className="text-danger-text">{t('um.serverDeafen')}</span></MenuCheckbox>}
          {has(perms, P.MOVE_MEMBERS) && voiceChannels.length > 0 && (
            <MenuSub label={t('um.moveTo')}>
              {voiceChannels.map((c) => <MenuItem key={c.id} onSelect={() => patch({ voiceChannelId: c.id })}>{c.name}</MenuItem>)}
            </MenuSub>
          )}
          {has(perms, P.MOVE_MEMBERS) && <MenuItem danger onSelect={() => patch({ voiceChannelId: null })}>{t('um.disconnect')}</MenuItem>}
        </>
      )}

      <MenuSeparator />
      <MenuItem onSelect={() => void navigator.clipboard.writeText(userId)} icon={<span className="rounded-[3px] border border-current px-0.5 text-[9px] font-bold leading-none">ID</span>}>{t('um.copyId')}</MenuItem>
    </>
  );
}
