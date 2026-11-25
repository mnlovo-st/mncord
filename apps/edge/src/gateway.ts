// Realtime gateway: one WebSocket per signed-in client. Permission-aware fan-out, in-memory presence,
// voice states and DM calls.
import { randomUUID } from 'node:crypto';
import {
  CLOSE,
  computePermissions,
  GATEWAY_VERSION,
  has,
  HEARTBEAT_MS,
  P,
  type Call,
  type Channel,
  type DispatchEvent,
  type ServerFrame,
  type VoiceState,
} from '@mncord/shared';
import type { WsLike as WebSocket } from './hub.ts';
import { z } from 'zod';
import { verifyAccessToken } from './auth/tokens.ts';
import type { Db } from './db.ts';
import {
  channelOverwrites,
  channelPermissions,
  friendIds,
  getSelf,
  guildForUser,
  guildIdsForUser,
  MESSAGE_SELECT,
  privateChannelsForUser,
  recipientIds,
  relationshipsFor,
  toMessage,
  type MessageRow,
} from './repo.ts';
import { sessionActive } from './routes/auth.ts';
import { accountState, gateOn } from './gate.ts';

const Frame = z.discriminatedUnion('op', [
  z.object({ op: z.literal('identify'), token: z.string().max(2000) }),
  z.object({ op: z.literal('heartbeat'), seq: z.number().int().min(0) }),
  z.object({
    op: z.literal('voice_state'),
    guildId: z.uuid().nullable(),
    channelId: z.uuid().nullable(),
    selfMute: z.boolean(),
    selfDeaf: z.boolean(),
    selfVideo: z.boolean().optional(),
    selfStream: z.boolean().optional(),
  }),
  z.object({ op: z.literal('typing'), channelId: z.uuid() }),
]);

type Status = 'online' | 'idle' | 'dnd' | 'offline';
const RING_MS = 30_000;

interface Conn {
  ws: WebSocket;
  sessionId: string | null;
  gatewayId: string;
  userId: string | null;
  seq: number;
  lastBeat: number;
  frames: number[];
  typingAt: Map<string, number>;
}

export class Hub {
  private db: Db;
  private conns = new Set<Conn>();
  private byUser = new Map<string, Set<Conn>>();
  private status = new Map<string, Status>(); // online users' visible status
  private guildMembers = new Map<string, Set<string>>(); // guild → online member ids
  private voice = new Map<string, VoiceState>(); // userId → state
  private calls = new Map<string, Call & { timer: ReturnType<typeof setTimeout> }>(); // channelId → ringing call
  private sweep: ReturnType<typeof setTimeout>;
  /** set by the voice routes: release someone's media when they leave voice */
  onVoiceLeave?: (userId: string, channelId: string) => void;

  constructor(db: Db) {
    this.db = db;
    this.sweep = setInterval(() => this.sweepDead(), 10_000);
  }

  // ── connection lifecycle
  handle(ws: WebSocket) {
    const c: Conn = { ws, sessionId: null, gatewayId: randomUUID(), userId: null, seq: 0, lastBeat: Date.now(), frames: [], typingAt: new Map() };
    this.conns.add(c);
    this.send(c, { op: 'hello', heartbeatMs: HEARTBEAT_MS, v: GATEWAY_VERSION });
    const identifyTimer = setTimeout(() => !c.userId && ws.close(CLOSE.NOT_AUTHENTICATED, 'identify timeout'), 10_000);
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return ws.close(CLOSE.INVALID_FRAME, 'binary');
      const now = Date.now();
      c.frames = c.frames.filter((t) => now - t < 60_000);
      c.frames.push(now);
      if (c.frames.length > 120) return ws.close(CLOSE.RATE_LIMITED, 'rate limited');
      let frame: z.infer<typeof Frame>;
      try {
        frame = Frame.parse(JSON.parse(String(raw)));
      } catch {
        return ws.close(CLOSE.INVALID_FRAME, 'invalid frame');
      }
      void this.onFrame(c, frame).catch(() => ws.close(1011, 'error'));
    });
    ws.on('close', () => {
      clearTimeout(identifyTimer);
      void this.drop(c).catch(() => {}); // shutting down: the database may already be closed
    });
    ws.on('error', () => ws.terminate());
  }

  private async onFrame(c: Conn, f: z.infer<typeof Frame>) {
    if (f.op === 'heartbeat') {
      c.lastBeat = Date.now();
      return this.send(c, { op: 'heartbeat_ack' });
    }
    if (f.op === 'identify') return this.identify(c, f.token);
    if (!c.userId) return c.ws.close(CLOSE.NOT_AUTHENTICATED, 'not identified');
    const userId = c.userId;

    if (f.op === 'typing') {
      const last = c.typingAt.get(f.channelId) ?? 0;
      if (Date.now() - last < 5000) return;
      c.typingAt.set(f.channelId, Date.now());
      const cp = await channelPermissions(this.db, f.channelId, userId);
      if (!cp || !has(cp.perms, P.SEND_MESSAGES)) return;
      await this.dispatchToChannelViewers(cp.channel, { t: 'TYPING_START', d: { channelId: f.channelId, userId, at: Date.now() } }, userId);
      return;
    }

    if (f.op === 'voice_state') {
      const prev = this.voice.get(userId);
      if (f.channelId === null) {
        if (prev) await this.leaveVoice(userId);
        return;
      }
      const cp = await channelPermissions(this.db, f.channelId, userId);
      const isDm = cp?.channel.type === 'dm' || cp?.channel.type === 'group_dm';
      if (!cp || cp.channel.guildId !== f.guildId || !(cp.channel.type === 'voice' || isDm) || !has(cp.perms, P.CONNECT)) return;
      if (prev && prev.channelId !== f.channelId) await this.leaveVoice(userId);
      const state: VoiceState = {
        userId,
        guildId: f.guildId,
        channelId: f.channelId,
        selfMute: f.selfMute || !has(cp.perms, P.SPEAK),
        selfDeaf: f.selfDeaf,
        selfVideo: !!f.selfVideo && has(cp.perms, P.STREAM),
        selfStream: !!f.selfStream && has(cp.perms, P.STREAM),
      };
      this.voice.set(userId, state);
      await this.dispatchVoice(state);
      // answering a ringing call: stop ringing this user
      const call = this.calls.get(f.channelId);
      if (call?.ringing.includes(userId)) await this.stopRinging(f.channelId, [userId]);
    }
  }

  private async identify(c: Conn, token: string) {
    if (c.userId) return;
    const claims = await verifyAccessToken(token).catch(() => null);
    if (!claims || !(await sessionActive(this.db, claims.sid, claims.sub))) return c.ws.close(CLOSE.AUTH_FAILED, 'auth failed');
    const user = await getSelf(this.db, claims.sub);
    if (!user) return c.ws.close(CLOSE.AUTH_FAILED, 'auth failed');
    // waiting accounts (email not verified / owner hasn't approved) get no live data
    const gate = accountState(this.db as Db, claims.sub);
    if (!gate.verified && gateOn()) return c.ws.close(CLOSE.AUTH_FAILED, 'email unverified');
    if (!gate.approved) return c.ws.close(CLOSE.AUTH_FAILED, 'approval pending');
    const self = { ...user, approved: gate.approved, isOwner: gate.owner };
    const userId = claims.sub;
    c.userId = userId;
    c.sessionId = claims.sid;
    c.lastBeat = Date.now();
    let set = this.byUser.get(userId);
    const firstConn = !set;
    if (!set) this.byUser.set(userId, (set = new Set()));
    set.add(c);
    const visible: Status = user.status === 'invisible' ? 'offline' : user.status;
    this.status.set(userId, visible);

    const guildIds = await guildIdsForUser(this.db, userId);
    const guilds = (await Promise.all(guildIds.map((id) => guildForUser(this.db, id, userId)))).filter((g) => g !== null);
    for (const id of guildIds) this.addGuildMember(id, userId);
    const relationships = await relationshipsFor(this.db, userId);
    const privateChannels = await privateChannelsForUser(this.db, userId);
    const dmIds = new Set(privateChannels.map((p) => p.id));
    const voiceStates = [...this.voice.values()].filter((v) => (v.guildId ? guildIds.includes(v.guildId) : dmIds.has(v.channelId)));
    // presence of everyone you can see: friends + DM partners + online guild members
    const watch = new Set<string>([...relationships.filter((r) => r.type === 'friend').map((r) => r.id), ...privateChannels.flatMap((p) => p.recipients.map((u) => u.id))]);
    for (const gid of guildIds) for (const u of this.guildMembers.get(gid) ?? []) watch.add(u);
    watch.delete(userId);
    const presences = [...watch].filter((u) => this.status.has(u)).map((u) => ({ userId: u, status: this.status.get(u)! }));
    const calls = [...this.calls.values()].filter((k) => dmIds.has(k.channelId)).map(({ timer: _t, ...k }) => k);
    const rs = await this.db.query<{ channelId: string; lastReadMessageId: string | null; mentionCount: number }>(
      `select channel_id as "channelId", last_read_message_id as "lastReadMessageId", mention_count as "mentionCount" from read_states where user_id = $1`,
      [userId],
    );

    this.dispatch(c, { t: 'READY', d: { sessionId: c.gatewayId, user: self, guilds, voiceStates, relationships, privateChannels, presences, calls, readStates: rs.rows, heartbeatMs: HEARTBEAT_MS } });
    if (firstConn) await this.broadcastPresence(userId, visible);
  }

  async broadcastPresence(userId: string, status: Status) {
    const targets = new Set<string>(await friendIds(this.db, userId));
    for (const [, users] of this.guildMembers) if (users.has(userId)) for (const u of users) targets.add(u);
    targets.delete(userId);
    for (const u of targets) this.dispatchToUser(u, { t: 'PRESENCE_UPDATE', d: { userId, status } });
  }

  async setStatus(userId: string, status: 'online' | 'idle' | 'dnd' | 'invisible') {
    if (!this.byUser.has(userId)) return;
    const visible: Status = status === 'invisible' ? 'offline' : status;
    this.status.set(userId, visible);
    await this.broadcastPresence(userId, visible);
  }

  private async leaveVoice(userId: string) {
    const prev = this.voice.get(userId);
    if (!prev) return;
    this.voice.delete(userId);
    this.onVoiceLeave?.(userId, prev.channelId);
    await this.dispatchVoice({ ...prev, left: true });
    // last one out of a DM call ends any ringing
    if (!prev.guildId && this.voiceCount(prev.channelId) === 0) await this.endCall(prev.channelId);
  }

  private async dispatchVoice(state: VoiceState & { left?: boolean }) {
    const ev: DispatchEvent = { t: 'VOICE_STATE_UPDATE', d: state };
    if (state.guildId) this.dispatchToGuild(state.guildId, ev);
    else this.dispatchToUsers(await recipientIds(this.db, state.channelId), ev);
  }

  private async drop(c: Conn) {
    this.conns.delete(c);
    if (!c.userId) return;
    const userId = c.userId;
    const set = this.byUser.get(userId);
    set?.delete(c);
    if (set && set.size === 0) {
      this.byUser.delete(userId);
      await this.leaveVoice(userId);
      await this.broadcastPresence(userId, 'offline');
      this.status.delete(userId);
      for (const [gid, users] of this.guildMembers) {
        users.delete(userId);
        if (users.size === 0) this.guildMembers.delete(gid);
      }
    }
  }

  private sweepDead() {
    const limit = HEARTBEAT_MS * 1.5;
    for (const c of this.conns) if (Date.now() - c.lastBeat > limit) c.ws.close(CLOSE.SESSION_TIMEOUT, 'heartbeat timeout');
  }

  // ── DM calls: ring everyone else for 30 s; joining the call or declining stops your ring
  async startCall(channelId: string, callerId: string, recipients: string[], blocked: Set<string>) {
    const ringing = recipients.filter((u) => u !== callerId && !blocked.has(u) && !this.inVoice(u, channelId));
    const existing = this.calls.get(channelId);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => void this.endCall(channelId), RING_MS);
    const call = { channelId, callerId, ringing, timer };
    this.calls.set(channelId, call);
    this.dispatchToUsers(recipients, { t: existing ? 'CALL_UPDATE' : 'CALL_CREATE', d: { channelId, callerId, ringing } });
  }
  async stopRinging(channelId: string, userIds: string[]) {
    const call = this.calls.get(channelId);
    if (!call) return;
    call.ringing = call.ringing.filter((u) => !userIds.includes(u));
    const recips = await recipientIds(this.db, channelId);
    if (call.ringing.length === 0) return this.endCall(channelId);
    this.dispatchToUsers(recips, { t: 'CALL_UPDATE', d: { channelId, callerId: call.callerId, ringing: call.ringing } });
  }
  async endCall(channelId: string) {
    const call = this.calls.get(channelId);
    if (!call) return;
    clearTimeout(call.timer);
    this.calls.delete(channelId);
    this.dispatchToUsers(await recipientIds(this.db, channelId), { t: 'CALL_DELETE', d: { channelId } });
  }
  private inVoice(userId: string, channelId: string) {
    return this.voice.get(userId)?.channelId === channelId;
  }

  // ── membership bookkeeping (called by routes)
  addGuildMember(guildId: string, userId: string) {
    if (!this.byUser.has(userId)) return; // only track online users
    let s = this.guildMembers.get(guildId);
    if (!s) this.guildMembers.set(guildId, (s = new Set()));
    s.add(userId);
  }
  removeGuildMember(guildId: string, userId: string) {
    this.guildMembers.get(guildId)?.delete(userId);
    const v = this.voice.get(userId);
    if (v?.guildId === guildId) void this.leaveVoice(userId);
  }
  voiceUsersIn(channelId: string): string[] {
    return [...this.voice.values()].filter((v) => v.channelId === channelId).map((v) => v.userId);
  }
  /** a moderator removed them from voice */
  forceLeaveVoice(userId: string) {
    void this.leaveVoice(userId);
  }
  voiceChannelOf(userId: string): { channelId: string; guildId: string | null } | null {
    const v = this.voice.get(userId);
    return v ? { channelId: v.channelId, guildId: v.guildId } : null;
  }
  onlineMembers(guildId: string): string[] {
    return [...(this.guildMembers.get(guildId) ?? [])];
  }
  isOnline(userId: string) {
    return this.byUser.has(userId);
  }
  presenceOf(userId: string): Status {
    return this.status.get(userId) ?? 'offline';
  }
  voiceCount(channelId: string, exceptUserId?: string) {
    let n = 0;
    for (const v of this.voice.values()) if (v.channelId === channelId && v.userId !== exceptUserId) n++;
    return n;
  }
  kickSessions(userId: string) {
    for (const c of this.byUser.get(userId) ?? []) c.ws.close(CLOSE.AUTH_FAILED, 'session revoked');
  }
  closeSession(sessionId: string) {
    for (const c of this.conns) if (c.sessionId === sessionId) c.ws.close(CLOSE.AUTH_FAILED, 'logged out');
  }

  // ── dispatch
  private send(c: Conn, frame: ServerFrame) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(frame));
  }
  private dispatch(c: Conn, ev: DispatchEvent) {
    this.send(c, { op: 'dispatch', s: ++c.seq, ...ev } as ServerFrame);
  }
  dispatchToUser(userId: string, ev: DispatchEvent) {
    for (const c of this.byUser.get(userId) ?? []) this.dispatch(c, ev);
  }
  dispatchToUsers(userIds: Iterable<string>, ev: DispatchEvent) {
    for (const u of userIds) this.dispatchToUser(u, ev);
  }
  dispatchToGuild(guildId: string, ev: DispatchEvent, exceptUserId?: string) {
    for (const u of this.guildMembers.get(guildId) ?? []) if (u !== exceptUserId) this.dispatchToUser(u, ev);
  }

  /** Guild channel: online members who can VIEW it (four queries regardless of size). DM: its recipients. */
  async dispatchToChannelViewers(channel: Channel, ev: DispatchEvent, exceptUserId?: string) {
    if (!channel.guildId) {
      const recips = (await recipientIds(this.db, channel.id)).filter((u) => u !== exceptUserId);
      // a closed DM re-opens for its recipients when a new message lands
      if (ev.t === 'MESSAGE_CREATE') await this.db.query(`update channel_recipients set closed = false where channel_id = $1 and closed`, [channel.id]);
      this.dispatchToUsers(recips, ev);
      return;
    }
    const online = [...(this.guildMembers.get(channel.guildId) ?? [])].filter((u) => u !== exceptUserId);
    if (!online.length) return;
    const g = await this.db.query<{ ownerId: string }>(`select owner_id as "ownerId" from guilds where id = $1`, [channel.guildId]);
    const roles = await this.db.query<{ id: string; permissions: string; position: number; isEveryone: boolean }>(
      `select id, permissions::text as permissions, position, is_everyone as "isEveryone" from roles where guild_id = $1`,
      [channel.guildId],
    );
    const mem = await this.db.query<{ userId: string; roleIds: string[] | null; timeoutUntil: Date | null }>(
      `select m.user_id as "userId", m.timeout_until as "timeoutUntil",
              array_agg(mr.role_id) filter (where mr.role_id is not null) as "roleIds"
         from guild_members m left join member_roles mr on mr.guild_id = m.guild_id and mr.user_id = m.user_id
        where m.guild_id = $1 and m.user_id = any($2::uuid[]) group by m.user_id, m.timeout_until`,
      [channel.guildId, online],
    );
    const ow = (await channelOverwrites(this.db, [channel.id])).get(channel.id) ?? [];
    const guild = { id: channel.guildId, ownerId: g.rows[0]?.ownerId ?? '' };
    const roleList = roles.rows.map((r) => ({ ...r, permissions: BigInt(r.permissions) }));
    for (const m of mem.rows) {
      const p = computePermissions(guild, { userId: m.userId, roleIds: m.roleIds ?? [], timeoutUntil: m.timeoutUntil }, roleList, ow);
      if (has(p, P.VIEW_CHANNEL)) this.dispatchToUser(m.userId, ev);
    }
  }

  async broadcastLatestSystemMessage(guildId: string) {
    const { rows } = await this.db.query<MessageRow>(
      `${MESSAGE_SELECT} join guilds g on g.system_channel_id = m.channel_id where g.id = $1 and m.type = 'system_join' order by m.id desc limit 1`,
      [guildId],
    );
    const r = rows[0];
    if (!r) return;
    const ch = await this.db.query<Channel>(`select id, guild_id as "guildId", type from channels where id = $1`, [r.channelId]);
    if (ch.rows[0]) await this.dispatchToChannelViewers(ch.rows[0], { t: 'MESSAGE_CREATE', d: { ...toMessage(r), guildId } });
  }

  close() {
    clearInterval(this.sweep);
    for (const c of this.calls.values()) clearTimeout(c.timer);
    for (const c of this.conns) c.ws.close(1001, 'server shutdown');
  }
}
