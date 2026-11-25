// S22 server settings · S23 channel settings · F08 roles · F09 moderation. Every action writes the audit log.
import {
  ALL,
  AuditQuery,
  BanInput,
  basePermissions,
  ChannelPositionsInput,
  computePermissions,
  CreateChannelInput,
  CreateEmojiInput,
  CreateRoleInput,
  DeleteGuildInput,
  has,
  OverwriteInput,
  P,
  RolePositionsInput,
  topPosition,
  UpdateChannelInput,
  UpdateGuildInput,
  UpdateMemberInput,
  UpdateRoleInput,
  type AuditEntry,
  type Ban,
  type InviteInfo,
  type Overwrite,
} from '@mncord/shared';
import type { FastifyInstance } from 'fastify';
import type { Db, Queryable } from '../db.ts';
import { forbidden, HttpError, notFound, parse, requireAuth } from '../http.ts';
import { channelOverwrites, getChannel, guildContext, guildForUser, members, type GuildContext } from '../repo.ts';
import { checkPassword } from '../auth/passwords.ts';
import { verifySecondFactor } from '../auth/mfa.ts';
import type { Hub } from '../gateway.ts';
import { applyVoicePermissions, kickFromVoice } from './voice.ts';

const MAX_ROLES = 250;
const MAX_CHANNELS = 500;
const MAX_EMOJI = 250; // free for everyone
const MAX_TIMEOUT_MS = 28 * 86400_000;

export async function audit(db: Queryable, guildId: string, actorId: string, action: string, targetId: string | null, changes: AuditEntry['changes'] = [], reason?: string | null) {
  await db.query(`insert into audit_log (guild_id, actor_id, action, target_id, changes, reason) values ($1, $2, $3, $4, $5, $6)`, [
    guildId, actorId, action, targetId, JSON.stringify(changes), reason ?? null,
  ]);
}

const diff = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter((k) => after[k] !== undefined && before[k] !== after[k]).map((k) => ({ key: k, old: before[k], new: after[k] }));

export function adminRoutes(app: FastifyInstance, db: Db, hub: Hub) {
  app.addHook('preHandler', requireAuth);

  /** Loads the actor's context and checks a guild-level permission. */
  async function actor(guildId: string, userId: string, need: bigint) {
    const ctx = await guildContext(db, guildId, userId);
    if (!ctx) throw notFound();
    const perms = basePermissions(ctx.guild, ctx.member, ctx.roles);
    if (need && !has(perms, need)) throw forbidden();
    return { ctx, perms, top: topPosition(ctx.guild, ctx.member, ctx.roles) };
  }
  /** You can't hand out permissions you don't have yourself (owner/admin excepted). */
  const assertGrantable = (actorPerms: bigint, bits: bigint) => {
    if (actorPerms === ALL || has(actorPerms, P.ADMINISTRATOR)) return;
    if ((bits & ~actorPerms) !== 0n) throw forbidden('cannot_grant');
  };
  async function targetTop(guildId: string, userId: string) {
    const ctx = await guildContext(db, guildId, userId);
    if (!ctx) throw notFound('member_not_found');
    return { ctx, top: topPosition(ctx.guild, ctx.member, ctx.roles) };
  }
  /** Everyone online in the guild gets a freshly computed copy (permissions may have changed). */
  async function resync(guildId: string) {
    for (const u of hub.onlineMembers(guildId)) {
      const g = await guildForUser(db, guildId, u);
      if (g) hub.dispatchToUser(u, { t: 'GUILD_CREATE', d: g });
    }
  }

  // ── guild settings
  app.patch<{ Params: { id: string } }>('/guilds/:id', async (req) => {
    const input = parse(UpdateGuildInput, req.body);
    const { ctx } = await actor(req.params.id, req.userId, P.MANAGE_GUILD);
    const before = (await db.query<Record<string, unknown>>(
      `select name, description, icon_key as "iconFileId", system_channel_id as "systemChannelId", verification_level as "verificationLevel", default_notifications as "defaultNotifications", preferred_locale as "preferredLocale" from guilds where id = $1`,
      [ctx.guild.id],
    )).rows[0]!;
    if (input.iconFileId) {
      const f = await db.query(`update files set attached = true where id = $1 and owner_id = $2 and content_type like 'image/%' and size_bytes <= 10485760 returning id`, [input.iconFileId, req.userId]);
      if (!f.rows.length) throw new HttpError(400, 'attachment_invalid');
    }
    if (input.systemChannelId) {
      const c = await getChannel(db, input.systemChannelId);
      if (c?.guildId !== ctx.guild.id) throw new HttpError(400, 'invalid_input');
    }
    const cols = { name: 'name', description: 'description', iconFileId: 'icon_key', systemChannelId: 'system_channel_id', verificationLevel: 'verification_level', defaultNotifications: 'default_notifications', preferredLocale: 'preferred_locale' } as const;
    const sets: string[] = [];
    const vals: unknown[] = [ctx.guild.id];
    for (const [k, c] of Object.entries(cols)) {
      const v = input[k as keyof typeof input];
      if (v !== undefined) {
        vals.push(v);
        sets.push(`${c} = $${vals.length}`);
      }
    }
    if (sets.length) await db.query(`update guilds set ${sets.join(', ')} where id = $1`, vals);
    await audit(db, ctx.guild.id, req.userId, 'guild_update', ctx.guild.id, diff(before, input));
    await resync(ctx.guild.id);
    return guildForUser(db, ctx.guild.id, req.userId);
  });

  app.delete<{ Params: { id: string } }>('/guilds/:id', async (req, reply) => {
    const input = parse(DeleteGuildInput, req.body);
    const { ctx } = await actor(req.params.id, req.userId, 0n);
    if (ctx.guild.ownerId !== req.userId) throw forbidden('owner_only');
    await checkPassword(db, req.userId, input.password);
    const mfa = (await db.query<{ on: boolean }>(`select two_factor_enabled as on from users where id = $1`, [req.userId])).rows[0]?.on;
    if (mfa && !(input.code && (await db.tx((q) => verifySecondFactor(q, req.userId, input.code!))))) throw new HttpError(403, 'mfa_required', 'code');
    const online = hub.onlineMembers(ctx.guild.id);
    await db.query(`delete from guilds where id = $1`, [ctx.guild.id]);
    for (const u of online) {
      hub.removeGuildMember(ctx.guild.id, u);
      hub.dispatchToUser(u, { t: 'GUILD_DELETE', d: { id: ctx.guild.id } });
    }
    return reply.status(204).send();
  });

  // ── roles
  app.post<{ Params: { id: string } }>('/guilds/:id/roles', async (req, reply) => {
    const input = parse(CreateRoleInput, req.body ?? {});
    const { ctx, perms, top } = await actor(req.params.id, req.userId, P.MANAGE_ROLES);
    const bits = input.permissions ? BigInt(input.permissions) : 0n;
    assertGrantable(perms, bits);
    const n = await db.query<{ n: number; max: number }>(`select count(*)::int as n, coalesce(max(position), 0)::int as max from roles where guild_id = $1`, [ctx.guild.id]);
    if ((n.rows[0]?.n ?? 0) >= MAX_ROLES) throw new HttpError(400, 'too_many_roles');
    // new roles go just under your own top role (or on top for the owner)
    const pos = Number.isFinite(top) ? Math.max(1, top) : (n.rows[0]?.max ?? 0) + 1;
    if (Number.isFinite(top)) await db.query(`update roles set position = position + 1 where guild_id = $1 and position >= $2 and not is_everyone`, [ctx.guild.id, pos]);
    const r = await db.query<{ id: string }>(
      `insert into roles (guild_id, name, color, permissions, hoist, mentionable, position) values ($1, $2, $3, $4::bigint, $5, $6, $7) returning id`,
      [ctx.guild.id, input.name, input.color, bits.toString(), input.hoist, input.mentionable, pos],
    );
    await audit(db, ctx.guild.id, req.userId, 'role_create', r.rows[0]!.id, [{ key: 'name', new: input.name }]);
    await resync(ctx.guild.id);
    return reply.status(201).send({ id: r.rows[0]!.id });
  });

  async function editableRole(guildId: string, roleId: string, actorTop: number) {
    const { rows } = await db.query<{ id: string; position: number; isEveryone: boolean; name: string; color: number; permissions: string; hoist: boolean; mentionable: boolean }>(
      `select id, position, is_everyone as "isEveryone", name, color, permissions::text as permissions, hoist, mentionable from roles where id = $1 and guild_id = $2`,
      [roleId, guildId],
    );
    const role = rows[0];
    if (!role) throw notFound('role_not_found');
    if (!role.isEveryone && role.position >= actorTop) throw forbidden('role_hierarchy');
    return role;
  }

  app.patch<{ Params: { id: string; rid: string } }>('/guilds/:id/roles/:rid', async (req) => {
    const input = parse(UpdateRoleInput, req.body);
    const { ctx, perms, top } = await actor(req.params.id, req.userId, P.MANAGE_ROLES);
    const role = await editableRole(ctx.guild.id, req.params.rid, top);
    if (role.isEveryone && input.name !== undefined) throw new HttpError(400, 'cannot_rename_everyone');
    if (input.permissions !== undefined) {
      const next = BigInt(input.permissions);
      // only the bits you change need to be ones you hold
      assertGrantable(perms, next ^ BigInt(role.permissions));
    }
    const cols = { name: 'name', color: 'color', permissions: 'permissions', hoist: 'hoist', mentionable: 'mentionable' } as const;
    const sets: string[] = [];
    const vals: unknown[] = [role.id];
    for (const [k, c] of Object.entries(cols)) {
      const v = input[k as keyof typeof input];
      if (v !== undefined) {
        vals.push(v);
        sets.push(`${c} = $${vals.length}${k === 'permissions' ? '::bigint' : ''}`);
      }
    }
    if (sets.length) await db.query(`update roles set ${sets.join(', ')} where id = $1`, vals);
    await audit(db, ctx.guild.id, req.userId, 'role_update', role.id, diff(role as unknown as Record<string, unknown>, input));
    await resync(ctx.guild.id);
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>('/guilds/:id/roles', async (req) => {
    const list = parse(RolePositionsInput, req.body);
    const { ctx, top } = await actor(req.params.id, req.userId, P.MANAGE_ROLES);
    await db.tx(async (q) => {
      for (const r of list) {
        const cur = await q.query<{ position: number; isEveryone: boolean }>(`select position, is_everyone as "isEveryone" from roles where id = $1 and guild_id = $2`, [r.id, ctx.guild.id]);
        const c = cur.rows[0];
        if (!c || c.isEveryone) throw new HttpError(400, 'invalid_input');
        // you can only move roles below you, and only to places below you
        if (c.position >= top || r.position >= top) throw forbidden('role_hierarchy');
        await q.query(`update roles set position = $2 where id = $1`, [r.id, r.position]);
      }
    });
    await audit(db, ctx.guild.id, req.userId, 'role_reorder', null, list.map((r) => ({ key: r.id, new: r.position })));
    await resync(ctx.guild.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string; rid: string } }>('/guilds/:id/roles/:rid', async (req, reply) => {
    const { ctx, top } = await actor(req.params.id, req.userId, P.MANAGE_ROLES);
    const role = await editableRole(ctx.guild.id, req.params.rid, top);
    if (role.isEveryone) throw new HttpError(400, 'cannot_delete_everyone');
    await db.query(`delete from roles where id = $1`, [role.id]);
    await audit(db, ctx.guild.id, req.userId, 'role_delete', role.id, [{ key: 'name', old: role.name }]);
    await resync(ctx.guild.id);
    return reply.status(204).send();
  });

  // ── members: nick, roles, timeout, server mute/deafen
  app.patch<{ Params: { id: string; uid: string } }>('/guilds/:id/members/:uid', async (req) => {
    const input = parse(UpdateMemberInput, req.body);
    const self = req.params.uid === req.userId || req.params.uid === '@me';
    const uid = self ? req.userId : req.params.uid;
    const { ctx, perms, top } = await actor(req.params.id, req.userId, 0n);
    const target = await targetTop(ctx.guild.id, uid);
    const outranks = top > target.top; // owner = Infinity
    const changes: AuditEntry['changes'] = [];

    await db.tx(async (q) => {
      if (input.nick !== undefined) {
        if (self ? !has(perms, P.CHANGE_NICKNAME) : !(has(perms, P.MANAGE_NICKNAMES) && outranks)) throw forbidden();
        await q.query(`update guild_members set nick = $3 where guild_id = $1 and user_id = $2`, [ctx.guild.id, uid, input.nick || null]);
        changes.push({ key: 'nick', new: input.nick });
      }
      if (input.roleIds !== undefined) {
        if (!has(perms, P.MANAGE_ROLES)) throw forbidden();
        if (!self && !outranks) throw forbidden('role_hierarchy');
        const roles = (await q.query<{ id: string; position: number; isEveryone: boolean }>(`select id, position, is_everyone as "isEveryone" from roles where guild_id = $1`, [ctx.guild.id])).rows;
        const byId = new Map(roles.map((r) => [r.id, r]));
        const current = new Set(target.ctx.member.roleIds);
        const next = new Set(input.roleIds);
        for (const id of new Set([...current, ...next])) {
          if (current.has(id) === next.has(id)) continue;
          const r = byId.get(id);
          if (!r || r.isEveryone) throw new HttpError(400, 'role_not_found');
          if (r.position >= top) throw forbidden('role_hierarchy'); // can't add/remove roles at or above your own
        }
        await q.query(`delete from member_roles where guild_id = $1 and user_id = $2`, [ctx.guild.id, uid]);
        for (const id of next) await q.query(`insert into member_roles (guild_id, user_id, role_id) values ($1, $2, $3)`, [ctx.guild.id, uid, id]);
        changes.push({ key: 'roles', old: [...current], new: [...next] });
      }
      if (input.timeoutUntil !== undefined) {
        if (self || !has(perms, P.TIMEOUT_MEMBERS) || !outranks || uid === ctx.guild.ownerId) throw forbidden();
        const until = input.timeoutUntil ? new Date(input.timeoutUntil) : null;
        if (until && (until.getTime() - Date.now() > MAX_TIMEOUT_MS || until.getTime() < Date.now())) throw new HttpError(400, 'timeout_range');
        await q.query(`update guild_members set timeout_until = $3 where guild_id = $1 and user_id = $2`, [ctx.guild.id, uid, until]);
        changes.push({ key: 'timeout_until', new: until?.toISOString() ?? null });
      }
      for (const [k, flag, col] of [['serverMute', P.MUTE_MEMBERS, 'server_mute'], ['serverDeaf', P.DEAFEN_MEMBERS, 'server_deaf']] as const) {
        const v = input[k];
        if (v === undefined) continue;
        if (!has(perms, flag) || (!self && !outranks)) throw forbidden();
        await q.query(`update guild_members set ${col} = $3 where guild_id = $1 and user_id = $2`, [ctx.guild.id, uid, v]);
        changes.push({ key: col, new: v });
      }
    });
    await audit(db, ctx.guild.id, req.userId, 'member_update', uid, changes, input.reason);
    // if they're in a voice channel of this server right now, apply mute/deafen/role changes live
    const inVoice = hub.voiceChannelOf(uid);
    if (inVoice?.guildId === ctx.guild.id) {
      const ow = (await channelOverwrites(db, [inVoice.channelId])).get(inVoice.channelId) ?? [];
      const fresh = await guildContext(db, ctx.guild.id, uid);
      const mod = (await db.query<{ mute: boolean; deaf: boolean }>(`select server_mute as mute, server_deaf as deaf from guild_members where guild_id = $1 and user_id = $2`, [ctx.guild.id, uid])).rows[0];
      if (fresh) {
        const p = computePermissions(fresh.guild, fresh.member, fresh.roles, ow);
        if (!has(p, P.CONNECT)) await kickFromVoice(inVoice.channelId, uid);
        else await applyVoicePermissions(inVoice.channelId, uid, { speak: has(p, P.SPEAK) && !mod?.mute, stream: has(p, P.STREAM), deaf: !!mod?.deaf });
      }
    }
    const m = (await members(db, ctx.guild.id)).find((x) => x.userId === uid);
    if (m) hub.dispatchToGuild(ctx.guild.id, { t: 'GUILD_MEMBER_UPDATE', d: { ...m, guildId: ctx.guild.id } });
    // their own view of the guild (permissions) changed
    const g = await guildForUser(db, ctx.guild.id, uid);
    if (g) hub.dispatchToUser(uid, { t: 'GUILD_CREATE', d: g });
    return m;
  });

  async function removeMember(guildId: string, uid: string) {
    const inVoice = hub.voiceChannelOf(uid);
    if (inVoice?.guildId === guildId) await kickFromVoice(inVoice.channelId, uid);
    await db.query(`delete from guild_members where guild_id = $1 and user_id = $2`, [guildId, uid]);
    hub.removeGuildMember(guildId, uid);
    hub.dispatchToUser(uid, { t: 'GUILD_DELETE', d: { id: guildId } });
    hub.dispatchToGuild(guildId, { t: 'GUILD_MEMBER_REMOVE', d: { guildId, userId: uid } });
  }

  async function assertCanModerate(ctx: GuildContext, top: number, uid: string, actorId: string) {
    if (uid === actorId) throw new HttpError(400, 'cannot_moderate_self');
    if (uid === ctx.guild.ownerId) throw forbidden('role_hierarchy');
    const target = await guildContext(db, ctx.guild.id, uid);
    if (target && top <= topPosition(target.guild, target.member, target.roles)) throw forbidden('role_hierarchy');
    return target;
  }

  app.delete<{ Params: { id: string; uid: string }; Querystring: { reason?: string } }>('/guilds/:id/members/:uid', async (req, reply) => {
    const { ctx, top } = await actor(req.params.id, req.userId, P.KICK_MEMBERS);
    const target = await assertCanModerate(ctx, top, req.params.uid, req.userId);
    if (!target) throw notFound('member_not_found');
    await removeMember(ctx.guild.id, req.params.uid);
    await audit(db, ctx.guild.id, req.userId, 'member_kick', req.params.uid, [], req.query.reason?.slice(0, 512));
    return reply.status(204).send();
  });

  // ── bans
  app.get<{ Params: { id: string } }>('/guilds/:id/bans', async (req): Promise<Ban[]> => {
    const { ctx } = await actor(req.params.id, req.userId, P.BAN_MEMBERS);
    const { rows } = await db.query<{ id: string; username: string; displayName: string | null; avatarKey: string | null; status: 'online'; reason: string | null; createdAt: Date }>(
      `select u.id, u.username::text as username, u.display_name as "displayName", u.avatar_key as "avatarKey", u.status, b.reason, b.created_at as "createdAt"
         from bans b join users u on u.id = b.user_id where b.guild_id = $1 order by b.created_at desc limit 1000`,
      [ctx.guild.id],
    );
    return rows.map((r) => ({ user: { id: r.id, username: r.username, displayName: r.displayName, avatarKey: r.avatarKey, status: r.status }, reason: r.reason, createdAt: new Date(r.createdAt).toISOString() }));
  });

  app.put<{ Params: { id: string; uid: string } }>('/guilds/:id/bans/:uid', async (req, reply) => {
    const input = parse(BanInput, req.body ?? {});
    const { ctx, top } = await actor(req.params.id, req.userId, P.BAN_MEMBERS);
    const target = await assertCanModerate(ctx, top, req.params.uid, req.userId);
    const exists = await db.query(`select 1 from users where id = $1`, [req.params.uid]);
    if (!exists.rows.length) throw notFound('user_not_found');
    await db.query(`insert into bans (guild_id, user_id, reason, banned_by) values ($1, $2, $3, $4) on conflict (guild_id, user_id) do update set reason = excluded.reason`, [
      ctx.guild.id, req.params.uid, input.reason ?? null, req.userId,
    ]);
    if (input.deleteMessageSeconds > 0) {
      await db.query(
        `delete from messages where author_id = $1 and created_at > now() - make_interval(secs => $3) and channel_id in (select id from channels where guild_id = $2)`,
        [req.params.uid, ctx.guild.id, input.deleteMessageSeconds],
      );
    }
    if (target) await removeMember(ctx.guild.id, req.params.uid);
    await audit(db, ctx.guild.id, req.userId, 'member_ban', req.params.uid, input.deleteMessageSeconds ? [{ key: 'delete_seconds', new: input.deleteMessageSeconds }] : [], input.reason);
    return reply.status(204).send();
  });

  app.delete<{ Params: { id: string; uid: string } }>('/guilds/:id/bans/:uid', async (req, reply) => {
    const { ctx } = await actor(req.params.id, req.userId, P.BAN_MEMBERS);
    const r = await db.query(`delete from bans where guild_id = $1 and user_id = $2 returning 1`, [ctx.guild.id, req.params.uid]);
    if (!r.rows.length) throw notFound();
    await audit(db, ctx.guild.id, req.userId, 'member_unban', req.params.uid);
    return reply.status(204).send();
  });

  // ── invites
  app.get<{ Params: { id: string } }>('/guilds/:id/invites', async (req): Promise<InviteInfo[]> => {
    const { ctx } = await actor(req.params.id, req.userId, P.MANAGE_GUILD);
    const { rows } = await db.query<{ code: string; channelId: string; uses: number; maxUses: number; expiresAt: Date | null; createdAt: Date; uid: string | null; username: string | null; displayName: string | null }>(
      `select i.code::text as code, i.channel_id as "channelId", i.uses, i.max_uses as "maxUses", i.expires_at as "expiresAt", i.created_at as "createdAt",
              u.id as uid, u.username::text as username, u.display_name as "displayName"
         from invites i left join users u on u.id = i.inviter_id
        where i.guild_id = $1 and (i.expires_at is null or i.expires_at > now()) order by i.created_at desc`,
      [ctx.guild.id],
    );
    return rows.map((r) => ({
      code: r.code, channelId: r.channelId, uses: r.uses, maxUses: r.maxUses, expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null, createdAt: new Date(r.createdAt).toISOString(),
      inviter: r.uid ? { id: r.uid, username: r.username!, displayName: r.displayName, avatarKey: null, status: 'online' } : null,
    }));
  });

  app.delete<{ Params: { code: string } }>('/invites/:code', async (req, reply) => {
    const { rows } = await db.query<{ guildId: string; inviterId: string | null }>(`select guild_id as "guildId", inviter_id as "inviterId" from invites where code = $1`, [req.params.code]);
    const inv = rows[0];
    if (!inv) throw notFound();
    if (inv.inviterId !== req.userId) await actor(inv.guildId, req.userId, P.MANAGE_GUILD);
    await db.query(`delete from invites where code = $1`, [req.params.code]);
    await audit(db, inv.guildId, req.userId, 'invite_delete', null, [{ key: 'code', old: req.params.code }]);
    return reply.status(204).send();
  });

  // ── channels
  app.post<{ Params: { id: string } }>('/guilds/:id/channels', async (req, reply) => {
    const input = parse(CreateChannelInput, req.body);
    const { ctx } = await actor(req.params.id, req.userId, P.MANAGE_CHANNELS);
    const n = await db.query<{ n: number; max: number }>(`select count(*)::int as n, coalesce(max(position), 0)::int as max from channels where guild_id = $1`, [ctx.guild.id]);
    if ((n.rows[0]?.n ?? 0) >= MAX_CHANNELS) throw new HttpError(400, 'too_many_channels');
    let parentId: string | null = input.type === 'category' ? null : (input.parentId ?? null);
    if (parentId) {
      const p = await getChannel(db, parentId);
      if (p?.guildId !== ctx.guild.id || p.type !== 'category') throw new HttpError(400, 'invalid_parent');
    }
    const name = input.type === 'text' || input.type === 'announcement' ? input.name.toLowerCase().replace(/\s+/g, '-').slice(0, 100) : input.name;
    const id = await db.tx(async (q) => {
      const c = await q.query<{ id: string }>(`insert into channels (guild_id, type, name, topic, parent_id, position) values ($1, $2, $3, $4, $5, $6) returning id`, [
        ctx.guild.id, input.type, name, input.topic ?? null, parentId, (n.rows[0]?.max ?? 0) + 1,
      ]);
      const cid = c.rows[0]!.id;
      if (parentId) {
        // new channels start synced with their category's permissions
        await q.query(`insert into permission_overwrites (channel_id, target_id, target_type, allow, deny) select $1, target_id, target_type, allow, deny from permission_overwrites where channel_id = $2`, [cid, parentId]);
      }
      if (input.private) {
        const ev = ctx.roles.find((r) => r.isEveryone)!;
        await q.query(
          `insert into permission_overwrites (channel_id, target_id, target_type, allow, deny) values ($1, $2, 'role', 0, $3::bigint)
           on conflict (channel_id, target_id) do update set deny = permission_overwrites.deny | excluded.deny, allow = permission_overwrites.allow & ~excluded.deny`,
          [cid, ev.id, P.VIEW_CHANNEL.toString()],
        );
        // the creator keeps access
        await q.query(`insert into permission_overwrites (channel_id, target_id, target_type, allow, deny) values ($1, $2, 'member', $3::bigint, 0) on conflict do nothing`, [cid, req.userId, P.VIEW_CHANNEL.toString()]);
      }
      return cid;
    });
    parentId = null;
    await audit(db, ctx.guild.id, req.userId, 'channel_create', id, [{ key: 'name', new: name }, { key: 'type', new: input.type }]);
    await resync(ctx.guild.id);
    return reply.status(201).send(await getChannel(db, id));
  });

  async function channelActor(channelId: string, userId: string) {
    const ch = await getChannel(db, channelId);
    if (!ch?.guildId) throw notFound();
    const ctx = await guildContext(db, ch.guildId, userId);
    if (!ctx) throw notFound();
    const ow = (await channelOverwrites(db, [ch.id])).get(ch.id) ?? [];
    const perms = computePermissions(ctx.guild, ctx.member, ctx.roles, ow);
    return { ch, ctx, perms, top: topPosition(ctx.guild, ctx.member, ctx.roles) };
  }

  app.patch<{ Params: { id: string } }>('/channels/:id', async (req) => {
    const input = parse(UpdateChannelInput, req.body);
    const { ch, ctx, perms } = await channelActor(req.params.id, req.userId);
    if (!has(perms, P.VIEW_CHANNEL | P.MANAGE_CHANNELS)) throw forbidden();
    if (input.parentId) {
      const p = await getChannel(db, input.parentId);
      if (p?.guildId !== ctx.guild.id || p.type !== 'category' || ch.type === 'category') throw new HttpError(400, 'invalid_parent');
    }
    const cols = { name: 'name', topic: 'topic', slowmodeS: 'slowmode_s', nsfw: 'nsfw', bitrate: 'bitrate', userLimit: 'user_limit', parentId: 'parent_id' } as const;
    const sets: string[] = [];
    const vals: unknown[] = [ch.id];
    for (const [k, c] of Object.entries(cols)) {
      let v = input[k as keyof typeof input];
      if (v === undefined) continue;
      if (k === 'name' && (ch.type === 'text' || ch.type === 'announcement')) v = String(v).toLowerCase().replace(/\s+/g, '-');
      vals.push(v);
      sets.push(`${c} = $${vals.length}`);
    }
    if (sets.length) await db.query(`update channels set ${sets.join(', ')} where id = $1`, vals);
    await audit(db, ctx.guild.id, req.userId, 'channel_update', ch.id, diff(ch as unknown as Record<string, unknown>, input));
    await resync(ctx.guild.id);
    return getChannel(db, ch.id);
  });

  app.delete<{ Params: { id: string } }>('/channels/:id', async (req, reply) => {
    const { ch, ctx, perms } = await channelActor(req.params.id, req.userId);
    if (!has(perms, P.VIEW_CHANNEL | P.MANAGE_CHANNELS)) throw forbidden();
    const remaining = await db.query<{ n: number }>(`select count(*)::int as n from channels where guild_id = $1 and type in ('text','announcement') and id <> $2`, [ctx.guild.id, ch.id]);
    if ((ch.type === 'text' || ch.type === 'announcement') && (remaining.rows[0]?.n ?? 0) === 0) throw new HttpError(400, 'last_text_channel');
    // children of a deleted category become uncategorised (not deleted)
    await db.tx(async (q) => {
      if (ch.type === 'category') await q.query(`update channels set parent_id = null where parent_id = $1`, [ch.id]);
      await q.query(`delete from channels where id = $1`, [ch.id]);
    });
    await audit(db, ctx.guild.id, req.userId, 'channel_delete', ch.id, [{ key: 'name', old: ch.name }]);
    await resync(ctx.guild.id);
    return reply.status(204).send();
  });

  app.patch<{ Params: { id: string } }>('/guilds/:id/channels', async (req) => {
    const list = parse(ChannelPositionsInput, req.body);
    const { ctx } = await actor(req.params.id, req.userId, P.MANAGE_CHANNELS);
    await db.tx(async (q) => {
      for (const c of list) {
        const cur = await getChannel(q, c.id);
        if (cur?.guildId !== ctx.guild.id) throw new HttpError(400, 'invalid_input');
        if (c.parentId !== undefined) {
          if (c.parentId) {
            const p = await getChannel(q, c.parentId);
            if (p?.guildId !== ctx.guild.id || p.type !== 'category' || cur.type === 'category') throw new HttpError(400, 'invalid_parent');
          }
          await q.query(`update channels set position = $2, parent_id = $3 where id = $1`, [c.id, c.position, c.parentId]);
        } else await q.query(`update channels set position = $2 where id = $1`, [c.id, c.position]);
      }
    });
    await resync(ctx.guild.id);
    return { ok: true };
  });

  // ── permission overwrites
  app.get<{ Params: { id: string } }>('/channels/:id/permissions', async (req): Promise<Overwrite[]> => {
    const { perms } = await channelActor(req.params.id, req.userId);
    if (!has(perms, P.VIEW_CHANNEL | P.MANAGE_ROLES) && !has(perms, P.MANAGE_CHANNELS)) throw forbidden();
    const ow = (await channelOverwrites(db, [req.params.id])).get(req.params.id) ?? [];
    return ow.map((o) => ({ targetId: o.targetId, targetType: o.targetType, allow: o.allow.toString(), deny: o.deny.toString() }));
  });

  app.put<{ Params: { id: string; target: string } }>('/channels/:id/permissions/:target', async (req, reply) => {
    const input = parse(OverwriteInput, req.body);
    const { ch, ctx, perms } = await channelActor(req.params.id, req.userId);
    if (!has(perms, P.VIEW_CHANNEL | P.MANAGE_ROLES)) throw forbidden();
    const allow = BigInt(input.allow);
    const deny = BigInt(input.deny);
    if ((allow & deny) !== 0n) throw new HttpError(400, 'allow_deny_overlap');
    const old = ((await channelOverwrites(db, [ch.id])).get(ch.id) ?? []).find((o) => o.targetId === req.params.target);
    assertGrantable(perms, (allow ^ (old?.allow ?? 0n)) | (deny ^ (old?.deny ?? 0n)));
    if (input.type === 'role') {
      const r = await db.query(`select 1 from roles where id = $1 and guild_id = $2`, [req.params.target, ctx.guild.id]);
      if (!r.rows.length) throw notFound('role_not_found');
    } else {
      const m = await db.query(`select 1 from guild_members where user_id = $1 and guild_id = $2`, [req.params.target, ctx.guild.id]);
      if (!m.rows.length) throw notFound('member_not_found');
    }
    await db.query(
      `insert into permission_overwrites (channel_id, target_id, target_type, allow, deny) values ($1, $2, $3, $4::bigint, $5::bigint)
       on conflict (channel_id, target_id) do update set allow = excluded.allow, deny = excluded.deny, target_type = excluded.target_type`,
      [ch.id, req.params.target, input.type, allow.toString(), deny.toString()],
    );
    await audit(db, ctx.guild.id, req.userId, 'overwrite_update', ch.id, [{ key: req.params.target, old: old ? { allow: old.allow.toString(), deny: old.deny.toString() } : null, new: { allow: input.allow, deny: input.deny } }]);
    await resync(ctx.guild.id);
    return reply.status(204).send();
  });

  app.delete<{ Params: { id: string; target: string } }>('/channels/:id/permissions/:target', async (req, reply) => {
    const { ch, ctx, perms } = await channelActor(req.params.id, req.userId);
    if (!has(perms, P.VIEW_CHANNEL | P.MANAGE_ROLES)) throw forbidden();
    await db.query(`delete from permission_overwrites where channel_id = $1 and target_id = $2`, [ch.id, req.params.target]);
    await audit(db, ctx.guild.id, req.userId, 'overwrite_delete', ch.id, [{ key: req.params.target }]);
    await resync(ctx.guild.id);
    return reply.status(204).send();
  });

  // ── emoji (no Nitro gate: everyone can use any server's emoji)
  app.post<{ Params: { id: string } }>('/guilds/:id/emojis', async (req, reply) => {
    const input = parse(CreateEmojiInput, req.body);
    const { ctx } = await actor(req.params.id, req.userId, P.MANAGE_EXPRESSIONS);
    const n = await db.query<{ n: number }>(`select count(*)::int as n from emojis where guild_id = $1`, [ctx.guild.id]);
    if ((n.rows[0]?.n ?? 0) >= MAX_EMOJI) throw new HttpError(400, 'too_many_emoji');
    const f = await db.query<{ contentType: string }>(
      `update files set attached = true where id = $1 and owner_id = $2 and content_type in ('image/png','image/gif','image/webp','image/jpeg') and size_bytes <= 524288 returning content_type as "contentType"`,
      [input.fileId, req.userId],
    );
    if (!f.rows[0]) throw new HttpError(400, 'emoji_file_invalid');
    const r = await db.query<{ id: string }>(`insert into emojis (guild_id, name, file_id, animated, creator_id) values ($1, $2, $3, $4, $5) returning id`, [
      ctx.guild.id, input.name, input.fileId, f.rows[0].contentType === 'image/gif', req.userId,
    ]);
    await audit(db, ctx.guild.id, req.userId, 'emoji_create', r.rows[0]!.id, [{ key: 'name', new: input.name }]);
    await resync(ctx.guild.id);
    return reply.status(201).send({ id: r.rows[0]!.id });
  });

  app.delete<{ Params: { id: string; eid: string } }>('/guilds/:id/emojis/:eid', async (req, reply) => {
    const { ctx } = await actor(req.params.id, req.userId, P.MANAGE_EXPRESSIONS);
    const r = await db.query<{ name: string }>(`delete from emojis where id = $1 and guild_id = $2 returning name`, [req.params.eid, ctx.guild.id]);
    if (!r.rows[0]) throw notFound();
    await audit(db, ctx.guild.id, req.userId, 'emoji_delete', req.params.eid, [{ key: 'name', old: r.rows[0].name }]);
    await resync(ctx.guild.id);
    return reply.status(204).send();
  });

  // ── audit log
  app.get<{ Params: { id: string } }>('/guilds/:id/audit-log', async (req): Promise<AuditEntry[]> => {
    const q = parse(AuditQuery, req.query);
    const { ctx } = await actor(req.params.id, req.userId, P.VIEW_AUDIT_LOG);
    const params: unknown[] = [ctx.guild.id, q.limit];
    const where = ['a.guild_id = $1'];
    if (q.before) {
      params.push(q.before);
      where.push(`a.id < $${params.length}`);
    }
    if (q.actorId) {
      params.push(q.actorId);
      where.push(`a.actor_id = $${params.length}`);
    }
    if (q.action) {
      params.push(q.action);
      where.push(`a.action = $${params.length}`);
    }
    const { rows } = await db.query<{ id: string; action: string; targetId: string | null; changes: AuditEntry['changes']; reason: string | null; createdAt: Date; uid: string | null; username: string | null; displayName: string | null }>(
      `select a.id, a.action, a.target_id as "targetId", a.changes, a.reason, a.created_at as "createdAt", u.id as uid, u.username::text as username, u.display_name as "displayName"
         from audit_log a left join users u on u.id = a.actor_id where ${where.join(' and ')} order by a.id desc limit $2`,
      params,
    );
    return rows.map((r) => ({
      id: r.id, action: r.action, targetId: r.targetId, changes: typeof r.changes === 'string' ? JSON.parse(r.changes) : r.changes, reason: r.reason, createdAt: new Date(r.createdAt).toISOString(),
      actor: r.uid ? { id: r.uid, username: r.username!, displayName: r.displayName, avatarKey: null, status: 'online' } : null,
    }));
  });
}
