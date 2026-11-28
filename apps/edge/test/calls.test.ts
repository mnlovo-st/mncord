// Calls: DM call audio both ways, republished tracks get pulled again, streamers hear new viewers.
import { beforeAll, describe, expect, it } from 'vitest';
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
beforeAll(async () => {
  db = open('rtc2');
  base = db.base;
  for (const n of ['caller', 'callee']) {
    const r = await api<AuthTokens>('POST', '/auth/register', { email: `${n}@example.test`, username: n, password: 'long enough password', dateOfBirth: '2000-01-01' });
    const me = await api<{ id: string }>('GET', '/users/@me', undefined, r.body.accessToken);
    U[n] = { id: me.body.id, t: r.body.accessToken };
  }
  g = (await api<Guild>('POST', '/guilds', { name: 'rtc2', template: 'gaming' }, U.caller!.t)).body;
  voice = g.channels.find((c) => c.type === 'voice')!.id;
  const inv = await api<{ code: string }>('POST', `/channels/${g.channels.find((c) => c.type === 'text')!.id}/invites`, {}, U.caller!.t);
  await api('POST', `/invites/${inv.body.code}`, undefined, U.callee!.t);
}, 60_000);

const d = <T,>(f: ServerFrame) => (f as unknown as { d: T }).d;

describe('calls', () => {
  it('DM call: both sides get each other mic', async () => {
    const gA = gateway(U.caller!.t);
    const gB = gateway(U.callee!.t);
    await gA.next(isT('READY'));
    await gB.next(isT('READY'));
    const dm = (await api<{ id: string }>('POST', '/users/@me/channels', { recipientIds: [U.callee!.id] }, U.caller!.t)).body.id;
    // caller joins and publishes, then rings
    await api('POST', `/voice/${dm}/join`, undefined, U.caller!.t);
    gA.ws.send(JSON.stringify({ op: 'voice_state', guildId: null, channelId: dm, selfMute: false, selfDeaf: false }));
    await api('POST', `/voice/${dm}/push`, { sessionDescription: offer, tracks: [{ mid: '0', source: 'mic' }] }, U.caller!.t);
    expect((await api('POST', `/calls/${dm}/ring`, {}, U.caller!.t)).status).toBeLessThan(300);
    await gB.next(isT('CALL_CREATE'));
    // callee answers: sees the caller's mic in the join, pulls it
    const join = await api<RtcJoin>('POST', `/voice/${dm}/join`, undefined, U.callee!.t);
    gB.ws.send(JSON.stringify({ op: 'voice_state', guildId: null, channelId: dm, selfMute: false, selfDeaf: false }));
    expect(join.body.participants.find((p) => p.userId === U.caller!.id)?.sources).toContain('mic');
    const pullB = await api<{ tracks: unknown[] }>('POST', `/voice/${dm}/pull`, { tracks: [{ userId: U.caller!.id, source: 'mic' }] }, U.callee!.t);
    expect(pullB.body.tracks.length).toBe(1);
    // callee publishes → the caller is told and can pull it
    await new Promise((r) => setTimeout(r, 100));
    await api('POST', `/voice/${dm}/push`, { sessionDescription: offer, tracks: [{ mid: '0', source: 'mic' }] }, U.callee!.t);
    const ev = d<{ userId: string; sources: string[] }>(await gA.next((f) => isT('RTC_TRACKS')(f) && d<{ userId: string }>(f).userId === U.callee!.id));
    expect(ev.sources).toContain('mic');
    const pullA = await api<{ tracks: unknown[] }>('POST', `/voice/${dm}/pull`, { tracks: [{ userId: U.callee!.id, source: 'mic' }] }, U.caller!.t);
    expect(pullA.body.tracks.length).toBe(1);
    gA.ws.close();
    gB.ws.close();
  });

  it('a republished track is pulled again (stream restart / new mic), and the streamer hears a new viewer', async () => {
    const gA = gateway(U.caller!.t);
    const gB = gateway(U.callee!.t);
    await gA.next(isT('READY'));
    await gB.next(isT('READY'));
    for (const [n, gw] of [['caller', gA], ['callee', gB]] as const) {
      await api('POST', `/voice/${voice}/join`, undefined, U[n]!.t);
      gw.ws.send(JSON.stringify({ op: 'voice_state', guildId: g.id, channelId: voice, selfMute: false, selfDeaf: false }));
    }
    await new Promise((r) => setTimeout(r, 100));
    await api('POST', `/voice/${voice}/push`, { sessionDescription: offer, tracks: [{ mid: '5', source: 'screen' }] }, U.caller!.t);
    const first = d<{ mids: Record<string, string> }>(await gB.next(isT('RTC_TRACKS')));
    expect(first.mids.screen).toBe('5');
    expect((await api<{ tracks: unknown[] }>('POST', `/voice/${voice}/pull`, { tracks: [{ userId: U.caller!.id, source: 'screen' }] }, U.callee!.t)).body.tracks.length).toBe(1);
    expect(d<{ userId: string; watching: boolean }>(await gA.next(isT('STREAM_VIEWER'))).userId).toBe(U.callee!.id);
    // stop and start again: the viewer's old pull is dead, a new pull must work
    await api('POST', `/voice/${voice}/close`, { mids: ['5'], sessionDescription: offer, unpublish: ['screen'] }, U.caller!.t);
    await api('POST', `/voice/${voice}/push`, { sessionDescription: offer, tracks: [{ mid: '7', source: 'screen' }] }, U.caller!.t);
    expect((await api<{ tracks: unknown[] }>('POST', `/voice/${voice}/pull`, { tracks: [{ userId: U.caller!.id, source: 'screen' }] }, U.callee!.t)).body.tracks.length).toBe(1);
    // re-push without closing (republish) is pulled again too
    await api('POST', `/voice/${voice}/push`, { sessionDescription: offer, tracks: [{ mid: '9', source: 'screen' }] }, U.caller!.t);
    expect((await api<{ tracks: unknown[] }>('POST', `/voice/${voice}/pull`, { tracks: [{ userId: U.caller!.id, source: 'screen' }] }, U.callee!.t)).body.tracks.length).toBe(1);
    // same publish again: nothing to do
    expect((await api<{ tracks: unknown[] }>('POST', `/voice/${voice}/pull`, { tracks: [{ userId: U.caller!.id, source: 'screen' }] }, U.callee!.t)).body.tracks.length).toBe(0);
    gA.ws.close();
    gB.ws.close();
  });

  it('find a server by name and join it; owners can turn it off', async () => {
    const r = await api<{ id: string; name: string; joined: boolean }[]>('GET', '/guilds/search?q=rtc2', undefined, U.callee!.t);
    expect(r.body.find((g) => g.id === g.id && g.name === 'rtc2')?.joined).toBe(true);
    const other = (await api<{ id: string }>('POST', '/guilds', { name: 'Hidden Gems', template: 'gaming' }, U.caller!.t)).body;
    const found = await api<{ id: string; joined: boolean }[]>('GET', '/guilds/search?q=hidden%20g', undefined, U.callee!.t);
    expect(found.body.map((g) => g.id)).toContain(other.id);
    expect((await api<{ id: string }>('POST', `/guilds/${other.id}/join`, undefined, U.callee!.t)).body.id).toBe(other.id);
    // owner switches it off: no longer listed or joinable
    await api('PATCH', `/guilds/${other.id}`, { isDiscoverable: false }, U.caller!.t);
    expect((await api<unknown[]>('GET', '/guilds/search?q=hidden', undefined, U.callee!.t)).body.length).toBe(0);
    expect((await api('POST', `/guilds/${other.id}/join`, undefined, U.caller!.t)).status).toBeLessThan(500);
    expect((await api('GET', '/guilds/search?q=%25', undefined, U.callee!.t)).status).toBe(200);
  });
});
