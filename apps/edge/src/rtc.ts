// Cloudflare Realtime SFU client (server side only: the app secret never leaves the server)
// + who-publishes-what per voice channel + a conservative egress meter that keeps us inside the free 1,000 GB/month.
import type { MediaSource, RtcParticipant, SessionDescription } from '@mncord/shared';
import type { Queryable } from './db.ts';

const base = () => process.env.CF_RTC_BASE ?? 'https://rtc.live.cloudflare.com/v1';
const appId = () => process.env.CF_REALTIME_APP_ID ?? '';
const secret = () => process.env.CF_REALTIME_APP_SECRET ?? '';
export const rtcConfigured = () => !!appId() && !!secret();

export class CfError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

async function cf<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!rtcConfigured()) throw new CfError(503, 'rtc_not_configured');
  const r = await fetch(`${base()}/apps/${appId()}${path}`, {
    method,
    headers: { authorization: `Bearer ${secret()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await r.text();
  const data = (text ? JSON.parse(text) : {}) as T & { errorCode?: string; errorDescription?: string };
  if (!r.ok || data.errorCode) throw new CfError(r.ok ? 502 : r.status, data.errorDescription ?? data.errorCode ?? `cloudflare ${r.status}`);
  return data;
}

export interface CfTracksResponse {
  sessionDescription?: SessionDescription;
  requiresImmediateRenegotiation?: boolean;
  tracks?: { mid?: string; trackName?: string; sessionId?: string; errorCode?: string; errorDescription?: string }[];
}

export const cfApi = {
  newSession: () => cf<{ sessionId: string }>('POST', '/sessions/new'),
  push: (sessionId: string, offer: SessionDescription, tracks: { mid: string; trackName: string }[]) =>
    cf<CfTracksResponse>('POST', `/sessions/${sessionId}/tracks/new`, { sessionDescription: offer, tracks: tracks.map((t) => ({ location: 'local', ...t })) }),
  pull: (sessionId: string, tracks: { sessionId: string; trackName: string; simulcast?: { preferredRid: string } }[]) =>
    cf<CfTracksResponse>('POST', `/sessions/${sessionId}/tracks/new`, { tracks: tracks.map((t) => ({ location: 'remote', ...t })) }),
  renegotiate: (sessionId: string, answer: SessionDescription) => cf<CfTracksResponse>('PUT', `/sessions/${sessionId}/renegotiate`, { sessionDescription: answer }),
  close: (sessionId: string, mids: string[], offer?: SessionDescription) =>
    cf<CfTracksResponse>('PUT', `/sessions/${sessionId}/tracks/close`, offer ? { tracks: mids.map((mid) => ({ mid })), sessionDescription: offer, force: false } : { tracks: mids.map((mid) => ({ mid })), force: true }),
};

/** ICE servers: Cloudflare STUN always; TURN (relay for strict networks) when a TURN key is configured. */
export async function iceServers(): Promise<{ urls: string | string[]; username?: string; credential?: string }[]> {
  const stun = [{ urls: 'stun:stun.cloudflare.com:3478' }];
  const keyId = process.env.CF_TURN_KEY_ID;
  const token = process.env.CF_TURN_KEY_TOKEN;
  if (!keyId || !token) return stun;
  try {
    const r = await fetch(`${base()}/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return stun;
    const data = (await r.json()) as { iceServers?: { urls: string | string[]; username?: string; credential?: string }[] | { urls: string | string[]; username?: string; credential?: string } };
    const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    return [...stun, ...list];
  } catch {
    return stun;
  }
}

// ── who is publishing what (in memory; rebuilt as people rejoin)
export interface RtcUser {
  userId: string;
  channelId: string;
  sessionId: string;
  published: Map<MediaSource, string>; // source → mid on their session
  pulls: Map<string, { mid: string; bps: number; since: number; pubMid?: string }>; // `${userId}:${source}` → pulled mid (+ which publish it came from)
}

export const rtcUsers = new Map<string, RtcUser>();
/** a track was republished or stopped: everyone's old subscription to it is dead (they must pull again) */
export function forgetPullsOf(userId: string, source: MediaSource) {
  for (const other of rtcUsers.values()) other.pulls.delete(`${userId}:${source}`);
}
export const trackName = (userId: string, source: MediaSource) => `${userId}:${source}`;

export function participants(channelId: string): RtcParticipant[] {
  return [...rtcUsers.values()].filter((u) => u.channelId === channelId).map((u) => ({ userId: u.userId, sources: [...u.published.keys()], mids: Object.fromEntries(u.published) }));
}

// ── egress meter. Cloudflare bills what it SENDS to viewers, so each pull counts at the track's max bitrate.
const FREE_BYTES = 1000 * 1e9;
export const VIDEO_STOP_AT = 0.95 * FREE_BYTES; // video pauses at 950 GB
export const AUDIO_STOP_AT = 0.995 * FREE_BYTES; // voice keeps going until 995 GB
const month = () => new Date().toISOString().slice(0, 7);
const day = () => new Date().toISOString().slice(0, 10);
let usage = { month: month(), bytes: 0, day: day(), dayBytes: 0, dirty: false };

/** Go Live quality steps, best first, with the bitrate each is metered at. */
export const STREAM_CAPS = [
  { cap: '1440p100', bps: 16_000_000 },
  { cap: '1080p60', bps: 8_000_000 },
  { cap: '1080p30', bps: 4_500_000 },
  { cap: '720p30', bps: 2_500_000 },
] as const;
export type StreamCap = (typeof STREAM_CAPS)[number]['cap'];

/**
 * Today's share of what is left this month, so a busy day can't eat next week's allowance:
 * (video allowance left) / (days left in the month). Streams step down as today's share fills up.
 */
export function streamCap(): StreamCap {
  settle();
  const now = new Date();
  const daysLeft = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime() / 86_400_000 - Math.floor(now.getTime() / 86_400_000);
  const budget = Math.max(0, VIDEO_STOP_AT - (usage.bytes - usage.dayBytes)) / Math.max(1, daysLeft);
  const used = budget > 0 ? usage.dayBytes / budget : 1;
  return used < 0.5 ? '1440p100' : used < 0.75 ? '1080p60' : used < 0.9 ? '1080p30' : '720p30';
}
export const capBps = (cap: StreamCap) => STREAM_CAPS.find((c) => c.cap === cap)!.bps;

export const maxBps = (source: MediaSource, streamBps = capBps(streamCap())) =>
  source === 'mic' ? 128_000 : source === 'screen_audio' ? 256_000 : source === 'camera' ? 2_500_000 : streamBps;

function settle(now = Date.now()) {
  if (usage.month !== month()) usage = { month: month(), bytes: 0, day: day(), dayBytes: 0, dirty: true };
  if (usage.day !== day()) usage = { ...usage, day: day(), dayBytes: 0, dirty: true };
  for (const u of rtcUsers.values()) {
    for (const p of u.pulls.values()) {
      const b = ((now - p.since) / 1000) * (p.bps / 8);
      usage.bytes += b;
      usage.dayBytes += b;
      p.since = now;
      usage.dirty = true;
    }
  }
}
export function usedBytes() {
  settle();
  return usage.bytes;
}
export const videoAllowed = () => usedBytes() < VIDEO_STOP_AT;
export const audioAllowed = () => usedBytes() < AUDIO_STOP_AT;

export async function loadUsage(db: Queryable) {
  const { rows } = await db.query<{ bytes: string | number; day: string | null; dayBytes: string | number }>(
    `select bytes, day, day_bytes as "dayBytes" from rtc_usage where month = $1`,
    [month()],
  );
  const r = rows[0];
  usage = { month: month(), bytes: Number(r?.bytes ?? 0), day: day(), dayBytes: r?.day === day() ? Number(r.dayBytes) : 0, dirty: false };
}
export async function saveUsage(db: Queryable) {
  settle();
  if (!usage.dirty) return;
  usage.dirty = false;
  await db.query(
    `insert into rtc_usage (month, bytes, day, day_bytes) values ($1, $2, $3, $4)
     on conflict (month) do update set bytes = excluded.bytes, day = excluded.day, day_bytes = excluded.day_bytes, updated_at = now()`,
    [usage.month, Math.round(usage.bytes), usage.day, Math.round(usage.dayBytes)],
  );
}
/** tests only */
export function _setUsage(bytes: number, dayBytes = 0) {
  usage = { month: month(), bytes, day: day(), dayBytes, dirty: true };
}
