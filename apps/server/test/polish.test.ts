// M7: slowmode, age-restricted channels, @role mentions, avatars, custom status, notification settings.
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthTokens, Guild, Message, SelfUser } from '@mncord/shared';
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
const U: Record<string, { id: string; t: string }> = {};
let g: Guild;
let ch = '';

beforeAll(async () => {
  db = await openDb({ memory: true });
  ({ app } = await buildApp(db));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  process.env.PUBLIC_URL = base;
  const year = new Date().getUTCFullYear();
  for (const [n, dob] of [['boss', '1990-01-01'], ['adult', '1995-01-01'], ['teen', `${year - 15}-01-01`]] as const) {
    const r = await api<AuthTokens>('POST', '/auth/register', { email: `${n}@example.test`, username: n, password: 'long enough password', dateOfBirth: dob });
    const me = await api<{ id: string }>('GET', '/users/@me', undefined, r.body.accessToken);
    U[n] = { id: me.body.id, t: r.body.accessToken };
  }
  g = (await api<Guild>('POST', '/guilds', { name: 'polish' }, U.boss!.t)).body;
  ch = g.channels.find((c) => c.type === 'text')!.id;
  const inv = await api<{ code: string }>('POST', `/channels/${ch}/invites`, {}, U.boss!.t);
  for (const n of ['adult', 'teen']) await api('POST', `/invites/${inv.body.code}`, undefined, U[n]!.t);
}, 60_000);
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('M7', () => {
  it('slowmode: second message within the window is refused (the owner is exempt)', async () => {
    await api('PATCH', `/channels/${ch}`, { slowmodeS: 30 }, U.boss!.t);
    expect((await api('POST', `/channels/${ch}/messages`, { content: 'one' }, U.adult!.t)).status).toBe(201);
    const r = await api<{ error: string; field: string }>('POST', `/channels/${ch}/messages`, { content: 'two' }, U.adult!.t);
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('slowmode');
    expect(Number(r.body.field)).toBeGreaterThan(0);
    expect((await api('POST', `/channels/${ch}/messages`, { content: 'a' }, U.boss!.t)).status).toBe(201);
    expect((await api('POST', `/channels/${ch}/messages`, { content: 'b' }, U.boss!.t)).status).toBe(201);
    await api('PATCH', `/channels/${ch}`, { slowmodeS: 0 }, U.boss!.t);
  });

  it('age-restricted channel: under-18 can neither read nor post', async () => {
    const c = await api<{ id: string }>('POST', `/guilds/${g.id}/channels`, { type: 'text', name: 'adults' }, U.boss!.t);
    await db.query(`update channels set nsfw = true where id = $1`, [c.body.id]);
    expect((await api<{ error: string }>('GET', `/channels/${c.body.id}/messages`, undefined, U.teen!.t)).body.error).toBe('age_restricted');
    expect((await api('POST', `/channels/${c.body.id}/messages`, { content: 'hi' }, U.teen!.t)).status).toBe(403);
    expect((await api('POST', `/channels/${c.body.id}/messages`, { content: 'hi' }, U.adult!.t)).status).toBe(201);
  });

  it('@role mentions reach role holders only when the role is mentionable (or sender has Mention Everyone)', async () => {
    const r = await api<{ id: string }>('POST', `/guilds/${g.id}/roles`, { name: 'Raiders', mentionable: false }, U.boss!.t);
    await api('PATCH', `/guilds/${g.id}/members/${U.teen!.id}`, { roleIds: [r.body.id] }, U.boss!.t);
    const m1 = await api<Message>('POST', `/channels/${ch}/messages`, { content: 'ping @Raiders' }, U.adult!.t);
    expect(m1.body.mentionIds).not.toContain(U.teen!.id);
    const m2 = await api<Message>('POST', `/channels/${ch}/messages`, { content: 'ping @Raiders' }, U.boss!.t);
    expect(m2.body.mentionIds).toContain(U.teen!.id);
  });

  it('avatars: animated allowed, served publicly only once set; custom status saved', async () => {
    const gif = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#8cbcff' } }).gif().toBuffer();
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(gif)], { type: 'image/gif' }), 'a.gif');
    const up = (await (await fetch(`${base}/api/v1/uploads`, { method: 'POST', headers: { authorization: `Bearer ${U.adult!.t}` }, body: fd })).json()) as { id: string };
    expect((await fetch(`${base}/avatars/${up.id}`)).status).toBe(404); // not an avatar yet
    const me = await api<SelfUser>('PATCH', '/users/@me', { avatarFileId: up.id, status: 'dnd', customStatus: { text: 'رايح أنام' } }, U.adult!.t);
    expect(me.body.avatarKey).toBe(up.id);
    expect(me.body.customStatus?.text).toBe('رايح أنام');
    const av = await fetch(`${base}/avatars/${up.id}`);
    expect(av.status).toBe(200);
    expect(av.headers.get('content-type')).toBe('image/gif');
  });

  it('notification settings: mute a server, then a channel override', async () => {
    expect((await api('PUT', '/users/@me/notification-settings', { guildId: g.id, level: 'nothing' }, U.adult!.t)).status).toBe(200);
    expect((await api('PUT', '/users/@me/notification-settings', { channelId: ch, level: 'all' }, U.adult!.t)).status).toBe(200);
    expect((await api('PUT', '/users/@me/notification-settings', { guildId: g.id, level: 'mentions' }, U.adult!.t)).status).toBe(200);
    const list = await api<{ guildId: string | null; channelId: string | null; level: string }[]>('GET', '/users/@me/notification-settings', undefined, U.adult!.t);
    expect(list.body).toHaveLength(2);
    expect(list.body.find((x) => x.guildId === g.id)?.level).toBe('mentions');
  });
});
