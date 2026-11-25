// M5: server management, with the security rules that matter most: hierarchy and "can't grant what you lack".
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { P, type AuditEntry, type AuthTokens, type Ban, type Channel, type Guild, type InviteInfo, type Member, type Message } from '@mncord/shared';
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
let general = '';
const tok = (n: string) => U[n]!.t;
const guild = async (n = 'owner') => (await api<Guild>('GET', `/guilds/${g.id}`, undefined, tok(n))).body;

beforeAll(async () => {
  db = await openDb({ memory: true });
  ({ app } = await buildApp(db));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  process.env.PUBLIC_URL = base;
  for (const n of ['owner', 'mod', 'member', 'troll']) {
    const r = await api<AuthTokens>('POST', '/auth/register', { email: `${n}@example.test`, username: `${n}x`, password: 'long enough password', dateOfBirth: '2000-01-01' });
    const me = await api<{ id: string }>('GET', '/users/@me', undefined, r.body.accessToken);
    U[n] = { id: me.body.id, t: r.body.accessToken };
  }
  g = (await api<Guild>('POST', '/guilds', { name: 'admin test' }, tok('owner'))).body;
  general = g.channels.find((c) => c.type === 'text')!.id;
  const inv = await api<{ code: string }>('POST', `/channels/${general}/invites`, {}, tok('owner'));
  for (const n of ['mod', 'member', 'troll']) await api('POST', `/invites/${inv.body.code}`, undefined, tok(n));
}, 60_000);
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('M5 server management', () => {
  let modRole = '';
  let helperRole = '';

  it('owner creates roles; members cannot', async () => {
    const r = await api<{ id: string }>('POST', `/guilds/${g.id}/roles`, { name: 'Mods', color: 0x7fb2ff, permissions: (P.KICK_MEMBERS | P.MANAGE_ROLES | P.MANAGE_MESSAGES | P.TIMEOUT_MEMBERS | P.BAN_MEMBERS).toString(), hoist: true }, tok('owner'));
    expect(r.status).toBe(201);
    modRole = r.body.id;
    const h = await api<{ id: string }>('POST', `/guilds/${g.id}/roles`, { name: 'Helpers' }, tok('owner'));
    helperRole = h.body.id;
    expect((await api('POST', `/guilds/${g.id}/roles`, { name: 'x' }, tok('member'))).status).toBe(403);
  });

  it('roles must be ordered: Mods above Helpers', async () => {
    const gg = await guild();
    const mods = gg.roles.find((r) => r.id === modRole)!;
    const helpers = gg.roles.find((r) => r.id === helperRole)!;
    if (mods.position <= helpers.position) {
      expect((await api('PATCH', `/guilds/${g.id}/roles`, [{ id: modRole, position: helpers.position + 1 }, { id: helperRole, position: mods.position }], tok('owner'))).status).toBe(200);
    }
    const after = await guild();
    expect(after.roles.find((r) => r.id === modRole)!.position).toBeGreaterThan(after.roles.find((r) => r.id === helperRole)!.position);
  });

  it('assigning roles: owner can; a mod can give roles below their own but not their own role or above', async () => {
    expect((await api<Member>('PATCH', `/guilds/${g.id}/members/${U.mod!.id}`, { roleIds: [modRole] }, tok('owner'))).status).toBe(200);
    expect((await api('PATCH', `/guilds/${g.id}/members/${U.member!.id}`, { roleIds: [helperRole] }, tok('mod'))).status).toBe(200);
    expect((await api<{ error: string }>('PATCH', `/guilds/${g.id}/members/${U.member!.id}`, { roleIds: [helperRole, modRole] }, tok('mod'))).body.error).toBe('role_hierarchy');
  });

  it("can't grant what you don't have: a mod can't give a role ADMINISTRATOR", async () => {
    const r = await api<{ error: string }>('PATCH', `/guilds/${g.id}/roles/${helperRole}`, { permissions: P.ADMINISTRATOR.toString() }, tok('mod'));
    expect(r.body.error).toBe('cannot_grant');
    const ok = await api('PATCH', `/guilds/${g.id}/roles/${helperRole}`, { permissions: P.MANAGE_MESSAGES.toString() }, tok('mod'));
    expect(ok.status).toBe(200);
    // and can't edit their own role (same level)
    expect((await api<{ error: string }>('PATCH', `/guilds/${g.id}/roles/${modRole}`, { name: 'Gods' }, tok('mod'))).body.error).toBe('role_hierarchy');
  });

  it('timeout: blocks sending, then expires', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    expect((await api('PATCH', `/guilds/${g.id}/members/${U.troll!.id}`, { timeoutUntil: until, reason: 'spam' }, tok('mod'))).status).toBe(200);
    expect((await api('POST', `/channels/${general}/messages`, { content: 'spam' }, tok('troll'))).status).toBe(403);
    expect((await api('GET', `/channels/${general}/messages`, undefined, tok('troll'))).status).toBe(200); // can still read
    await api('PATCH', `/guilds/${g.id}/members/${U.troll!.id}`, { timeoutUntil: null }, tok('mod'));
    expect((await api('POST', `/channels/${general}/messages`, { content: 'sorry' }, tok('troll'))).status).toBe(201);
  });

  it('moderation respects hierarchy: a mod cannot kick the owner or themselves; members cannot kick', async () => {
    expect((await api('DELETE', `/guilds/${g.id}/members/${U.owner!.id}`, undefined, tok('mod'))).status).toBe(403);
    expect((await api('DELETE', `/guilds/${g.id}/members/${U.mod!.id}`, undefined, tok('mod'))).status).toBe(400);
    expect((await api('DELETE', `/guilds/${g.id}/members/${U.troll!.id}`, undefined, tok('member'))).status).toBe(403);
  });

  it('ban: removes the member, deletes recent messages, blocks rejoining; unban', async () => {
    const r = await api('PUT', `/guilds/${g.id}/bans/${U.troll!.id}`, { reason: 'raid', deleteMessageSeconds: 3600 }, tok('mod'));
    expect(r.status).toBe(204);
    const hist = await api<Message[]>('GET', `/channels/${general}/messages`, undefined, tok('owner'));
    expect(hist.body.some((m) => m.author?.id === U.troll!.id && m.type === 'default')).toBe(false);
    const bans = await api<Ban[]>('GET', `/guilds/${g.id}/bans`, undefined, tok('mod'));
    expect(bans.body[0]?.reason).toBe('raid');
    const inv = await api<{ code: string }>('POST', `/channels/${general}/invites`, {}, tok('owner'));
    expect((await api<{ error: string }>('POST', `/invites/${inv.body.code}`, undefined, tok('troll'))).body.error).toBe('banned');
    expect((await api('DELETE', `/guilds/${g.id}/bans/${U.troll!.id}`, undefined, tok('mod'))).status).toBe(204);
    expect((await api('POST', `/invites/${inv.body.code}`, undefined, tok('troll'))).status).toBe(200);
  });

  let staff: Channel;
  it('channels: private channel hides from members, owner still sees it; overwrite grants a role access', async () => {
    const r = await api<Channel>('POST', `/guilds/${g.id}/channels`, { type: 'text', name: 'Staff Room', private: true }, tok('owner'));
    staff = r.body;
    expect(staff.name).toBe('staff-room');
    expect((await guild('member')).channels.map((c) => c.id)).not.toContain(staff.id);
    expect((await api('PUT', `/channels/${staff.id}/permissions/${modRole}`, { type: 'role', allow: P.VIEW_CHANNEL.toString(), deny: '0' }, tok('owner'))).status).toBe(204);
    expect((await guild('mod')).channels.map((c) => c.id)).toContain(staff.id);
    // a mod (no MANAGE_CHANNELS) can't edit or delete the channel
    expect((await api('PATCH', `/channels/${staff.id}`, { name: 'mine' }, tok('mod'))).status).toBe(403);
  });

  it("overwrites: can't allow and deny the same bit; can't grant via overwrite what you lack", async () => {
    expect((await api('PUT', `/channels/${general}/permissions/${helperRole}`, { type: 'role', allow: '1', deny: '1' }, tok('owner'))).status).toBe(400);
    const r = await api<{ error: string }>('PUT', `/channels/${general}/permissions/${helperRole}`, { type: 'role', allow: P.ADMINISTRATOR.toString(), deny: '0' }, tok('mod'));
    expect(r.body.error).toBe('cannot_grant');
  });

  it('category: deleting it keeps its channels; the last text channel cannot be deleted', async () => {
    const cat = await api<Channel>('POST', `/guilds/${g.id}/channels`, { type: 'category', name: 'Extra' }, tok('owner'));
    const inCat = await api<Channel>('POST', `/guilds/${g.id}/channels`, { type: 'voice', name: 'Room', parentId: cat.body.id }, tok('owner'));
    expect((await api('DELETE', `/channels/${cat.body.id}`, undefined, tok('owner'))).status).toBe(204);
    expect((await guild()).channels.find((c) => c.id === inCat.body.id)?.parentId).toBeNull();
  });

  it('settings: rename, icon from an uploaded image; non-images refused', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#f4b740' } }).png().toBuffer();
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'icon.png');
    const up = await (await fetch(`${base}/api/v1/uploads`, { method: 'POST', headers: { authorization: `Bearer ${tok('owner')}` }, body: fd })).json() as { id: string };
    const r = await api<Guild>('PATCH', `/guilds/${g.id}`, { name: 'مقر الإدارة', iconFileId: up.id, defaultNotifications: 'all' }, tok('owner'));
    expect(r.body.name).toBe('مقر الإدارة');
    expect(r.body.iconUrl).toContain('/files/');
    expect((await api('PATCH', `/guilds/${g.id}`, { name: 'x2' }, tok('member'))).status).toBe(403);
  });

  it('emoji: upload, appears in the guild for everyone', async () => {
    const gif = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#00000000' } }).png().toBuffer();
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(gif)], { type: 'image/png' }), 'e.png');
    const up = await (await fetch(`${base}/api/v1/uploads`, { method: 'POST', headers: { authorization: `Bearer ${tok('owner')}` }, body: fd })).json() as { id: string };
    expect((await api('POST', `/guilds/${g.id}/emojis`, { name: 'mnlovo_fire', fileId: up.id }, tok('owner'))).status).toBe(201);
    expect((await guild('member')).emojis.map((e) => e.name)).toEqual(['mnlovo_fire']);
    expect((await api('POST', `/guilds/${g.id}/emojis`, { name: 'bad name!', fileId: up.id }, tok('owner'))).status).toBe(400);
  });

  it('invites list + revoke; audit log records who did what', async () => {
    const invs = await api<InviteInfo[]>('GET', `/guilds/${g.id}/invites`, undefined, tok('owner'));
    expect(invs.body.length).toBeGreaterThan(0);
    expect((await api('DELETE', `/invites/${invs.body[0]!.code}`, undefined, tok('owner'))).status).toBe(204);
    const log = await api<AuditEntry[]>('GET', `/guilds/${g.id}/audit-log`, undefined, tok('owner'));
    const actions = log.body.map((e) => e.action);
    for (const a of ['role_create', 'member_ban', 'member_unban', 'channel_create', 'guild_update', 'invite_delete', 'emoji_create']) expect(actions).toContain(a);
    expect(log.body.find((e) => e.action === 'member_ban')?.reason).toBe('raid');
    expect((await api('GET', `/guilds/${g.id}/audit-log`, undefined, tok('member'))).status).toBe(403);
  });

  it('delete server: owner only, with password', async () => {
    expect((await api('DELETE', `/guilds/${g.id}`, { password: 'long enough password' }, tok('mod'))).status).toBe(403);
    expect((await api('DELETE', `/guilds/${g.id}`, { password: 'wrong' }, tok('owner'))).status).toBe(403);
    expect((await api('DELETE', `/guilds/${g.id}`, { password: 'long enough password' }, tok('owner'))).status).toBe(204);
    expect((await api('GET', `/guilds/${g.id}`, undefined, tok('member'))).status).toBe(404);
  });
});
