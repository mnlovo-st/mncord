// Desktop notifications: decide per message whether to alert (per-channel → per-server → server default),
// then play a sound, show a Windows toast and flash the taskbar when the app isn't in front.
import type { Message } from '@mncord/shared';
import { create } from 'zustand';
import { api, avatarUrl } from './api';
import { usePrefs } from './prefs';
import { playSound } from './sounds';
import { get, set } from './store';

export type Level = 'default' | 'all' | 'mentions' | 'nothing';
interface Setting { guildId: string | null; channelId: string | null; level: Level; mutedUntil: string | null }
export const useNotif = create<{ list: Setting[] }>(() => ({ list: [] }));

export async function loadNotificationSettings() {
  const list = await api<Setting[]>('GET', '/users/@me/notification-settings').catch(() => null);
  if (list) useNotif.setState({ list });
}

export async function setNotification(scope: { guildId?: string; channelId?: string }, level: Level, mutedUntil: string | null = null) {
  await api('PUT', '/users/@me/notification-settings', { ...scope, level, mutedUntil });
  await loadNotificationSettings();
}

const active = (s: Setting | undefined) => !!s && (!s.mutedUntil || new Date(s.mutedUntil) > new Date());
export function effectiveLevel(guildId: string | null, channelId: string): Level {
  const list = useNotif.getState().list;
  const ch = list.find((s) => s.channelId === channelId);
  if (active(ch) && ch!.level !== 'default') return ch!.level;
  if (guildId) {
    const g = list.find((s) => s.guildId === guildId && !s.channelId);
    if (active(g) && g!.level !== 'default') return g!.level;
    return get().guilds[guildId]?.defaultNotifications === 'all' ? 'all' : 'mentions';
  }
  return 'all'; // DMs
}
export const isMuted = (guildId: string | null, channelId?: string) => {
  const list = useNotif.getState().list;
  const s = channelId ? list.find((x) => x.channelId === channelId) : list.find((x) => x.guildId === guildId && !x.channelId);
  return active(s) && s!.level === 'nothing';
};

export function onIncomingMessage(m: Message & { guildId: string | null }) {
  const st = get();
  if (!st.me || m.author?.id === st.me.id || m.type === 'system_join' || m.type === 'system_pin') return;
  const viewing = document.hasFocus() && (st.selectedPrivate === m.channelId || (m.guildId && st.selectedGuild === m.guildId && st.selectedChannel[m.guildId] === m.channelId));
  if (viewing) return;
  const mentioned = m.mentionIds.includes(st.me.id) || m.mentionEveryone;
  const level = effectiveLevel(m.guildId, m.channelId);
  if (level === 'nothing' || (level === 'mentions' && !mentioned)) return;
  if (st.me.status === 'dnd') return; // do not disturb: badges only, no sound or toast
  playSound(mentioned ? 'mention' : 'message');
  window.mncord?.window.flash();
  if (!usePrefs.getState().notifications || typeof Notification === 'undefined' || document.hasFocus()) return;
  const author = m.author?.displayName ?? m.author?.username ?? 'mncord';
  const where = m.guildId ? `#${st.guilds[m.guildId]?.channels.find((c) => c.id === m.channelId)?.name ?? ''} · ${st.guilds[m.guildId]?.name ?? ''}` : '';
  const body = (m.content || (m.attachments.length ? '📎' : '')).replace(/<a?:(\w+):[0-9a-f-]{36}>/g, ':$1:').slice(0, 180);
  try {
    const n = new Notification(m.guildId ? `${author} (${where})` : author, { body, icon: avatarUrl(m.author?.avatarKey), silent: true, tag: m.channelId });
    n.onclick = () => {
      window.focus();
      if (m.guildId) set((s) => ({ selectedGuild: m.guildId, selectedChannel: { ...s.selectedChannel, [m.guildId!]: m.channelId } }));
      else set({ selectedGuild: null, selectedPrivate: m.channelId });
    };
  } catch {
    /* notifications unavailable */
  }
}
