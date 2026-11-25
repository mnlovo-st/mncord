// Account gate: email verification first, then the owner's one-time approval.
import { beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { AuthTokens } from '@mncord/shared';
import { open, type Edge } from './harness.ts';

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
const PW = 'k'.repeat(43);
const register = async (name: string) =>
  (await api<AuthTokens>('POST', '/auth/register', { email: `${name}@example.test`, username: name, password: PW, dateOfBirth: '1998-01-01' })).body.accessToken;
const codeFor = async (to: string) => [...(await db.outbox())].reverse().find((m) => m.to === to)?.text.match(/\d{6}/)?.[0] ?? '';
const verify = async (name: string, t: string) => api('POST', '/auth/verify-email', { code: await codeFor(`${name}@example.test`) }, t);

let owner = '';
beforeAll(async () => {
  db = open('gate');
  base = db.base;
  await fetch(`${base}/__dev/gate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) });
  owner = await register('boss');
}, 60_000);

describe('account gate', () => {
  it('nothing works before the email is verified (owner included)', async () => {
    expect((await api<{ error: string }>('POST', '/guilds', { name: 'x', template: 'blank' }, owner)).body.error).toBe('email_unverified');
    expect((await api<{ emailVerified: boolean }>('GET', '/users/@me', undefined, owner)).status).toBe(200); // own profile is allowed
    expect((await verify('boss', owner)).status).toBe(204);
    expect((await api('POST', '/guilds', { name: 'owner hq', template: 'blank' }, owner)).status).toBe(201); // the owner needs no approval
    expect((await api<{ isOwner: boolean; approved: boolean }>('GET', '/users/@me', undefined, owner)).body).toMatchObject({ isOwner: true, approved: true });
  });

  it('a new account waits for the owner after verifying; the owner is told and approves once', async () => {
    const t = await register('newbie');
    await verify('newbie', t);
    expect((await api<{ error: string }>('GET', '/users/@me/relationships', undefined, t)).body.error).toBe('approval_pending');
    expect((await api<{ approved: boolean }>('GET', '/users/@me/approval', undefined, t)).body.approved).toBe(false);
    // the owner got an email about it
    expect((await db.outbox()).some((m) => m.to === 'boss@example.test' && /newbie/.test(m.subject))).toBe(true);
    // the waiting account gets no live data
    const ws = new WebSocket(`${base.replace('http', 'ws')}/gateway`);
    const closed = await new Promise<number>((res) => {
      ws.on('message', (raw) => {
        const f = JSON.parse(raw.toString());
        if (f.op === 'hello') ws.send(JSON.stringify({ op: 'identify', token: t }));
      });
      ws.on('close', (code) => res(code));
    });
    expect(closed).toBeGreaterThanOrEqual(4000);
    // only the owner sees / acts on the list
    expect((await api('GET', '/admin/pending', undefined, t)).status).toBe(403);
    const list = await api<{ username: string; id: string }[]>('GET', '/admin/pending', undefined, owner);
    const entry = list.body.find((u) => u.username === 'newbie')!;
    expect(entry).toBeTruthy();
    expect((await api('POST', `/admin/users/${entry.id}/approve`, undefined, owner)).status).toBe(204);
    expect((await api<{ approved: boolean }>('GET', '/users/@me/approval', undefined, t)).body.approved).toBe(true);
    expect((await api('GET', '/users/@me/relationships', undefined, t)).status).toBe(200);
  });

  it('a declined account is switched off', async () => {
    const t = await register('spammer');
    await verify('spammer', t);
    const list = await api<{ username: string; id: string }[]>('GET', '/admin/pending', undefined, owner);
    const id = list.body.find((u) => u.username === 'spammer')!.id;
    expect((await api('POST', `/admin/users/${id}/decline`, undefined, owner)).status).toBe(204);
    expect((await api<{ error: string }>('POST', '/auth/login', { login: 'spammer', password: PW })).status).toBe(403);
  });
});
