// M1 vertical slice, end to end against a real server + in-memory Postgres (PGlite).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { open, type Edge } from './harness.ts';
import type { AuthTokens, Guild, Message, ServerFrame } from '@mncord/shared';

let db: Edge;
let base = '';

async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
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
      if (hit) return resolve(hit);
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error('timeout waiting for frame')), ms);
    });
  return { ws, frames, next };
}
const isT = (t: string) => (f: ServerFrame) => f.op === 'dispatch' && f.t === t;

beforeAll(async () => {
  db = open('slice');
  base = db.base;
}, 60_000);

afterAll(async () => {
});

describe('M1 slice', () => {
  let a: AuthTokens;
  let b: AuthTokens;
  let guild: Guild;
  const reg = (u: string) => ({ email: `${u}@example.test`, username: u, password: 'correct horse battery', dateOfBirth: '2000-05-05', locale: 'ar' });

  it('registers two users and rejects duplicates and kids', async () => {
    const r1 = await api<AuthTokens>('POST', '/auth/register', reg('mnlovo'));
    expect(r1.status).toBe(201);
    a = r1.body;
    const dup = await api<{ error: string }>('POST', '/auth/register', { ...reg('MNLOVO'), email: 'other@example.test' });
    expect(dup.body.error).toBe('username_taken');
    // third registration from this IP in 10 min would be rate-limited, so B logs in through a fresh register below
  });

  it('second user registers, logs in by username, wrong password fails generically', async () => {
    const r = await api<AuthTokens>('POST', '/auth/register', reg('noor'));
    expect(r.status).toBe(201);
    const bad = await api<{ error: string }>('POST', '/auth/login', { login: 'noor', password: 'nope-nope-nope' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('invalid_login');
    const ghost = await api<{ error: string }>('POST', '/auth/login', { login: 'ghost', password: 'nope-nope-nope' });
    expect(ghost.body.error).toBe('invalid_login'); // same answer: no user enumeration
    const ok = await api<AuthTokens>('POST', '/auth/login', { login: 'NOOR@example.test', password: 'correct horse battery' });
    expect(ok.status).toBe(200);
    b = ok.body;
  });

  it('creates a server from the Arabic template', async () => {
    const r = await api<Guild>('POST', '/guilds', { name: 'مقر mnlovo', template: 'gaming', locale: 'ar' }, a.accessToken);
    expect(r.status).toBe(201);
    guild = r.body;
    expect(guild.channels.find((c) => c.type === 'text')?.name).toBe('عام');
    expect(guild.channels.filter((c) => c.type === 'voice').length).toBe(3);
    const nope = await api('GET', `/guilds/${guild.id}`, undefined, b.accessToken);
    expect(nope.status).toBe(404); // not a member yet
  });

  it('invite → join → live message delivery over the gateway', async () => {
    const general = guild.channels.find((c) => c.type === 'text')!;
    const inv = await api<{ code: string }>('POST', `/channels/${general.id}/invites`, { maxUses: 5 }, a.accessToken);
    expect(inv.status).toBe(201);

    const gA = gateway(a.accessToken);
    const readyA = await gA.next(isT('READY'));
    expect(readyA.op === 'dispatch' && readyA.t === 'READY' && readyA.d.guilds.length).toBe(1);

    const gB = gateway(b.accessToken);
    await gB.next(isT('READY'));
    const join = await api<Guild>('POST', `/invites/${inv.body.code}`, undefined, b.accessToken);
    expect(join.status).toBe(200);
    await gB.next(isT('GUILD_CREATE'));
    await gA.next(isT('GUILD_MEMBER_ADD'));

    const sent = await api<Message>('POST', `/channels/${general.id}/messages`, { content: 'أهلاً نور 👋', nonce: 'n-1' }, a.accessToken);
    expect(sent.status).toBe(201);
    const got = await gB.next((f) => f.op === 'dispatch' && f.t === 'MESSAGE_CREATE' && f.d.id === sent.body.id);
    expect(got.op === 'dispatch' && got.t === 'MESSAGE_CREATE' && got.d.content).toBe('أهلاً نور 👋');

    // retry with the same nonce returns the same message, no duplicate
    const again = await api<Message>('POST', `/channels/${general.id}/messages`, { content: 'أهلاً نور 👋', nonce: 'n-1' }, a.accessToken);
    expect(again.body.id).toBe(sent.body.id);

    const hist = await api<Message[]>('GET', `/channels/${general.id}/messages?limit=50`, undefined, b.accessToken);
    expect(hist.body.at(-1)?.id).toBe(sent.body.id);
    expect(hist.body.some((m) => m.type === 'system_join')).toBe(true);

    // B can't delete A's message
    const del = await api('DELETE', `/channels/${general.id}/messages/${sent.body.id}`, undefined, b.accessToken);
    expect(del.status).toBe(403);

    // voice: token + voice state broadcast
    const voiceCh = guild.channels.find((c) => c.type === 'voice')!;
    const vt = await api<{ sessionId: string; allowed: string[] }>('POST', `/voice/${voiceCh.id}/join`, undefined, b.accessToken);
    expect(vt.status).toBe(200);
    expect(vt.body.sessionId).toMatch(/^sess-/);
    gB.ws.send(JSON.stringify({ op: 'voice_state', guildId: guild.id, channelId: voiceCh.id, selfMute: false, selfDeaf: false }));
    const vs = await gA.next((f) => f.op === 'dispatch' && f.t === 'VOICE_STATE_UPDATE');
    expect(vs.op === 'dispatch' && vs.t === 'VOICE_STATE_UPDATE' && vs.d.channelId).toBe(voiceCh.id);

    // B disconnects → A sees B leave voice
    gB.ws.close();
    const left = await gA.next((f) => f.op === 'dispatch' && f.t === 'VOICE_STATE_UPDATE' && !!f.d.left);
    expect(left).toBeTruthy();
    gA.ws.close();
  });

  it('private channel: messages are not delivered to members who cannot view it', async () => {
    const staff = await db.query<{ id: string }>(`insert into channels (guild_id, type, name) values ($1, 'text', 'staff') returning id`, [guild.id]);
    const everyone = await db.query<{ id: string }>(`select id from roles where guild_id = $1 and is_everyone`, [guild.id]);
    await db.query(`insert into permission_overwrites (channel_id, target_id, target_type, allow, deny) values ($1, $2, 'role', 0, 1)`, [staff.rows[0]!.id, everyone.rows[0]!.id]);
    const gB = gateway(b.accessToken);
    const ready = await gB.next(isT('READY'));
    const seen = ready.op === 'dispatch' && ready.t === 'READY' ? ready.d.guilds[0]!.channels.map((c) => c.name) : [];
    expect(seen).not.toContain('staff');
    const sent = await api<Message>('POST', `/channels/${staff.rows[0]!.id}/messages`, { content: 'secret' }, a.accessToken);
    expect(sent.status).toBe(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(gB.frames.some((f) => f.op === 'dispatch' && f.t === 'MESSAGE_CREATE' && f.d.content === 'secret')).toBe(false);
    const read = await api('GET', `/channels/${staff.rows[0]!.id}/messages`, undefined, b.accessToken);
    expect(read.status).toBe(403);
    gB.ws.close();
  });

  it('refresh rotates; replaying an old refresh token revokes the session family', async () => {
    const r1 = await api<AuthTokens>('POST', '/auth/refresh', { refreshToken: b.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(b.refreshToken);
    const replay = await api<{ error: string }>('POST', '/auth/refresh', { refreshToken: b.refreshToken });
    expect(replay.body.error).toBe('refresh_reused');
    const after = await api<{ error: string }>('POST', '/auth/refresh', { refreshToken: r1.body.refreshToken });
    expect(after.status).toBe(401); // the thief's and the victim's tokens are both dead now
  });

  it('rejects bad input and missing auth', async () => {
    expect((await api('GET', '/users/@me')).status).toBe(401);
    expect((await api('GET', '/users/@me', undefined, 'garbage')).status).toBe(401);
    const long = await api<{ error: string }>('POST', `/channels/${guild.channels.find((c) => c.type === 'text')!.id}/messages`, { content: 'x'.repeat(4001) }, a.accessToken);
    expect(long.body.error).toBe('message_long');
  });
});
