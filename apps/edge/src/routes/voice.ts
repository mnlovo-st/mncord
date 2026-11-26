// Voice / video / Go Live through Cloudflare Realtime SFU. Our server is the only thing holding the
// Cloudflare secret: every publish and subscribe is checked against channel permissions, server mute/deafen,
// "are you actually in this voice channel", and the free-tier usage meter before it reaches Cloudflare.
import { has, P, RtcCloseInput, RtcPullInput, RtcPushInput, RtcRenegotiateInput, type MediaSource, type RtcJoin } from '@mncord/shared';
import type { App } from '../shim.ts';
import type { Db } from '../db.ts';
import { forbidden, HttpError, notFound, parse, requireAuth } from '../http.ts';
import { channelPermissions } from '../repo.ts';
import {
  audioAllowed,
  cfApi,
  CfError,
  iceServers,
  loadUsage,
  maxBps,
  participants,
  rtcUsers,
  saveUsage,
  trackName,
  forgetPullsOf,
  videoAllowed,
  streamCap,
  type RtcUser,
} from '../rtc.ts';
import type { Hub } from '../gateway.ts';

let hubRef: Hub | null = null;

const VIDEO: MediaSource[] = ['camera', 'screen', 'screen_audio'];

function allowedSources(perms: bigint, serverMute: boolean): MediaSource[] {
  const out: MediaSource[] = [];
  if (has(perms, P.SPEAK) && !serverMute) out.push('mic');
  if (has(perms, P.STREAM) && videoAllowed()) out.push('camera', 'screen', 'screen_audio');
  return out;
}

function broadcastTracks(u: RtcUser) {
  hubRef?.dispatchToUsers(hubRef.voiceUsersIn(u.channelId), { t: 'RTC_TRACKS', d: { channelId: u.channelId, userId: u.userId, sources: [...u.published.keys()], mids: Object.fromEntries(u.published) } });
}

/** Removes someone's media from the call (leave, kick, lost permission). */
export async function dropRtc(userId: string) {
  const u = rtcUsers.get(userId);
  if (!u) return;
  rtcUsers.delete(userId);
  // everyone who was pulling this person's tracks stops counting toward usage
  for (const other of rtcUsers.values()) for (const key of [...other.pulls.keys()]) if (key.startsWith(`${userId}:`)) other.pulls.delete(key);
  const mids = [...u.published.values()];
  u.published.clear();
  broadcastTracks(u);
  if (mids.length) await cfApi.close(u.sessionId, mids).catch(() => {});
}

/** Server mute/deafen or a permission change while someone is in voice: stop what they may no longer send or hear. */
export async function applyVoicePermissions(channelId: string, userId: string, opts: { speak: boolean; stream: boolean; deaf: boolean }) {
  const u = rtcUsers.get(userId);
  if (!u || u.channelId !== channelId) return;
  const stop: MediaSource[] = [];
  if (!opts.speak && u.published.has('mic')) stop.push('mic');
  if (!opts.stream) for (const s of VIDEO) if (u.published.has(s)) stop.push(s);
  if (stop.length) {
    const mids = stop.map((s) => u.published.get(s)!);
    for (const s of stop) u.published.delete(s);
    await cfApi.close(u.sessionId, mids).catch(() => {});
    broadcastTracks(u);
  }
  if (opts.deaf && u.pulls.size) {
    const mids = [...u.pulls.values()].map((p) => p.mid);
    u.pulls.clear();
    await cfApi.close(u.sessionId, mids).catch(() => {});
  }
  const allowed: MediaSource[] = [...(opts.speak ? (['mic'] as MediaSource[]) : []), ...(opts.stream && videoAllowed() ? VIDEO : [])];
  hubRef?.dispatchToUser(userId, { t: 'RTC_FORCE', d: { channelId, serverMute: !opts.speak, serverDeaf: opts.deaf, allowed } });
}

export async function kickFromVoice(_channelId: string, userId: string) {
  await dropRtc(userId);
  hubRef?.forceLeaveVoice(userId);
}

export function voiceRoutes(app: App, db: Db, hub: Hub) {
  hubRef = hub;
  hub.onVoiceLeave = (userId) => void dropRtc(userId);
  void loadUsage(db).catch(() => {});
  const timer = setInterval(() => void saveUsage(db).catch(() => {}), 60_000);
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await saveUsage(db).catch(() => {});
  });
  app.addHook('preHandler', requireAuth);

  /** Cloudflare problems become clean API errors (never leak upstream details). */
  const cfCall = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof CfError) throw new HttpError(e.status === 503 ? 503 : 502, e.status === 503 ? 'rtc_not_configured' : 'rtc_unavailable');
      throw e;
    }
  };

  async function voiceAccess(channelId: string, userId: string) {
    const cp = await channelPermissions(db, channelId, userId);
    if (!cp) throw notFound();
    if (!['voice', 'stage', 'dm', 'group_dm'].includes(cp.channel.type)) throw new HttpError(400, 'not_voice_channel');
    if (!has(cp.perms, P.VIEW_CHANNEL | P.CONNECT)) throw forbidden();
    const mod = cp.channel.guildId
      ? (await db.query<{ mute: boolean; deaf: boolean }>(`select server_mute as mute, server_deaf as deaf from guild_members where guild_id = $1 and user_id = $2`, [cp.channel.guildId, userId])).rows[0]
      : undefined;
    return { cp, serverMute: !!mod?.mute, serverDeaf: !!mod?.deaf };
  }
  const mine = (userId: string, channelId: string) => {
    const u = rtcUsers.get(userId);
    if (!u || u.channelId !== channelId) throw new HttpError(409, 'not_in_voice');
    return u;
  };

  // join: one Cloudflare session per person per call
  /** Fresh Go Live cap right before someone starts streaming. */
  app.get('/voice/stream-cap', async () => ({ streamCap: streamCap(), videoAllowed: videoAllowed() }));

  app.post('/voice/:id/join', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req): Promise<RtcJoin> => {
    const { cp, serverMute, serverDeaf } = await voiceAccess(req.params.id, req.userId);
    const inChannel = hub.voiceCount(cp.channel.id, req.userId);
    if (cp.channel.userLimit > 0 && inChannel >= cp.channel.userLimit && !has(cp.perms, P.MOVE_MEMBERS)) throw new HttpError(403, 'channel_full');
    if (!audioAllowed()) throw new HttpError(503, 'rtc_quota');
    await dropRtc(req.userId); // a previous call of yours ends
    const { sessionId } = await cfCall(() => cfApi.newSession());
    rtcUsers.set(req.userId, { userId: req.userId, channelId: cp.channel.id, sessionId, published: new Map(), pulls: new Map() });
    return {
      sessionId,
      iceServers: await iceServers(),
      allowed: allowedSources(cp.perms, serverMute),
      bitrate: cp.channel.bitrate,
      serverMute,
      serverDeaf,
      participants: participants(cp.channel.id).filter((p) => p.userId !== req.userId),
      videoAllowed: videoAllowed(),
      streamCap: streamCap(),
    };
  });

  // publish your mic / camera / screen
  app.post('/voice/:id/push', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const input = parse(RtcPushInput, req.body);
    const { cp, serverMute } = await voiceAccess(req.params.id, req.userId);
    const u = mine(req.userId, cp.channel.id);
    const allowed = allowedSources(cp.perms, serverMute);
    for (const t of input.tracks) if (!allowed.includes(t.source)) throw forbidden(t.source === 'mic' && serverMute ? 'server_muted' : 'missing_permission');
    const res = await cfCall(() => cfApi.push(u.sessionId, input.sessionDescription, input.tracks.map((t) => ({ mid: t.mid, trackName: trackName(req.userId, t.source) }))));
    for (const t of input.tracks) {
      if (u.published.has(t.source)) forgetPullsOf(req.userId, t.source); // republish: old pulls are dead
      u.published.set(t.source, t.mid);
    }
    broadcastTracks(u);
    return { sessionDescription: res.sessionDescription };
  });

  // subscribe to someone else's track in the same call
  app.post('/voice/:id/pull', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const input = parse(RtcPullInput, req.body);
    const { cp, serverDeaf } = await voiceAccess(req.params.id, req.userId);
    const u = mine(req.userId, cp.channel.id);
    if (serverDeaf) throw forbidden('server_deafened');
    const wanted: { sessionId: string; trackName: string; key: string; bps: number; pubMid: string }[] = [];
    for (const t of input.tracks) {
      const pub = rtcUsers.get(t.userId);
      if (!pub || pub.channelId !== cp.channel.id || !pub.published.has(t.source)) throw notFound('track_not_found');
      if (VIDEO.includes(t.source) && !videoAllowed()) throw new HttpError(503, 'rtc_quota');
      if (t.source === 'mic' && !audioAllowed()) throw new HttpError(503, 'rtc_quota');
      const key = `${t.userId}:${t.source}`;
      const pubMid = pub.published.get(t.source)!;
      if (u.pulls.get(key)?.pubMid === pubMid) continue; // already receiving this exact publish
      wanted.push({ sessionId: pub.sessionId, trackName: trackName(t.userId, t.source), key, bps: maxBps(t.source), pubMid });
    }
    if (!wanted.length) return { tracks: [] };
    const res = await cfCall(() => cfApi.pull(u.sessionId, wanted.map(({ sessionId, trackName: n }) => ({ sessionId, trackName: n }))));
    const tracks: { userId: string; source: MediaSource; mid: string }[] = [];
    for (const r of res.tracks ?? []) {
      const w = wanted.find((x) => x.trackName === r.trackName);
      if (!w || !r.mid || r.errorCode) continue;
      u.pulls.set(w.key, { mid: r.mid, bps: w.bps, since: Date.now(), pubMid: w.pubMid });
      const [userId, source] = w.key.split(':') as [string, MediaSource];
      tracks.push({ userId, source, mid: r.mid });
      // Go Live: the streamer hears that someone started watching
      if (source === 'screen') hub.dispatchToUser(userId, { t: 'STREAM_VIEWER', d: { channelId: cp.channel.id, userId: req.userId, watching: true } });
    }
    return { sessionDescription: res.sessionDescription, requiresImmediateRenegotiation: res.requiresImmediateRenegotiation ?? !!res.sessionDescription, tracks };
  });

  app.put('/voice/:id/renegotiate', async (req, reply) => {
    const { sessionDescription } = parse(RtcRenegotiateInput, req.body);
    const u = mine(req.userId, req.params.id);
    await cfCall(() => cfApi.renegotiate(u.sessionId, sessionDescription));
    return reply.status(204).send();
  });

  // stop publishing (negotiated) or stop receiving (forced on your own session)
  app.post('/voice/:id/close', async (req) => {
    const input = parse(RtcCloseInput, req.body);
    const u = mine(req.userId, req.params.id);
    const owned = new Set([...u.published.values(), ...[...u.pulls.values()].map((p) => p.mid)]);
    if (input.mids.some((m) => !owned.has(m))) throw forbidden('not_your_track');
    const res = await cfCall(() => cfApi.close(u.sessionId, input.mids, input.sessionDescription));
    for (const s of input.unpublish) {
      u.published.delete(s);
      forgetPullsOf(req.userId, s);
    }
    for (const [k, p] of [...u.pulls]) if (input.mids.includes(p.mid)) u.pulls.delete(k);
    if (input.unpublish.length) broadcastTracks(u);
    return { sessionDescription: res.sessionDescription };
  });

  /** what everyone in your call is publishing right now (the app uses it to heal a missed update) */
  app.get('/voice/:id/participants', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    mine(req.userId, req.params.id);
    return participants(req.params.id).filter((p) => p.userId !== req.userId);
  });

  app.delete('/voice/:id/session', async (req, reply) => {
    const u = rtcUsers.get(req.userId);
    if (u?.channelId === req.params.id) await dropRtc(req.userId);
    return reply.status(204).send();
  });
}
