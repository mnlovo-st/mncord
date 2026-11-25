// v1.2: "Playing …" activity, live profile updates (USER_UPDATE), free cosmetics, voice moderation
// (server mute shows on the voice state, move, disconnect).
import { beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { open, type Edge } from './harness.ts';
import type { AuthTokens, FullProfile, Guild, ServerFrame, VoiceState } from '@mncord/shared';

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
  const waiters: { pred: (f: ServerFrame) => boolean; resolve: (f: ServerFrame) => void }[] = [];
  ws.on('message', (raw) => {
    const f = JSON.parse(raw.toString()) as ServerFrame;
    frames.push(f);
    for (const w of [...waiters]) if (w.pred(f)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(f); }
  });
  ws.on('open', () => ws.send(JSON.stringify({ op: 'identify', token })));
  const next = (pred: (f: ServerFrame) => boolean, ms = 5000) =>
    new Promise<ServerFrame>((resolve, reject) => {
      const hit = frames.find(pred);
      if (hit) { frames.splice(frames.indexOf(hit), 1); return resolve(hit); }
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error('timeout')), ms);
    });
  return { ws, frames, next };
}
const isT = (t: string, f2?: (d: never) => boolean) => (f: ServerFrame) => f.op === 'dispatch' && f.t === t && (!f2 || f2((f as unknown as { d: never }).d));
const d = <T,>(f: ServerFrame) => (f as unknown as { d: T }).d;

const users: Record<string, { id: string; t: string }> = {};
async function make(name: string) {
  const r = await api<AuthTokens>('POST', '/auth/register', { email: `${name}@example.test`, username: name, password: 'long enough password', dateOfBirth: '2000-01-01' });
  const me = await api<{ id: string }>('GET', '/users/@me', undefined, r.body.accessToken);
  users[name] = { id: me.body.id, t: r.body.accessToken };
}
const tok = (n: string) => users[n]!.t;
let guild: Guild;
let voiceA = '';
let voiceB = '';

beforeAll(async () => {
  db = open('v12');
  base = db.base;
  for (const n of ['mod', 'gamer', 'friend']) await make(n);
  guild = (await api<Guild>('POST', '/guilds', { name: 'v12 hq', template: 'gaming' }, tok('mod'))).body;
  const inv = await api<{ code: string }>('POST', `/channels/${guild.channels.find((c) => c.type === 'text')!.id}/invites`, {}, tok('mod'));
  for (const n of ['gamer', 'friend']) await api('POST', `/invites/${inv.body.code}`, {}, tok(n));
  const voices = guild.channels.filter((c) => c.type === 'voice');
  voiceA = voices[0]!.id;
  voiceB = voices[1]?.id ?? (await api<{ id: string }>('POST', `/guilds/${guild.id}/channels`, { type: 'voice', name: 'second' }, tok('mod'))).body.id;
}, 60_000);

describe('v1.2', () => {
  it('activity: what you play reaches people who can see you, with the start time; READY and profile carry it', async () => {
    const gF = gateway(tok('friend'));
    await gF.next(isT('READY'));
    const gG = gateway(tok('gamer'));
    await gG.next(isT('READY'));
    const startedAt = Date.now() - 60_000;
    gG.ws.send(JSON.stringify({ op: 'activity', activity: { name: 'VALORANT', startedAt } }));
    const p = d<{ userId: string; activity: { name: string; startedAt: number } }>(await gF.next(isT('PRESENCE_UPDATE', (x: { userId: string; activity?: unknown }) => x.userId === users.gamer!.id && !!x.activity)));
    expect(p.activity).toEqual({ name: 'VALORANT', startedAt });
    // same game again: no extra event spam (nothing changed)
    gG.ws.send(JSON.stringify({ op: 'activity', activity: { name: 'VALORANT', startedAt } }));
    // a fresh connection sees it in READY
    const gF2 = gateway(tok('friend'));
    const ready = d<{ presences: { userId: string; activity?: { name: string } }[] }>(await gF2.next(isT('READY')));
    expect(ready.presences.find((x) => x.userId === users.gamer!.id)?.activity?.name).toBe('VALORANT');
    expect((await api<FullProfile>('GET', `/users/${users.gamer!.id}/profile`, undefined, tok('friend'))).body.activity?.name).toBe('VALORANT');
    // stop playing
    gG.ws.send(JSON.stringify({ op: 'activity', activity: null }));
    const off = d<{ activity: unknown }>(await gF.next(isT('PRESENCE_UPDATE', (x: { userId: string; activity?: unknown }) => x.userId === users.gamer!.id && !x.activity)));
    expect(off.activity).toBeNull();
    // garbage is refused (the socket is closed for an invalid frame)
    const bad = gateway(tok('gamer'));
    await bad.next(isT('READY'));
    const closed = new Promise<number>((r) => bad.ws.on('close', (c) => r(c)));
    bad.ws.send(JSON.stringify({ op: 'activity', activity: { name: 'x'.repeat(200), startedAt: 1 } }));
    expect(await closed).toBe(4002);
    for (const g of [gF, gF2, gG]) g.ws.close();
  });

  it('profile changes reach everyone right away (USER_UPDATE) and cosmetics are saved and validated', async () => {
    const gF = gateway(tok('friend'));
    await gF.next(isT('READY'));
    const style = { decoration: 'rainbow', effect: 'sparkles', nameStyle: 'gold', nameplate: 'galaxy' };
    const me = await api<{ style: typeof style; displayName: string }>('PATCH', '/users/@me', { displayName: 'Pro Gamer', style }, tok('gamer'));
    expect(me.status).toBe(200);
    expect(me.body.style).toEqual(style);
    const u = d<{ id: string; displayName: string; style: typeof style }>(await gF.next(isT('USER_UPDATE', (x: { id: string }) => x.id === users.gamer!.id)));
    expect(u.displayName).toBe('Pro Gamer');
    expect(u.style.nameStyle).toBe('gold');
    // members list and profile carry the style
    const members = await api<{ userId: string; user: { style: typeof style } }[]>('GET', `/guilds/${guild.id}/members`, undefined, tok('friend'));
    expect(members.body.find((m) => m.userId === users.gamer!.id)?.user.style?.decoration).toBe('rainbow');
    expect((await api<FullProfile>('GET', `/users/${users.gamer!.id}/profile`, undefined, tok('friend'))).body.style?.effect).toBe('sparkles');
    // only simple ids
    expect((await api('PATCH', '/users/@me', { style: { decoration: '<script>' } }, tok('gamer'))).status).toBe(400);
    // clearing
    expect((await api<{ style: unknown }>('PATCH', '/users/@me', { style: null }, tok('gamer'))).body.style).toBeNull();
    gF.ws.close();
  });

  it('voice moderation: server mute shows on the voice state; move and disconnect need Move Members', async () => {
    const gM = gateway(tok('mod'));
    await gM.next(isT('READY'));
    const gG = gateway(tok('gamer'));
    await gG.next(isT('READY'));
    gG.ws.send(JSON.stringify({ op: 'voice_state', guildId: guild.id, channelId: voiceA, selfMute: false, selfDeaf: false }));
    await gM.next(isT('VOICE_STATE_UPDATE', (v: VoiceState) => v.userId === users.gamer!.id && v.channelId === voiceA));
    // regular members can't move or disconnect others
    expect((await api('PATCH', `/guilds/${guild.id}/members/${users.mod!.id}`, { voiceChannelId: null }, tok('friend'))).status).toBe(403);
    // server mute → everyone sees it on the tile
    expect((await api('PATCH', `/guilds/${guild.id}/members/${users.gamer!.id}`, { serverMute: true }, tok('mod'))).status).toBe(200);
    const vs = d<VoiceState>(await gM.next(isT('VOICE_STATE_UPDATE', (v: VoiceState) => v.userId === users.gamer!.id && !!v.serverMute)));
    expect(vs.serverMute).toBe(true);
    // move: the member is told where to go
    expect((await api('PATCH', `/guilds/${guild.id}/members/${users.gamer!.id}`, { voiceChannelId: voiceB }, tok('mod'))).status).toBe(200);
    const mv = d<{ channelId: string }>(await gG.next(isT('VOICE_MOVE')));
    expect(mv.channelId).toBe(voiceB);
    // not a voice channel of this server → 404
    expect((await api('PATCH', `/guilds/${guild.id}/members/${users.gamer!.id}`, { voiceChannelId: guild.channels.find((c) => c.type === 'text')!.id }, tok('mod'))).status).toBe(404);
    // disconnect
    expect((await api('PATCH', `/guilds/${guild.id}/members/${users.gamer!.id}`, { voiceChannelId: null }, tok('mod'))).status).toBe(200);
    await gM.next(isT('VOICE_STATE_UPDATE', (v: VoiceState & { left?: boolean }) => v.userId === users.gamer!.id && !!v.left));
    // not in voice any more
    expect((await api<{ error: string }>('PATCH', `/guilds/${guild.id}/members/${users.gamer!.id}`, { voiceChannelId: null }, tok('mod'))).body.error).toBe('not_in_voice');
    for (const g of [gM, gG]) g.ws.close();
  });
});
