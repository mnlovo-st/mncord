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
  pulls: Map<string, { mid: string; bps: number; since: number }>; // `${userId}:${source}` → pulled mid
}

export const rtcUsers = new Map<string, RtcUser>();
export const trackName = (userId: string, source: MediaSource) => `${userId}:${source}`;

export function participants(channelId: string): RtcParticipant[] {
  return [...rtcUsers.values()].filter((u) => u.channelId === channelId).map((u) => ({ userId: u.userId, sources: [...u.published.keys()] }));
}

// ── egress meter. Cloudflare bills what it SENDS to viewers, so each pull counts at the track's max bitrate.
const FREE_BYTES = 1000 * 1e9;
export const VIDEO_STOP_AT = 0.95 * FREE_BYTES; // video pauses at 950 GB
export const AUDIO_STOP_AT = 0.995 * FREE_BYTES; // voice keeps going until 995 GB
const month = () => new Date().toISOString().slice(0, 7);
let usage = { month: month(), bytes: 0, dirty: false };

export const maxBps = (source: MediaSource, streamBps = 14_000_000) =>
  source === 'mic' ? 128_000 : source === 'screen_audio' ? 256_000 : source === 'camera' ? 2_500_000 : streamBps;

function settle(now = Date.now()) {
  if (usage.month !== month()) usage = { month: month(), bytes: 0, dirty: true };
  for (const u of rtcUsers.values()) {
    for (const p of u.pulls.values()) {
      usage.bytes += ((now - p.since) / 1000) * (p.bps / 8);
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
  const { rows } = await db.query<{ bytes: string | number }>(`select bytes from rtc_usage where month = $1`, [month()]);
  usage = { month: month(), bytes: Number(rows[0]?.bytes ?? 0), dirty: false };
}
export async function saveUsage(db: Queryable) {
  settle();
  if (!usage.dirty) return;
  usage.dirty = false;
  await db.query(`insert into rtc_usage (month, bytes) values ($1, $2) on conflict (month) do update set bytes = excluded.bytes, updated_at = now()`, [usage.month, Math.round(usage.bytes)]);
}
/** tests only */
export function _setUsage(bytes: number) {
  usage = { month: month(), bytes, dirty: true };
}
