// M3: friends, DMs, group DMs, calls, profiles.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { AuthTokens, FullProfile, Message, PrivateChannel, Relationship, ServerFrame } from '@mncord/shared';
import { buildApp } from '../src/app.ts';
import { openDb, type Db } from '../src/db.ts';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
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
const isT = (t: string) => (f: ServerFrame) => f.op === 'dispatch' && f.t === t;
const d = <T,>(f: ServerFrame) => (f as unknown as { d: T }).d;

const users: Record<string, { id: string; t: AuthTokens }> = {};
async function make(name: string) {
  const r = await api<AuthTokens>('POST', '/auth/register', { email: `${name}@example.test`, username: name, password: 'long enough password', dateOfBirth: '2000-01-01' });
  const me = await api<{ id: string }>('GET', '/users/@me', undefined, r.body.accessToken);
  users[name] = { id: me.body.id, t: r.body };
}
const tok = (n: string) => users[n]!.t.accessToken;

beforeAll(async () => {
  db = await openDb({ memory: true });
  ({ app } = await buildApp(db));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  for (const n of ['ali', 'huda', 'omar', 'zain']) await make(n);
}, 60_000);
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('M3 social', () => {
  it('friend request → live incoming → accept → both are friends, presence flows', async () => {
    const gH = gateway(tok('huda'));
    await gH.next(isT('READY'));
    expect((await api('POST', '/users/@me/relationships', { username: 'huda' }, tok('ali'))).status).toBe(204);
    const inc = await gH.next(isT('RELATIONSHIP_ADD'));
    expect(d<Relationship>(inc).type).toBe('incoming');
    expect((await api<{ error: string }>('POST', '/users/@me/relationships', { username: 'huda' }, tok('ali'))).body.error).toBe('request_pending');
    expect((await api('PUT', `/users/@me/relationships/${users.ali!.id}`, { type: 'friend' }, tok('huda'))).status).toBe(204);
    const list = await api<Relationship[]>('GET', '/users/@me/relationships', undefined, tok('ali'));
    expect(list.body.find((r) => r.id === users.huda!.id)?.type).toBe('friend');
    // ali comes online → huda (a friend, no shared server) sees it
    const gA = gateway(tok('ali'));
    await gA.next(isT('READY'));
    const p = await gH.next((f) => isT('PRESENCE_UPDATE')(f) && d<{ userId: string }>(f).userId === users.ali!.id);
    expect(d<{ status: string }>(p).status).toBe('online');
    gA.ws.close();
    gH.ws.close();
  });

  it('unknown user and "nobody" privacy give the same answer', async () => {
    await db.query(`update user_settings set friend_request_policy = 'nobody' where user_id = $1`, [users.zain!.id]);
    const a = await api<{ error: string }>('POST', '/users/@me/relationships', { username: 'zain' }, tok('omar'));
    const b = await api<{ error: string }>('POST', '/users/@me/relationships', { username: 'ghost_user' }, tok('omar'));
    expect(a.body.error).toBe('user_not_found');
    expect(b.body.error).toBe('user_not_found');
  });

  let dm = '';
  it('opening a DM is idempotent even when clicked twice at once', async () => {
    const [x, y] = await Promise.all([
      api<PrivateChannel>('POST', '/users/@me/channels', { recipientIds: [users.huda!.id] }, tok('ali')),
      api<PrivateChannel>('POST', '/users/@me/channels', { recipientIds: [users.huda!.id] }, tok('ali')),
    ]);
    expect(x.body.id).toBe(y.body.id);
    dm = x.body.id;
    expect(x.body.recipients.map((r) => r.username)).toEqual(['huda']);
  });

  it('DM messages arrive live; outsiders cannot read them', async () => {
    const gH = gateway(tok('huda'));
    await gH.next(isT('READY'));
    const m = await api<Message>('POST', `/channels/${dm}/messages`, { content: 'هلا هدى' }, tok('ali'));
    expect(m.status).toBe(201);
    const got = await gH.next((f) => isT('MESSAGE_CREATE')(f) && d<Message>(f).id === m.body.id);
    expect(d<Message>(got).content).toBe('هلا هدى');
    expect((await api('GET', `/channels/${dm}/messages`, undefined, tok('omar'))).status).toBe(404);
    gH.ws.close();
  });

  it('DM privacy: strangers without a shared server cannot open a DM', async () => {
    const r = await api<{ error: string }>('POST', '/users/@me/channels', { recipientIds: [users.zain!.id] }, tok('omar'));
    expect(r.body.error).toBe('dm_not_allowed');
  });

  it('group DMs: friends only; add/remove; leave', async () => {
    expect((await api<{ error: string }>('POST', '/users/@me/channels', { recipientIds: [users.huda!.id, users.omar!.id] }, tok('ali'))).body.error).toBe('not_friends');
    await api('POST', '/users/@me/relationships', { username: 'omar' }, tok('ali'));
    await api('PUT', `/users/@me/relationships/${users.ali!.id}`, { type: 'friend' }, tok('omar'));
    const g = await api<PrivateChannel>('POST', '/users/@me/channels', { recipientIds: [users.huda!.id, users.omar!.id] }, tok('ali'));
    expect(g.body.type).toBe('group_dm');
    expect(g.body.recipients).toHaveLength(2);
    expect((await api<PrivateChannel>('PATCH', `/channels/${g.body.id}/group`, { name: 'الشلة' }, tok('huda'))).body.name).toBe('الشلة');
    expect((await api('DELETE', `/channels/${g.body.id}/recipients/${users.omar!.id}`, undefined, tok('huda'))).status).toBe(403); // not owner
    expect((await api('DELETE', `/channels/${g.body.id}/recipients/${users.omar!.id}`, undefined, tok('ali'))).status).toBe(204);
    expect((await api('DELETE', `/users/@me/channels/${g.body.id}`, undefined, tok('ali'))).status).toBe(204); // owner leaves
    const left = await db.query<{ ownerId: string }>(`select owner_id as "ownerId" from channels where id = $1`, [g.body.id]);
    expect(left.rows[0]?.ownerId).toBe(users.huda!.id); // ownership passed on
  });

  it('calls: ring → callee joins → ring stops; decline ends the call', async () => {
    const gH = gateway(tok('huda'));
    await gH.next(isT('READY'));
    const gA = gateway(tok('ali'));
    await gA.next(isT('READY'));
    expect((await api('POST', `/calls/${dm}/ring`, {}, tok('ali'))).status).toBe(204);
    const ring = await gH.next(isT('CALL_CREATE'));
    expect(d<{ ringing: string[] }>(ring).ringing).toEqual([users.huda!.id]);
    const vt = await api<{ sessionId: string }>('POST', `/voice/${dm}/join`, undefined, tok('huda'));
    expect(vt.body.sessionId).toMatch(/^sess-/);
    gH.ws.send(JSON.stringify({ op: 'voice_state', guildId: null, channelId: dm, selfMute: false, selfDeaf: false }));
    await gA.next((f) => isT('VOICE_STATE_UPDATE')(f) && d<{ userId: string }>(f).userId === users.huda!.id);
    await gA.next(isT('CALL_DELETE')); // nobody left to ring
    gH.ws.send(JSON.stringify({ op: 'voice_state', guildId: null, channelId: null, selfMute: false, selfDeaf: false }));
    await gA.next((f) => isT('VOICE_STATE_UPDATE')(f) && !!d<{ left?: boolean }>(f).left);
    await api('POST', `/calls/${dm}/ring`, {}, tok('ali'));
    await gH.next(isT('CALL_CREATE'));
    await api('POST', `/calls/${dm}/decline`, {}, tok('huda'));
    await gA.next(isT('CALL_DELETE'));
    gA.ws.close();
    gH.ws.close();
  });

  it('block: DM goes read-only both ways, calls refused, profile hidden from the blocked user', async () => {
    expect((await api('PUT', `/users/@me/relationships/${users.ali!.id}`, { type: 'blocked' }, tok('huda'))).status).toBe(204);
    expect((await api('POST', `/channels/${dm}/messages`, { content: 'hi?' }, tok('ali'))).status).toBe(403);
    expect((await api('POST', `/channels/${dm}/messages`, { content: 'hi?' }, tok('huda'))).status).toBe(403);
    expect((await api('POST', `/calls/${dm}/ring`, {}, tok('ali'))).status).toBe(403);
    expect((await api('GET', `/users/${users.huda!.id}/profile`, undefined, tok('ali'))).status).toBe(404);
    const aliRels = await api<Relationship[]>('GET', '/users/@me/relationships', undefined, tok('ali'));
    expect(aliRels.body.find((r) => r.id === users.huda!.id)).toBeUndefined(); // friendship gone on his side
    expect((await api<{ error: string }>('POST', '/users/@me/relationships', { username: 'huda' }, tok('ali'))).body.error).toBe('user_not_found');
    // unblock restores sending (friendship does not come back by itself)
    await api('DELETE', `/users/@me/relationships/${users.ali!.id}`, undefined, tok('huda'));
    expect((await api('POST', `/channels/${dm}/messages`, { content: 'sorry' }, tok('huda'))).status).toBe(201);
  });

  it('profile shows mutual servers and friends', async () => {
    await api('POST', '/guilds', { name: 'shared' }, tok('ali'));
    const g = await db.query<{ id: string; ch: string }>(`select g.id, g.system_channel_id as ch from guilds g where g.name = 'shared'`);
    const inv = await api<{ code: string }>('POST', `/channels/${g.rows[0]!.ch}/invites`, {}, tok('ali'));
    await api('POST', `/invites/${inv.body.code}`, undefined, tok('omar'));
    const p = await api<FullProfile>('GET', `/users/${users.omar!.id}/profile`, undefined, tok('ali'));
    expect(p.body.mutualGuilds.map((x) => x.name)).toEqual(['shared']);
    expect(p.body.relationship).toBe('friend');
  });
});
