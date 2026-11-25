// Cloudflare-specific behaviour: 14-day media expiry, the storage cap, prelogin salts, transactions.
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthTokens, Guild, Message } from '@mncord/shared';
import { open, upload, type Edge } from './harness.ts';

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

let t = '';
let channel = '';
beforeAll(async () => {
  db = open('edge');
  base = db.base;
  const r = await api<AuthTokens>('POST', '/auth/register', { email: 'sara@example.test', username: 'sara', password: 'k'.repeat(43), salt: 'abcdefghijklmnopqrstuv', dateOfBirth: '1999-03-01' });
  t = r.body.accessToken;
  const g = await api<Guild>('POST', '/guilds', { name: 'media', template: 'friends' }, t);
  channel = g.body.channels.find((c) => c.type === 'text')!.id;
}, 60_000);

describe('Cloudflare edition', () => {
  it('transactions roll back when the callback fails', async () => {
    const r = await fetch(`${base}/__dev/tx-check`, { method: 'POST' });
    expect(((await r.json()) as { rolledBack: boolean }).rolledBack).toBe(true);
  });

  it('prelogin: real salt for a real account, a stable fake one otherwise (no account discovery)', async () => {
    const real = await api<{ salt: string; kdf: { alg: string } }>('POST', '/auth/prelogin', { login: 'SARA' });
    expect(real.body.salt).toBe('abcdefghijklmnopqrstuv');
    expect(real.body.kdf.alg).toBe('argon2id');
    const a = await api<{ salt: string }>('POST', '/auth/prelogin', { login: 'nobody@example.test' });
    const b = await api<{ salt: string }>('POST', '/auth/prelogin', { login: 'Nobody@example.test' });
    expect(a.body.salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.body.salt).toBe(b.body.salt);
    expect((await api('POST', '/auth/login', { login: 'sara', password: 'k'.repeat(43) })).status).toBe(200);
  });

  it('images and videos are deleted after 14 days; the message keeps an "expired" placeholder', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...new Array(200).fill(0)]);
    const up = await upload(base, t, 'photo.png', png, 'image/png', { width: 1, height: 1 });
    expect(up.status).toBe(201);
    const m = await api<Message>('POST', `/channels/${channel}/messages`, { content: 'look', attachmentIds: [up.body.id] }, t);
    expect(m.body.attachments[0]?.url).toBeTruthy();
    // nothing young is touched
    await db.cron();
    expect((await fetch(up.body.url)).status).toBe(200);
    // 15 days later
    await db.query(`update files set created_at = $2 where id = $1`, [up.body.id, new Date(Date.now() - 15 * 86_400_000)]);
    const r = (await db.cron()) as { expired: number };
    expect(r.expired).toBe(1);
    expect((await fetch(up.body.url)).status).toBe(404);
    const hist = await api<Message[]>('GET', `/channels/${channel}/messages?limit=5`, undefined, t);
    const att = hist.body.find((x) => x.id === m.body.id)!.attachments[0]!;
    expect([att.expired, att.url]).toEqual([true, null]);
  });

  it('Go Live steps down as the daily share of the free allowance fills up', async () => {
    const cap = async () => (await api<{ streamCap: string }>('GET', '/voice/stream-cap', undefined, t)).body.streamCap;
    expect(await cap()).toBe('1440p100');
    await fetch(`${base}/__dev/usage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bytes: 949e9, dayBytes: 10e9 }) });
    expect(await cap()).toBe('720p30');
    await fetch(`${base}/__dev/usage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bytes: 0, dayBytes: 0 }) });
  });

  it('never passes the free 10 GB: uploads are refused near the 9 GB cap', async () => {
    await db.query(`insert into files (owner_id, key, kind, content_type, size_bytes, status) values ((select id from users limit 1), 'f/filler', 'attachment', 'video/mp4', $1, 'ready')`, [9 * 1024 ** 3 - 1000]);
    const r = await upload(base, t, 'a.mp4', new Uint8Array(5000), 'video/mp4');
    expect([r.status, r.body.error]).toEqual([507, 'storage_full']);
  });
});
