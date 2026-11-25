import { randomBytes } from 'node:crypto';
import { CreateGuildInput, CreateInviteInput, DEFAULT_EVERYONE, has, P, type Invite } from '@mncord/shared';
import type { App } from '../shim.ts';
import type { Db, Queryable } from '../db.ts';
import { forbidden, HttpError, notFound, parse, requireAuth } from '../http.ts';
import { channelPermissions, guildContext, guildForUser, members } from '../repo.ts';
import type { Hub } from '../gateway.ts';

// Server templates: channel names come from the client's language so an Arabic server starts in Arabic.
const TEMPLATES = {
  friends: {
    en: { text: 'Text channels', voice: 'Voice channels', channels: [['text', 'general'], ['text', 'memes'], ['voice', 'Lounge'], ['voice', 'Gaming']] },
    ar: { text: 'القنوات النصية', voice: 'القنوات الصوتية', channels: [['text', 'عام'], ['text', 'ميمز'], ['voice', 'الاستراحة'], ['voice', 'الألعاب']] },
  },
  gaming: {
    en: { text: 'Text channels', voice: 'Voice channels', channels: [['text', 'general'], ['text', 'clips'], ['text', 'looking-for-group'], ['voice', 'Squad 1'], ['voice', 'Squad 2'], ['voice', 'Stream 4K']] },
    ar: { text: 'القنوات النصية', voice: 'القنوات الصوتية', channels: [['text', 'عام'], ['text', 'مقاطع'], ['text', 'ابحث-عن-فريق'], ['voice', 'الفريق 1'], ['voice', 'الفريق 2'], ['voice', 'بث 4K']] },
  },
  community: {
    en: { text: 'Information', voice: 'Voice channels', channels: [['text', 'welcome'], ['text', 'announcements'], ['text', 'general'], ['voice', 'Hangout']] },
    ar: { text: 'معلومات', voice: 'القنوات الصوتية', channels: [['text', 'أهلاً'], ['text', 'الإعلانات'], ['text', 'عام'], ['voice', 'الجلسة']] },
  },
  blank: {
    en: { text: 'Text channels', voice: 'Voice channels', channels: [['text', 'general'], ['voice', 'General']] },
    ar: { text: 'القنوات النصية', voice: 'القنوات الصوتية', channels: [['text', 'عام'], ['voice', 'عام']] },
  },
} as const;

async function createGuild(q: Queryable, ownerId: string, name: string, template: keyof typeof TEMPLATES, locale: 'en' | 'ar') {
  const g = await q.query<{ id: string }>(`insert into guilds (name, owner_id, preferred_locale) values ($1, $2, $3) returning id`, [name, ownerId, locale]);
  const guildId = g.rows[0]!.id;
  await q.query(`insert into roles (guild_id, name, permissions, is_everyone, position) values ($1, '@everyone', $2::bigint, true, 0)`, [guildId, DEFAULT_EVERYONE.toString()]);
  await q.query(`insert into guild_members (guild_id, user_id) values ($1, $2)`, [guildId, ownerId]);
  const t = TEMPLATES[template][locale];
  const textCat = await q.query<{ id: string }>(`insert into channels (guild_id, type, name, position) values ($1, 'category', $2, 0) returning id`, [guildId, t.text]);
  const voiceCat = await q.query<{ id: string }>(`insert into channels (guild_id, type, name, position) values ($1, 'category', $2, 1) returning id`, [guildId, t.voice]);
  let pos = 0;
  let firstText: string | null = null;
  for (const [type, cname] of t.channels) {
    const parent = type === 'text' ? textCat.rows[0]!.id : voiceCat.rows[0]!.id;
    const c = await q.query<{ id: string }>(`insert into channels (guild_id, type, name, parent_id, position) values ($1, $2, $3, $4, $5) returning id`, [guildId, type, cname, parent, pos++]);
    if (type === 'text' && !firstText) firstText = c.rows[0]!.id;
  }
  await q.query(`update guilds set system_channel_id = $2 where id = $1`, [guildId, firstText]);
  return guildId;
}

export function guildRoutes(app: App, db: Db, hub: Hub) {
  app.addHook('preHandler', requireAuth);

  app.post('/guilds', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const input = parse(CreateGuildInput, req.body);
    const count = await db.query<{ n: number }>(`select count(*)::int as n from guilds where owner_id = $1`, [req.userId]);
    if ((count.rows[0]?.n ?? 0) >= 100) throw new HttpError(400, 'too_many_guilds');
    const guildId = await db.tx((q) => createGuild(q, req.userId, input.name, input.template, input.locale));
    const guild = (await guildForUser(db, guildId, req.userId))!;
    hub.addGuildMember(guildId, req.userId);
    hub.dispatchToUser(req.userId, { t: 'GUILD_CREATE', d: guild });
    return reply.status(201).send(guild);
  });

  app.get('/guilds/:id', async (req) => {
    const g = await guildForUser(db, req.params.id, req.userId);
    if (!g) throw notFound();
    return g;
  });

  app.get('/guilds/:id/members', async (req) => {
    const ctx = await guildContext(db, req.params.id, req.userId);
    if (!ctx) throw notFound();
    return (await members(db, req.params.id)).map((m) => ({ ...m, online: hub.isOnline(m.userId) }));
  });

  app.delete('/users/@me/guilds/:id', async (req, reply) => {
    const ctx = await guildContext(db, req.params.id, req.userId);
    if (!ctx) throw notFound();
    if (ctx.guild.ownerId === req.userId) throw new HttpError(400, 'owner_cannot_leave');
    await db.query(`delete from guild_members where guild_id = $1 and user_id = $2`, [req.params.id, req.userId]);
    hub.removeGuildMember(req.params.id, req.userId);
    hub.dispatchToUser(req.userId, { t: 'GUILD_DELETE', d: { id: req.params.id } });
    hub.dispatchToGuild(req.params.id, { t: 'GUILD_MEMBER_REMOVE', d: { guildId: req.params.id, userId: req.userId } });
    return reply.status(204).send();
  });

  // ── invites
  app.post('/channels/:id/invites', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const input = parse(CreateInviteInput, req.body ?? {});
    const cp = await channelPermissions(db, req.params.id, req.userId);
    if (!cp || !cp.channel.guildId) throw notFound();
    if (!has(cp.perms, P.CREATE_INVITE)) throw forbidden();
    const code = randomBytes(8).toString('base64url').replace(/[-_]/g, '').slice(0, 10).padEnd(8, 'x');
    const expires = input.maxAgeSeconds ? new Date(Date.now() + input.maxAgeSeconds * 1000) : null;
    await db.query(`insert into invites (code, guild_id, channel_id, inviter_id, max_uses, expires_at) values ($1, $2, $3, $4, $5, $6)`, [
      code, cp.channel.guildId, cp.channel.id, req.userId, input.maxUses, expires,
    ]);
    return reply.status(201).send({ code, expiresAt: expires?.toISOString() ?? null });
  });

  app.get('/invites/:code', async (req) => {
    const inv = await loadInvite(db, req.params.code);
    if (!inv) throw notFound('invite_invalid');
    return inv;
  });

  app.post('/invites/:code', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const guildId = await db.tx(async (q) => {
      // one transaction: expiry, ban, max uses (the check constraint makes the last use race-safe)
      const { rows } = await q.query<{ guildId: string; expired: boolean }>(
        `select guild_id as "guildId", (expires_at is not null and expires_at < now()) as expired from invites where code = $1 for update`,
        [req.params.code],
      );
      const inv = rows[0];
      if (!inv || inv.expired) throw new HttpError(404, 'invite_invalid');
      const banned = await q.query(`select 1 from bans where guild_id = $1 and user_id = $2`, [inv.guildId, req.userId]);
      if (banned.rows.length) throw new HttpError(403, 'banned');
      const already = await q.query(`select 1 from guild_members where guild_id = $1 and user_id = $2`, [inv.guildId, req.userId]);
      if (already.rows.length) return inv.guildId;
      const used = await q.query(`update invites set uses = uses + 1 where code = $1 and (max_uses = 0 or uses < max_uses) returning code`, [req.params.code]);
      if (!used.rows.length) throw new HttpError(404, 'invite_invalid');
      await q.query(`insert into guild_members (guild_id, user_id) values ($1, $2)`, [inv.guildId, req.userId]);
      const sys = await q.query<{ ch: string | null }>(`select system_channel_id as ch from guilds where id = $1`, [inv.guildId]);
      if (sys.rows[0]?.ch) {
        await q.query(`insert into messages (channel_id, author_id, type, content) values ($1, $2, 'system_join', '')`, [sys.rows[0].ch, req.userId]);
      }
      return inv.guildId;
    });
    const guild = (await guildForUser(db, guildId, req.userId))!;
    hub.addGuildMember(guildId, req.userId);
    hub.dispatchToUser(req.userId, { t: 'GUILD_CREATE', d: guild });
    const me = (await members(db, guildId)).find((m) => m.userId === req.userId);
    if (me) hub.dispatchToGuild(guildId, { t: 'GUILD_MEMBER_ADD', d: { ...me, guildId } });
    await hub.broadcastLatestSystemMessage(guildId);
    return guild;
  });
}

async function loadInvite(db: Queryable, code: string): Promise<Invite | null> {
  const { rows } = await db.query<{ code: string; channelId: string; expiresAt: Date | null; id: string; name: string; iconKey: string | null; n: number }>(
    `select i.code::text as code, i.channel_id as "channelId", i.expires_at as "expiresAt", g.id, g.name, g.icon_key as "iconKey",
            (select count(*)::int from guild_members m where m.guild_id = g.id) as n
       from invites i join guilds g on g.id = i.guild_id
      where i.code = $1 and (i.expires_at is null or i.expires_at > now()) and (i.max_uses = 0 or i.uses < i.max_uses)`,
    [code],
  );
  const r = rows[0];
  if (!r) return null;
  return { code: r.code, channelId: r.channelId, expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null, guild: { id: r.id, name: r.name, iconKey: r.iconKey, memberCount: r.n } };
}
