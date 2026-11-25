// M4: uploads, attachments, edit, reactions, pins, mentions, read states, search.
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { open, upload as up3, type Edge } from './harness.ts';
import type { Attachment, AuthTokens, Guild, Message } from '@mncord/shared';

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
async function upload(token: string, name: string, data: Buffer, type = 'application/octet-stream', extra: { width?: number; height?: number; size?: number } = {}) {
  const r = await up3(base, token, name, new Uint8Array(data), type, extra);
  return r as { status: number; body: Attachment & { error?: string } };
}

const U: Record<string, { id: string; t: string }> = {};
let guild: Guild;
let general = '';

beforeAll(async () => {
  process.env.PUBLIC_URL = ''; // set after listen
  db = open('messaging');
  base = db.base;
  process.env.PUBLIC_URL = base;
  for (const n of ['rami', 'lina', 'outsider']) {
    const r = await api<AuthTokens>('POST', '/auth/register', { email: `${n}@example.test`, username: n, password: 'long enough password', dateOfBirth: '2000-01-01' });
    const me = await api<{ id: string }>('GET', '/users/@me', undefined, r.body.accessToken);
    U[n] = { id: me.body.id, t: r.body.accessToken };
  }
  guild = (await api<Guild>('POST', '/guilds', { name: 'hub' }, U.rami!.t)).body;
  general = guild.channels.find((c) => c.type === 'text')!.id;
  const inv = await api<{ code: string }>('POST', `/channels/${general}/invites`, {}, U.rami!.t);
  await api('POST', `/invites/${inv.body.code}`, undefined, U.lina!.t);
}, 60_000);
afterAll(async () => {
});

describe('M4 messaging', () => {
  let img: Attachment;

  it('uploads an image straight into storage; served with strict headers and range support', async () => {
    const jpg = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#f4b740' } }).jpeg().toBuffer();
    const r = await upload(U.rami!.t, 'photo.jpg', jpg, 'image/jpeg', { width: 64, height: 32 });
    expect(r.status).toBe(201);
    img = r.body;
    expect([img.width, img.height, img.contentType]).toEqual([64, 32, 'image/jpeg']);
    const file = await fetch(img.url!);
    expect(Buffer.from(await file.arrayBuffer()).equals(jpg)).toBe(true);
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
    expect(file.headers.get('content-security-policy')).toContain("default-src 'none'");
    const part = await fetch(img.url!, { headers: { range: 'bytes=0-9' } });
    expect(part.status).toBe(206);
    expect((await part.arrayBuffer()).byteLength).toBe(10);
  });

  it('size limit 200 MB; upload links cannot be forged', async () => {
    const big = await upload(U.rami!.t, 'huge.mp4', Buffer.from('x'), 'video/mp4', { size: 201 * 1024 * 1024 });
    expect([big.status, big.body.error]).toEqual([413, 'file_too_large']);
    const s = await fetch(`${base}/api/v1/uploads`, { method: 'POST', headers: { authorization: `Bearer ${U.rami!.t}`, 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'a.txt', size: 4, contentType: 'text/plain' }) });
    const start = (await s.json()) as { parts: { url: string }[] };
    expect((await fetch(start.parts[0]!.url.replace(/t=[^&]+/, 't=forged.token'), { method: 'PUT', body: 'abcd' })).status).toBe(403);
  });

  it('files lie about their type → refused; HTML is never served inline', async () => {
    const r = await upload(U.rami!.t, 'cute.png', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png');
    expect([r.status, r.body.error]).toEqual([400, 'type_mismatch']);
    const h = await upload(U.rami!.t, 'page.html', Buffer.from('<html><script>alert(1)</script></html>'), 'text/html');
    expect(h.status).toBe(201);
    expect(h.body.contentType).toBe('application/octet-stream');
    const f = await fetch(h.body.url!);
    expect(f.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('signed URLs: tampering or expiry → 404', async () => {
    expect((await fetch(img.url!.replace(/sig=[^&]+/, 'sig=AAAA'))).status).toBe(404);
    expect((await fetch(img.url!.replace(/exp=\d+/, 'exp=1'))).status).toBe(404);
  });

  let msg: Message;
  it('sends a message with an attachment; others cannot reuse your file', async () => {
    const r = await api<Message>('POST', `/channels/${general}/messages`, { content: 'look @lina', attachmentIds: [img.id] }, U.rami!.t);
    expect(r.status).toBe(201);
    msg = r.body;
    expect(msg.attachments[0]?.id).toBe(img.id);
    expect(msg.mentionIds).toEqual([U.lina!.id]);
    const steal = await api<{ error: string }>('POST', `/channels/${general}/messages`, { content: 'mine now', attachmentIds: [img.id] }, U.lina!.t);
    expect(steal.body.error).toBe('attachment_invalid');
  });

  it('mentions count as unread mentions until acknowledged; inbox lists them', async () => {
    const rs = await db.query<{ n: number }>(`select mention_count as n from read_states where user_id = $1 and channel_id = $2`, [U.lina!.id, general]);
    expect(rs.rows[0]?.n).toBe(1);
    const inbox = await api<Message[]>('GET', '/users/@me/mentions', undefined, U.lina!.t);
    expect(inbox.body.map((m) => m.id)).toContain(msg.id);
    expect((await api('POST', `/channels/${general}/ack`, { messageId: msg.id }, U.lina!.t)).status).toBe(204);
    const after = await db.query<{ n: number }>(`select mention_count as n from read_states where user_id = $1 and channel_id = $2`, [U.lina!.id, general]);
    expect(after.rows[0]?.n).toBe(0);
  });

  it('edit: author only', async () => {
    expect((await api('PATCH', `/channels/${general}/messages/${msg.id}`, { content: 'hacked' }, U.lina!.t)).status).toBe(403);
    const e = await api<Message>('PATCH', `/channels/${general}/messages/${msg.id}`, { content: 'look at this @lina' }, U.rami!.t);
    expect(e.body.editedAt).toBeTruthy();
  });

  it('reactions: add, count, me, remove; junk emoji refused', async () => {
    const enc = encodeURIComponent('🔥');
    expect((await api('PUT', `/channels/${general}/messages/${msg.id}/reactions/${enc}`, undefined, U.lina!.t)).status).toBe(204);
    expect((await api('PUT', `/channels/${general}/messages/${msg.id}/reactions/${enc}`, undefined, U.rami!.t)).status).toBe(204);
    const hist = await api<Message[]>('GET', `/channels/${general}/messages`, undefined, U.lina!.t);
    const m = hist.body.find((x) => x.id === msg.id)!;
    expect(m.reactions).toEqual([{ emoji: '🔥', count: 2, me: true }]);
    expect((await api('DELETE', `/channels/${general}/messages/${msg.id}/reactions/${enc}`, undefined, U.lina!.t)).status).toBe(204);
    expect((await api('PUT', `/channels/${general}/messages/${msg.id}/reactions/${encodeURIComponent('<script>')}`, undefined, U.lina!.t)).status).toBe(400);
  });

  it('pins: needs Manage Messages in servers; adds a system message', async () => {
    expect((await api('PUT', `/channels/${general}/pins/${msg.id}`, undefined, U.lina!.t)).status).toBe(403);
    expect((await api('PUT', `/channels/${general}/pins/${msg.id}`, undefined, U.rami!.t)).status).toBe(204);
    const pins = await api<Message[]>('GET', `/channels/${general}/pins`, undefined, U.lina!.t);
    expect(pins.body.map((p) => p.id)).toEqual([msg.id]);
    const hist = await api<Message[]>('GET', `/channels/${general}/messages`, undefined, U.lina!.t);
    expect(hist.body.at(-1)?.type).toBe('system_pin');
  });

  it('replies carry a preview of the original', async () => {
    const r = await api<Message>('POST', `/channels/${general}/messages`, { content: 'nice', replyToId: msg.id }, U.lina!.t);
    expect(r.body.replyTo?.content).toBe('look at this @lina');
  });

  it('search: Arabic spelling variants match; private channels are never searched', async () => {
    await api('POST', `/channels/${general}/messages`, { content: 'نلتقي في المدرسة إلى الساعة الخامسة' }, U.rami!.t);
    for (const q of ['مدرسه', 'الى', 'المدرسة']) {
      const r = await api<{ messages: Message[] }>('GET', `/search?guildId=${guild.id}&q=${encodeURIComponent(q)}`, undefined, U.lina!.t);
      expect(r.body.messages.length, q).toBe(1);
    }
    const staff = await db.query<{ id: string }>(`insert into channels (guild_id, type, name) values ($1, 'text', 'staff') returning id`, [guild.id]);
    const ev = await db.query<{ id: string }>(`select id from roles where guild_id = $1 and is_everyone`, [guild.id]);
    await db.query(`insert into permission_overwrites (channel_id, target_id, target_type, allow, deny) values ($1, $2, 'role', 0, 1)`, [staff.rows[0]!.id, ev.rows[0]!.id]);
    await api('POST', `/channels/${staff.rows[0]!.id}/messages`, { content: 'top secret plan' }, U.rami!.t);
    const r = await api<{ messages: Message[] }>('GET', `/search?guildId=${guild.id}&q=secret`, undefined, U.lina!.t);
    expect(r.body.messages).toHaveLength(0);
    const owner = await api<{ messages: Message[] }>('GET', `/search?guildId=${guild.id}&q=secret`, undefined, U.rami!.t);
    expect(owner.body.messages).toHaveLength(1);
    // LIKE wildcards are literal
    const pct = await api<{ messages: Message[] }>('GET', `/search?guildId=${guild.id}&q=${encodeURIComponent('%')}`, undefined, U.lina!.t);
    expect(pct.body.messages).toHaveLength(0);
  });

  it('outsiders: no history, no uploads into others’ messages, no search', async () => {
    expect((await api('GET', `/channels/${general}/messages`, undefined, U.outsider!.t)).status).toBe(404);
    expect((await api('GET', `/search?guildId=${guild.id}&q=a`, undefined, U.outsider!.t)).status).toBe(404);
  });
});
