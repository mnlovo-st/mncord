// Gateway client: identify, heartbeat, reconnect with backoff + jitter, dispatch into the store.
import { CLOSE, type ClientFrame, type ServerFrame } from '@mncord/shared';
import { API_BASE, getAccessToken, refresh } from './api';
import { bumpLastMessage, dropMessage, get, patchMessage, putMessage, removeGuild, set, upsertGuild } from './store';
import { playSound } from './sounds';

let ws: WebSocket | null = null;
let beat: ReturnType<typeof setInterval> | null = null;
let seq = 0;
let attempts = 0;
let stopped = false;
let ackPending = false;

const url = () => `${API_BASE.replace(/^http/, 'ws')}/gateway`;

export function send(frame: ClientFrame) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
}

export function connectGateway() {
  stopped = false;
  open();
}

export function disconnectGateway() {
  stopped = true;
  if (beat) clearInterval(beat);
  ws?.close(1000);
  ws = null;
}

function scheduleReconnect() {
  if (stopped) return;
  set({ connection: navigator.onLine ? 'reconnecting' : 'offline' });
  const delay = Math.min(30_000, 1000 * 2 ** attempts) * (0.5 + Math.random() / 2);
  attempts++;
  setTimeout(open, delay);
}

function open() {
  if (stopped) return;
  const sock = new WebSocket(url());
  ws = sock;
  sock.onmessage = (e) => {
    const f = JSON.parse(String(e.data)) as ServerFrame;
    if (f.op === 'hello') {
      const token = getAccessToken();
      if (!token) return sock.close(4003);
      sock.send(JSON.stringify({ op: 'identify', token } satisfies ClientFrame));
      if (beat) clearInterval(beat);
      ackPending = false;
      beat = setInterval(() => {
        if (ackPending) return sock.close(4009); // zombie connection
        ackPending = true;
        send({ op: 'heartbeat', seq });
      }, f.heartbeatMs);
      return;
    }
    if (f.op === 'heartbeat_ack') {
      ackPending = false;
      return;
    }
    if (f.op !== 'dispatch') return;
    seq = f.s;
    handle(f);
  };
  sock.onclose = async (e) => {
    if (beat) clearInterval(beat);
    if (ws !== sock) return;
    if (e.code === CLOSE.AUTH_FAILED || e.code === CLOSE.NOT_AUTHENTICATED) {
      // access token expired or revoked: try one refresh, otherwise we're signed out (api handles UI)
      if (!(await refresh())) return;
    }
    scheduleReconnect();
  };
}

let readyOnce = false;

function handle(f: Extract<ServerFrame, { op: 'dispatch' }>) {
  switch (f.t) {
    case 'READY': {
      attempts = 0;
      if (!readyOnce) playSound('startup');
      else if (get().connection === 'reconnecting') playSound('reconnect');
      readyOnce = true;
      const guilds: Record<string, (typeof f.d.guilds)[number]> = {};
      for (const g of f.d.guilds) guilds[g.id] = g;
      const voice: Record<string, (typeof f.d.voiceStates)[number]> = {};
      for (const v of f.d.voiceStates) voice[v.userId] = v;
      const relationships: Record<string, (typeof f.d.relationships)[number]> = {};
      for (const r of f.d.relationships ?? []) relationships[r.id] = r;
      const privateChannels: Record<string, (typeof f.d.privateChannels)[number]> = {};
      for (const p of f.d.privateChannels ?? []) privateChannels[p.id] = p;
      const calls: Record<string, (typeof f.d.calls)[number]> = {};
      for (const c of f.d.calls ?? []) calls[c.channelId] = c;
      const presence: Record<string, 'online' | 'idle' | 'dnd' | 'offline'> = {};
      for (const p of f.d.presences ?? []) presence[p.userId] = p.status;
      const readStates: Record<string, (typeof f.d.readStates)[number]> = {};
      for (const r of f.d.readStates ?? []) readStates[r.channelId] = r;
      const names: Record<string, string> = {};
      for (const r of f.d.relationships ?? []) names[r.id] = r.user.displayName ?? r.user.username;
      for (const p of f.d.privateChannels ?? []) for (const u of p.recipients) names[u.id] = u.displayName ?? u.username;
      set((s) => ({
        me: f.d.user,
        connection: 'ready',
        relationships,
        readStates,
        privateChannels,
        calls,
        presence,
        guilds,
        guildOrder: f.d.guilds.map((g) => g.id),
        voice,
        selectedGuild: s.selectedGuild && guilds[s.selectedGuild] ? s.selectedGuild : null,
        loaded: {}, // refetch history after a reconnect so nothing is missed
        names: { ...s.names, ...names, [f.d.user.id]: f.d.user.displayName ?? f.d.user.username },
      }));
      void import('./notify').then((n) => n.loadNotificationSettings());
      break;
    }
    case 'GUILD_CREATE':
      upsertGuild(f.d);
      break;
    case 'GUILD_DELETE':
      removeGuild(f.d.id);
      break;
    case 'MESSAGE_CREATE': {
      if (get().loaded[f.d.channelId] || get().messages[f.d.channelId]) putMessage(f.d);
      const st = get();
      const mine = f.d.author?.id === st.me?.id;
      bumpLastMessage(f.d.channelId, f.d.guildId, f.d.id);
      if (!mine && st.me && f.d.mentionIds.includes(st.me.id)) set((s) => ({ readStates: { ...s.readStates, [f.d.channelId]: { channelId: f.d.channelId, lastReadMessageId: s.readStates[f.d.channelId]?.lastReadMessageId ?? null, mentionCount: (s.readStates[f.d.channelId]?.mentionCount ?? 0) + 1 } } }));
      if (mine) set((s) => ({ readStates: { ...s.readStates, [f.d.channelId]: { channelId: f.d.channelId, lastReadMessageId: f.d.id, mentionCount: 0 } } }));
      // a DM message that isn't in the list (closed DM re-opened by the sender): refetch the list
      if (!f.d.guildId && !st.privateChannels[f.d.channelId]) void import('./api').then(({ api }) => api<import('@mncord/shared').PrivateChannel[]>('GET', '/users/@me/channels').then((list) => set({ privateChannels: Object.fromEntries(list.map((p) => [p.id, p])) })));
      if (!f.d.guildId && st.privateChannels[f.d.channelId]) set((s) => ({ privateChannels: { ...s.privateChannels, [f.d.channelId]: { ...s.privateChannels[f.d.channelId]!, lastMessageId: f.d.id } } }));
      if (!mine) void import('./notify').then((n) => n.onIncomingMessage(f.d));
      set((s) => ({ typing: { ...s.typing, [f.d.channelId]: { ...s.typing[f.d.channelId], [f.d.author?.id ?? '']: 0 } } }));
      break;
    }
    case 'MESSAGE_UPDATE':
      patchMessage(f.d.channelId, f.d.id, (m) => ({ ...f.d, reactions: m.reactions }));
      break;
    case 'MESSAGE_REACTION_ADD':
    case 'MESSAGE_REACTION_REMOVE': {
      const add = f.t === 'MESSAGE_REACTION_ADD';
      const meId = get().me?.id;
      patchMessage(f.d.channelId, f.d.messageId, (m) => {
        const rx = [...m.reactions];
        const i = rx.findIndex((r) => r.emoji === f.d.emoji);
        const isMe = f.d.userId === meId;
        if (i < 0 && add) rx.push({ emoji: f.d.emoji, count: 1, me: isMe });
        else if (i >= 0) {
          const r = rx[i]!;
          const count = r.count + (add ? 1 : -1);
          if (count <= 0) rx.splice(i, 1);
          else rx[i] = { ...r, count, me: isMe ? add : r.me };
        }
        return { ...m, reactions: rx };
      });
      break;
    }
    case 'READ_STATE_UPDATE':
      set((s) => ({ readStates: { ...s.readStates, [f.d.channelId]: f.d } }));
      break;
    case 'MESSAGE_DELETE':
      dropMessage(f.d.channelId, f.d.id);
      break;
    case 'TYPING_START':
      set((s) => ({ typing: { ...s.typing, [f.d.channelId]: { ...s.typing[f.d.channelId], [f.d.userId]: Date.now() + 8000 } } }));
      break;
    case 'VOICE_STATE_UPDATE':
      set((s) => {
        const v = { ...s.voice };
        if (f.d.left) delete v[f.d.userId];
        else v[f.d.userId] = f.d;
        return { voice: v };
      });
      break;
    case 'PRESENCE_UPDATE':
      set((s) => ({ presence: { ...s.presence, [f.d.userId]: f.d.status } }));
      break;
    case 'APPROVAL_REQUEST' as never:
      void import('./screens/Approvals').then((m) => m.onApprovalRequest((f as unknown as { d: { username: string; displayName: string | null } }).d));
      break;
    case 'RELATIONSHIP_ADD':
      set((s) => ({ relationships: { ...s.relationships, [f.d.id]: f.d }, names: { ...s.names, [f.d.id]: f.d.user.displayName ?? f.d.user.username } }));
      if (f.d.type === 'incoming') void import('./sounds').then((m) => m.playSound('message'));
      break;
    case 'RELATIONSHIP_REMOVE':
      set((s) => {
        const { [f.d.id]: _gone, ...rest } = s.relationships;
        return { relationships: rest };
      });
      break;
    case 'PRIVATE_CHANNEL_CREATE':
    case 'PRIVATE_CHANNEL_UPDATE': {
      const pc = f.d;
      set((s) => ({
        privateChannels: { ...s.privateChannels, [pc.id]: pc },
        names: { ...s.names, ...Object.fromEntries(pc.recipients.map((u) => [u.id, u.displayName ?? u.username])) },
      }));
      break;
    }
    case 'PRIVATE_CHANNEL_DELETE':
      set((s) => {
        const { [f.d.id]: _gone, ...rest } = s.privateChannels;
        return { privateChannels: rest, selectedPrivate: s.selectedPrivate === f.d.id ? null : s.selectedPrivate };
      });
      break;
    case 'CALL_CREATE':
    case 'CALL_UPDATE':
      set((s) => ({ calls: { ...s.calls, [f.d.channelId]: f.d } }));
      break;
    case 'CALL_DELETE':
      set((s) => {
        const { [f.d.channelId]: _gone, ...rest } = s.calls;
        return { calls: rest };
      });
      break;
    case 'RTC_TRACKS':
      void import('./voice').then((v) => v.onRtcTracks(f.d));
      break;
    case 'RTC_FORCE':
      void import('./voice').then((v) => v.onRtcForce(f.d));
      break;
    case 'GUILD_MEMBER_UPDATE':
      set((s) => ({ names: { ...s.names, [f.d.userId]: f.d.nick ?? f.d.user.displayName ?? f.d.user.username } }));
      break;
    case 'GUILD_MEMBER_ADD':
      set((s) => ({ names: { ...s.names, [f.d.userId]: f.d.user.displayName ?? f.d.user.username } }));
      break;
    default:
      break;
  }
}

addEventListener('online', () => get().connection === 'offline' && open());
