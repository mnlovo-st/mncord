// Cloudflare Realtime behind our server: permissions, "same call only", server mute/deafen, usage cap, secrecy.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { open, type Edge } from './harness.ts';
import type { AuthTokens, Guild, RtcJoin, ServerFrame } from '@mncord/shared';

const cfCalls = () => db.cfCalls();
let db: Edge;
let base = '';
async function api<T>(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: (text ? JSON.parse(text) : null) as T };
}
function gateway(token: string) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/gateway`);
  const frames: ServerFrame[] = [];
  ws.on('message', (raw) => frames.push(JSON.parse(raw.toString()) as ServerFrame));
  ws.on('open', () => ws.send(JSON.stringify({ op: 'identify', token })));
  const next = async (pred: (f: ServerFrame) => boolean, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = frames.findIndex(pred);
      if (i >= 0) return frames.splice(i, 1)[0]!;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('timeout');
  };
  return { ws, next };
}
const isT = (t: string) => (f: ServerFrame) => f.op === 'dispatch' && f.t === t;
const offer = { type: 'offer' as const, sdp: 'v=0 client-offer' };

const U: Record<string, { id: string; t: string }> = {};
let g: Guild;
let voice = '';
let voice2 = '';
let gG: ReturnType<typeof gateway>;

beforeAll(async () => {
  db = open('rtc');
  base = db.base;
  for (const n of ['host', 'guest', 'lurker']) {
    const r = await api<AuthTokens>('POST', '/auth/register', { email: `${n}@example.test`, username: n, password: 'long enough password', dateOfBirth: '2000-01-01' });
    const me = await api<{ id: string }>('GET', '/users/@me', undefined, r.body.accessToken);
    U[n] = { id: me.body.id, t: r.body.accessToken };
  }
  g = (await api<Guild>('POST', '/guilds', { name: 'rtc', template: 'gaming' }, U.host!.t)).body;
  const vc = g.channels.filter((c) => c.type === 'voice');
  voice = vc[0]!.id;
  voice2 = vc[1]!.id;
  const text = g.channels.find((c) => c.type === 'text')!.id;
  const inv = await api<{ code: string }>('POST', `/channels/${text}/invites`, {}, U.host!.t);
  for (const n of ['guest', 'lurker']) await api('POST', `/invites/${inv.body.code}`, undefined, U[n]!.t);
  // the guest stays connected for the whole file: disconnecting = leaving voice (and the server drops their media)
  gG = gateway(U.guest!.t);
  await gG.next(isT('READY'));
  gG.ws.send(JSON.stringify({ op: 'voice_state', guildId: g.id, channelId: voice, selfMute: false, selfDeaf: false }));
  await new Promise((r) => setTimeout(r, 100));
}, 60_000);
afterAll(async () => {
  gG.ws.close();
});

describe('Cloudflare Realtime via our server', () => {
  it('join creates a session; the Cloudflare secret is used only server-side', async () => {
    const r = await api<RtcJoin>('POST', `/voice/${voice}/join`, undefined, U.host!.t);
    expect(r.status).toBe(200);
    expect(r.body.sessionId).toMatch(/^sess-/);
    expect(r.body.allowed).toEqual(['mic', 'camera', 'screen', 'screen_audio']);
    expect(r.body.iceServers[0]?.urls).toContain('stun.cloudflare.com');
    expect(JSON.stringify(r.body)).not.toContain('test-secret');
    expect((await cfCalls()).every((c) => c.auth === 'Bearer test-secret')).toBe(true);
  });

  it('push publishes and tells everyone in the call', async () => {
    await api('POST', `/voice/${voice}/join`, undefined, U.guest!.t);
    await new Promise((r) => setTimeout(r, 100));
    const p = await api<{ sessionDescription: { type: string } }>('POST', `/voice/${voice}/push`, { sessionDescription: offer, tracks: [{ mid: '0', source: 'mic' }, { mid: '1', source: 'screen' }] }, U.host!.t);
    expect(p.body.sessionDescription.type).toBe('answer');
    const ev = await gG.next(isT('RTC_TRACKS'));
    expect((ev as unknown as { d: { sources: string[] } }).d.sources.sort()).toEqual(['mic', 'screen']);
  });

  it('pull: only people in the same call, only tracks that exist', async () => {
    const ok = await api<{ requiresImmediateRenegotiation: boolean; tracks: { userId: string; source: string; mid: string }[] }>('POST', `/voice/${voice}/pull`, { tracks: [{ userId: U.host!.id, source: 'mic' }] }, U.guest!.t);
    expect(ok.status).toBe(200);
    expect(ok.body.requiresImmediateRenegotiation).toBe(true);
    expect(ok.body.tracks[0]).toMatchObject({ userId: U.host!.id, source: 'mic' });
    // the lurker never joined this call
    expect((await api('POST', `/voice/${voice}/pull`, { tracks: [{ userId: U.host!.id, source: 'mic' }] }, U.lurker!.t)).status).toBe(409);
    // lurker in another channel can't reach into this one
    await api('POST', `/voice/${voice2}/join`, undefined, U.lurker!.t);
    expect((await api('POST', `/voice/${voice2}/pull`, { tracks: [{ userId: U.host!.id, source: 'mic' }] }, U.lurker!.t)).status).toBe(404);
    expect((await api('POST', `/voice/${voice}/pull`, { tracks: [{ userId: U.host!.id, source: 'camera' }] }, U.guest!.t)).status).toBe(404);
  });

  it("close: you can only close your own tracks", async () => {
    expect((await api('POST', `/voice/${voice}/close`, { mids: ['0'] }, U.guest!.t)).status).toBe(403); // host's mid
  });

  it('a member without Stream permission cannot publish video', async () => {
    const ev = g.roles.find((r) => r.isEveryone)!;
    const { P, DEFAULT_EVERYONE } = await import('@mncord/shared');
    await api('PATCH', `/guilds/${g.id}/roles/${ev.id}`, { permissions: (DEFAULT_EVERYONE & ~P.STREAM).toString() }, U.host!.t);
    const r = await api<{ error: string }>('POST', `/voice/${voice}/push`, { sessionDescription: offer, tracks: [{ mid: '0', source: 'camera' }] }, U.guest!.t);
    expect(r.status).toBe(403);
    expect((await api('POST', `/voice/${voice}/push`, { sessionDescription: offer, tracks: [{ mid: '0', source: 'mic' }] }, U.guest!.t)).status).toBe(200);
    await api('PATCH', `/guilds/${g.id}/roles/${ev.id}`, { permissions: DEFAULT_EVERYONE.toString() }, U.host!.t);
  });

  it('server mute force-closes the mic on Cloudflare and tells the muted user', async () => {
    const before = (await cfCalls()).length;
    await api('PATCH', `/guilds/${g.id}/members/${U.guest!.id}`, { serverMute: true }, U.host!.t);
    const force = await gG.next(isT('RTC_FORCE'));
    expect((force as unknown as { d: { serverMute: boolean; allowed: string[] } }).d.serverMute).toBe(true);
    const closes = (await cfCalls()).slice(before).filter((c) => c.path.endsWith('/tracks/close'));
    expect(closes.some((c) => (c.body as { force: boolean }).force)).toBe(true);
    expect((await api<{ error: string }>('POST', `/voice/${voice}/push`, { sessionDescription: offer, tracks: [{ mid: '2', source: 'mic' }] }, U.guest!.t)).body.error).toBe('server_muted');
    await api('PATCH', `/guilds/${g.id}/members/${U.guest!.id}`, { serverMute: false }, U.host!.t);
  });

  it('free-tier guard: near 950 GB video stops, voice keeps working; at 995 GB voice stops too', async () => {
    await db.setUsage(960e9);
    expect((await api('POST', `/voice/${voice}/pull`, { tracks: [{ userId: U.host!.id, source: 'screen' }] }, U.guest!.t)).status).toBe(503);
    const j = await api<RtcJoin>('POST', `/voice/${voice2}/join`, undefined, U.lurker!.t);
    expect(j.body.videoAllowed).toBe(false);
    expect(j.body.allowed).toEqual(['mic']);
    await db.setUsage(996e9);
    expect((await api<{ error: string }>('POST', `/voice/${voice2}/join`, undefined, U.lurker!.t)).body.error).toBe('rtc_quota');
    await db.setUsage(0);
  });
});
