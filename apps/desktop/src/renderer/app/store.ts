// Client state. The gateway patches it; screens read it.
import type { Call, Channel, Guild, Message, PrivateChannel, ReadState, Relationship, SelfUser, VoiceState } from '@mncord/shared';
import { create } from 'zustand';

export interface PendingMessage extends Message {
  pending?: 'sending' | 'failed';
}

interface State {
  me: SelfUser | null;
  connection: 'connecting' | 'ready' | 'reconnecting' | 'offline';
  guilds: Record<string, Guild>;
  guildOrder: string[];
  selectedGuild: string | null; // null = home
  selectedPrivate: string | null; // home: null = friends page, else a DM id
  relationships: Record<string, Relationship>; // other user id → relationship
  privateChannels: Record<string, PrivateChannel>;
  calls: Record<string, Call>; // DM id → ringing call
  profile: { userId: string; x: number; y: number } | null;
  readStates: Record<string, ReadState>;
  hasMore: Record<string, boolean>; // channel → older history available
  rightPanel: { kind: 'search' | 'pins'; channelId: string; guildId: string | null } | null;
  selectedChannel: Record<string, string>; // guild → channel
  messages: Record<string, PendingMessage[]>; // channel → oldest..newest
  loaded: Record<string, boolean>;
  voice: Record<string, VoiceState>; // userId → state
  presence: Record<string, 'online' | 'idle' | 'dnd' | 'offline'>;
  typing: Record<string, Record<string, number>>; // channel → user → until
  speaking: Record<string, boolean>;
  names: Record<string, string>; // userId → display name cache
}

export const useStore = create<State>(() => ({
  me: null,
  connection: 'connecting',
  guilds: {},
  guildOrder: [],
  selectedGuild: null,
  selectedPrivate: null,
  relationships: {},
  privateChannels: {},
  calls: {},
  profile: null,
  readStates: {},
  hasMore: {},
  rightPanel: null,
  selectedChannel: {},
  messages: {},
  loaded: {},
  voice: {},
  presence: {},
  typing: {},
  speaking: {},
  names: {},
}));

export const set = useStore.setState;
export const get = useStore.getState;

export function upsertGuild(g: Guild) {
  set((s) => ({
    guilds: { ...s.guilds, [g.id]: g },
    guildOrder: s.guildOrder.includes(g.id) ? s.guildOrder : [...s.guildOrder, g.id],
  }));
}

export function removeGuild(id: string) {
  set((s) => {
    const { [id]: _gone, ...rest } = s.guilds;
    return { guilds: rest, guildOrder: s.guildOrder.filter((x) => x !== id), selectedGuild: s.selectedGuild === id ? null : s.selectedGuild };
  });
}

export function addChannel(c: Channel) {
  if (!c.guildId) return;
  set((s) => {
    const g = s.guilds[c.guildId!];
    if (!g) return {};
    return { guilds: { ...s.guilds, [g.id]: { ...g, channels: [...g.channels.filter((x) => x.id !== c.id), c] } } };
  });
}

/** Adds or replaces (matching id or nonce) a message, keeping order. */
export function putMessage(m: PendingMessage) {
  set((s) => {
    const list = s.messages[m.channelId] ?? [];
    const i = list.findIndex((x) => x.id === m.id || (m.nonce && x.nonce === m.nonce));
    const next = i >= 0 ? list.map((x, j) => (j === i ? m : x)) : [...list, m];
    const names = m.author ? { ...s.names, [m.author.id]: m.author.displayName ?? m.author.username } : s.names;
    return { messages: { ...s.messages, [m.channelId]: next }, names };
  });
}

export function dropMessage(channelId: string, idOrNonce: string) {
  set((s) => ({ messages: { ...s.messages, [channelId]: (s.messages[channelId] ?? []).filter((x) => x.id !== idOrNonce && x.nonce !== idOrNonce) } }));
}

export function firstTextChannel(g: Guild) {
  return g.channels.filter((c) => c.type === 'text').sort((a, b) => a.position - b.position)[0]?.id ?? null;
}

export function openProfile(userId: string, e: { clientX: number; clientY: number }) {
  set({ profile: { userId, x: e.clientX, y: e.clientY } });
}

/** A DM shown as a channel so the chat view can render it. */
export function dmAsChannel(pc: PrivateChannel): Channel {
  const name = pc.type === 'group_dm' ? (pc.name ?? pc.recipients.map((r) => r.displayName ?? r.username).join(', ')) : (pc.recipients[0]?.displayName ?? pc.recipients[0]?.username ?? '…');
  return { id: pc.id, guildId: null, type: pc.type, name, topic: null, ownerId: pc.ownerId, parentId: null, position: 0, bitrate: 128000, userLimit: 0, lastMessageId: pc.lastMessageId };
}

export const sortedPrivate = (s: { privateChannels: Record<string, PrivateChannel> }) =>
  Object.values(s.privateChannels).sort((a, b) => (b.lastMessageId ?? b.id).localeCompare(a.lastMessageId ?? a.id));

/** Unread = the channel has a newer message than the last one you read. */
export function isUnread(s: { readStates: Record<string, ReadState> }, channelId: string, lastMessageId: string | null, meId?: string) {
  if (!lastMessageId) return false;
  const rs = s.readStates[channelId];
  void meId;
  return !rs?.lastReadMessageId || lastMessageId > rs.lastReadMessageId;
}
export const mentionsIn = (s: { readStates: Record<string, ReadState> }, channelId: string) => s.readStates[channelId]?.mentionCount ?? 0;

export function patchMessage(channelId: string, id: string, fn: (m: PendingMessage) => PendingMessage) {
  set((s) => {
    const list = s.messages[channelId];
    if (!list) return {};
    return { messages: { ...s.messages, [channelId]: list.map((m) => (m.id === id ? fn(m) : m)) } };
  });
}

/** Bumps a channel's last message so unread state works for channels you aren't viewing. */
export function bumpLastMessage(channelId: string, guildId: string | null, messageId: string) {
  set((s) => {
    if (guildId) {
      const g = s.guilds[guildId];
      if (!g) return {};
      return { guilds: { ...s.guilds, [guildId]: { ...g, channels: g.channels.map((c) => (c.id === channelId ? { ...c, lastMessageId: messageId } : c)) } } };
    }
    const pc = s.privateChannels[channelId];
    return pc ? { privateChannels: { ...s.privateChannels, [channelId]: { ...pc, lastMessageId: messageId } } } : {};
  });
}
