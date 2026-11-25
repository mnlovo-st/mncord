// S07 friends · S08/S09 DMs and group DMs · S17/S18 profiles · S36 DM calls
import {
  FriendRequestInput,
  GroupDmUpdateInput,
  OpenDmInput,
  RelationshipNoteInput,
  RelationshipUpdateInput,
  type FullProfile,
  type PrivateChannel,
  type Relationship,
} from '@mncord/shared';
import type { App } from '../shim.ts';
import type { Db, Queryable } from '../db.ts';
import { forbidden, HttpError, notFound, parse, requireAuth } from '../http.ts';
import { channelPermissions, isBlockedEither, privateChannel, publicUser, recipientIds, relationshipsFor } from '../repo.ts';
import type { Hub } from '../gateway.ts';

const MAX_GROUP = 10; // you + 9
const MAX_FRIENDS = 1000;

async function rel(db: Queryable, a: string, b: string) {
  const { rows } = await db.query<{ type: Relationship['type'] }>(`select type from relationships where user_id = $1 and target_id = $2`, [a, b]);
  return rows[0]?.type ?? null;
}
async function setRel(q: Queryable, a: string, b: string, type: Relationship['type']) {
  await q.query(
    `insert into relationships (user_id, target_id, type) values ($1, $2, $3)
     on conflict (user_id, target_id) do update set type = excluded.type, updated_at = now()`,
    [a, b, type],
  );
}
const delRel = (q: Queryable, a: string, b: string) => q.query(`delete from relationships where user_id = $1 and target_id = $2`, [a, b]);

/** May `from` send a friend request to `to`, given `to`'s privacy setting? */
async function canRequest(db: Queryable, from: string, to: string) {
  const { rows } = await db.query<{ policy: string }>(`select friend_request_policy as policy from user_settings where user_id = $1`, [to]);
  const policy = rows[0]?.policy ?? 'everyone';
  if (policy === 'everyone') return true;
  if (policy === 'nobody') return false;
  if (policy === 'server_members' || policy === 'friends_of_friends') {
    const shared = await db.query(
      `select 1 from guild_members a join guild_members b on a.guild_id = b.guild_id where a.user_id = $1 and b.user_id = $2 limit 1`,
      [from, to],
    );
    if (shared.rows.length) return true;
    if (policy === 'friends_of_friends') {
      const fof = await db.query(
        `select 1 from relationships a join relationships b on a.target_id = b.target_id
          where a.user_id = $1 and b.user_id = $2 and a.type = 'friend' and b.type = 'friend' limit 1`,
        [from, to],
      );
      return fof.rows.length > 0;
    }
  }
  return false;
}

export function socialRoutes(app: App, db: Db, hub: Hub) {
  app.addHook('preHandler', requireAuth);

  const pushRel = async (owner: string, target: string) => {
    const r = (await relationshipsFor(db, owner)).find((x) => x.id === target);
    hub.dispatchToUser(owner, r ? { t: 'RELATIONSHIP_ADD', d: r } : { t: 'RELATIONSHIP_REMOVE', d: { id: target } });
  };

  // ── friends
  app.get('/users/@me/relationships', async (req) => relationshipsFor(db, req.userId));

  app.post('/users/@me/relationships', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { username } = parse(FriendRequestInput, req.body);
    const { rows } = await db.query<{ id: string }>(`select id from users where username = $1::citext and disabled_at is null`, [username]);
    const target = rows[0]?.id;
    // same answer for "no such user" and "they don't accept requests": no account probing
    if (!target || target === req.userId) throw new HttpError(404, 'user_not_found', 'username');
    const mine = await rel(db, req.userId, target);
    const theirs = await rel(db, target, req.userId);
    if (mine === 'friend') throw new HttpError(409, 'already_friends', 'username');
    if (mine === 'outgoing') throw new HttpError(409, 'request_pending', 'username');
    if (mine === 'blocked' || theirs === 'blocked') throw new HttpError(404, 'user_not_found', 'username');
    if (mine === 'incoming') {
      // they already asked you → this accepts
      await db.tx(async (q) => {
        await setRel(q, req.userId, target, 'friend');
        await setRel(q, target, req.userId, 'friend');
      });
    } else {
      if (!(await canRequest(db, req.userId, target))) throw new HttpError(404, 'user_not_found', 'username');
      const n = await db.query<{ n: number }>(`select count(*)::int as n from relationships where user_id = $1 and type in ('friend','outgoing')`, [req.userId]);
      if ((n.rows[0]?.n ?? 0) >= MAX_FRIENDS) throw new HttpError(400, 'too_many_friends');
      await db.tx(async (q) => {
        await setRel(q, req.userId, target, 'outgoing');
        await setRel(q, target, req.userId, 'incoming');
      });
    }
    await pushRel(req.userId, target);
    await pushRel(target, req.userId);
    return reply.status(204).send();
  });

  // accept (type=friend, only when incoming) or block
  app.put('/users/@me/relationships/:id', async (req, reply) => {
    const { type } = parse(RelationshipUpdateInput, req.body);
    const target = req.params.id;
    if (target === req.userId || !(await publicUser(db, target))) throw notFound('user_not_found');
    if (type === 'friend') {
      if ((await rel(db, req.userId, target)) !== 'incoming') throw new HttpError(400, 'no_pending_request');
      await db.tx(async (q) => {
        await setRel(q, req.userId, target, 'friend');
        await setRel(q, target, req.userId, 'friend');
      });
    } else {
      await db.tx(async (q) => {
        await setRel(q, req.userId, target, 'blocked');
        // blocking removes the friendship / pending request on their side, but keeps their own block if any
        const theirs = await rel(q, target, req.userId);
        if (theirs && theirs !== 'blocked') await delRel(q, target, req.userId);
      });
      // and ends any ringing call between you
    }
    await pushRel(req.userId, target);
    await pushRel(target, req.userId);
    return reply.status(204).send();
  });

  // remove friend / cancel / decline / unblock
  app.delete('/users/@me/relationships/:id', async (req, reply) => {
    const target = req.params.id;
    if (!/^[0-9a-f-]{36}$/.test(target)) throw notFound();
    const mine = await rel(db, req.userId, target);
    if (!mine) throw notFound();
    await db.tx(async (q) => {
      await delRel(q, req.userId, target);
      const theirs = await rel(q, target, req.userId);
      if (mine !== 'blocked' && theirs && theirs !== 'blocked') await delRel(q, target, req.userId);
    });
    await pushRel(req.userId, target);
    await pushRel(target, req.userId);
    return reply.status(204).send();
  });

  app.patch('/users/@me/relationships/:id', async (req, reply) => {
    const input = parse(RelationshipNoteInput, req.body);
    const r = await db.query(`update relationships set nickname = coalesce($3, nickname), note = coalesce($4, note), updated_at = now() where user_id = $1 and target_id = $2 returning 1`, [
      req.userId, req.params.id, input.nickname ?? null, input.note ?? null,
    ]);
    if (!r.rows.length) throw notFound();
    await pushRel(req.userId, req.params.id);
    return reply.status(204).send();
  });

  // ── DMs
  app.get('/users/@me/channels', async (req) => {
    const { privateChannelsForUser } = await import('../repo.ts');
    return privateChannelsForUser(db, req.userId);
  });

  app.post('/users/@me/channels', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { recipientIds: ids } = parse(OpenDmInput, req.body);
    const others = [...new Set(ids)].filter((x) => x !== req.userId);
    if (!others.length) throw new HttpError(400, 'invalid_input');
    for (const o of others) {
      if (!(await publicUser(db, o))) throw notFound('user_not_found');
      if (await isBlockedEither(db, req.userId, o)) throw forbidden('blocked');
    }
    let channelId: string;
    if (others.length === 1) {
      const o = others[0]!;
      const [low, high] = req.userId < o ? [req.userId, o] : [o, req.userId];
      channelId = await db.tx(async (q) => {
        const existing = await q.query<{ id: string }>(`select channel_id as id from dm_pairs where user_low = $1 and user_high = $2`, [low, high]);
        if (existing.rows[0]) {
          await q.query(`update channel_recipients set closed = false where channel_id = $1 and user_id = $2`, [existing.rows[0].id, req.userId]);
          return existing.rows[0].id;
        }
        await assertDmAllowed(q, req.userId, o);
        const c = await q.query<{ id: string }>(`insert into channels (type) values ('dm') returning id`);
        const id = c.rows[0]!.id;
        await q.query(`insert into channel_recipients (channel_id, user_id) values ($1, $2), ($1, $3)`, [id, req.userId, o]);
        // the pk on dm_pairs makes two simultaneous "Message" clicks safe: one insert loses and retries below
        await q.query(`insert into dm_pairs (user_low, user_high, channel_id) values ($1, $2, $3)`, [low, high, id]);
        return id;
      }).catch(async (e: { code?: string }) => {
        if (e.code !== '23505') throw e;
        const again = await db.query<{ id: string }>(`select channel_id as id from dm_pairs where user_low = $1 and user_high = $2`, [low, high]);
        return again.rows[0]!.id;
      });
    } else {
      if (others.length + 1 > MAX_GROUP) throw new HttpError(400, 'group_too_large');
      // group DMs: only with friends, so nobody gets pulled into a group by strangers
      for (const o of others) if ((await rel(db, req.userId, o)) !== 'friend') throw forbidden('not_friends');
      channelId = await db.tx(async (q) => {
        const c = await q.query<{ id: string }>(`insert into channels (type, owner_id) values ('group_dm', $1) returning id`, [req.userId]);
        const id = c.rows[0]!.id;
        for (const u of [req.userId, ...others]) await q.query(`insert into channel_recipients (channel_id, user_id) values ($1, $2)`, [id, u]);
        return id;
      });
    }
    const pc = (await privateChannel(db, channelId, req.userId))!;
    for (const u of await recipientIds(db, channelId)) {
      const view = await privateChannel(db, channelId, u);
      if (view) hub.dispatchToUser(u, { t: 'PRIVATE_CHANNEL_CREATE', d: view });
    }
    return pc;
  });

  // close a DM (hide from list; a new message re-opens it) or leave a group DM
  app.delete('/users/@me/channels/:id', async (req, reply) => {
    const cp = await channelPermissions(db, req.params.id, req.userId);
    if (!cp || cp.channel.guildId) throw notFound();
    if (cp.channel.type === 'dm') {
      await db.query(`update channel_recipients set closed = true where channel_id = $1 and user_id = $2`, [req.params.id, req.userId]);
    } else {
      await db.tx(async (q) => {
        await q.query(`delete from channel_recipients where channel_id = $1 and user_id = $2`, [req.params.id, req.userId]);
        const left = await q.query<{ id: string }>(`select user_id as id from channel_recipients where channel_id = $1 order by added_at limit 1`, [req.params.id]);
        if (!left.rows[0]) await q.query(`delete from channels where id = $1`, [req.params.id]);
        else if (cp.channel.ownerId === req.userId) await q.query(`update channels set owner_id = $2 where id = $1`, [req.params.id, left.rows[0].id]);
      });
      await pushPrivate(req.params.id);
    }
    hub.dispatchToUser(req.userId, { t: 'PRIVATE_CHANNEL_DELETE', d: { id: req.params.id } });
    return reply.status(204).send();
  });

  const pushPrivate = async (channelId: string) => {
    for (const u of await recipientIds(db, channelId)) {
      const view = await privateChannel(db, channelId, u);
      if (view) hub.dispatchToUser(u, { t: 'PRIVATE_CHANNEL_UPDATE', d: view });
    }
  };

  app.patch('/channels/:id/group', async (req): Promise<PrivateChannel> => {
    const input = parse(GroupDmUpdateInput, req.body);
    const cp = await channelPermissions(db, req.params.id, req.userId);
    if (!cp || cp.channel.type !== 'group_dm') throw notFound();
    await db.query(`update channels set name = $2 where id = $1`, [req.params.id, input.name]);
    await pushPrivate(req.params.id);
    return (await privateChannel(db, req.params.id, req.userId))!;
  });

  // add a friend to a group DM (any member) / remove someone (owner only)
  app.put('/channels/:id/recipients/:uid', async (req, reply) => {
    const cp = await channelPermissions(db, req.params.id, req.userId);
    if (!cp || cp.channel.type !== 'group_dm') throw notFound();
    if ((await rel(db, req.userId, req.params.uid)) !== 'friend') throw forbidden('not_friends');
    if ((cp.recipients?.length ?? 0) >= MAX_GROUP) throw new HttpError(400, 'group_too_large');
    await db.query(`insert into channel_recipients (channel_id, user_id) values ($1, $2) on conflict do nothing`, [req.params.id, req.params.uid]);
    const view = await privateChannel(db, req.params.id, req.params.uid);
    if (view) hub.dispatchToUser(req.params.uid, { t: 'PRIVATE_CHANNEL_CREATE', d: view });
    await pushPrivate(req.params.id);
    return reply.status(204).send();
  });
  app.delete('/channels/:id/recipients/:uid', async (req, reply) => {
    const cp = await channelPermissions(db, req.params.id, req.userId);
    if (!cp || cp.channel.type !== 'group_dm') throw notFound();
    if (cp.channel.ownerId !== req.userId) throw forbidden();
    if (req.params.uid === req.userId) throw new HttpError(400, 'use_leave');
    await db.query(`delete from channel_recipients where channel_id = $1 and user_id = $2`, [req.params.id, req.params.uid]);
    hub.dispatchToUser(req.params.uid, { t: 'PRIVATE_CHANNEL_DELETE', d: { id: req.params.id } });
    await pushPrivate(req.params.id);
    return reply.status(204).send();
  });

  // ── calls (ringing). Media goes through POST /voice/:id/join like any voice channel.
  app.post('/calls/:id/ring', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const cp = await channelPermissions(db, req.params.id, req.userId);
    if (!cp || cp.channel.guildId) throw notFound();
    const recips = cp.recipients ?? [];
    const blocked = new Set<string>();
    for (const r of recips) if (r !== req.userId && (await isBlockedEither(db, req.userId, r))) blocked.add(r);
    if (cp.channel.type === 'dm' && blocked.size) throw forbidden('blocked');
    await hub.startCall(req.params.id, req.userId, recips, blocked);
    return reply.status(204).send();
  });
  app.post('/calls/:id/decline', async (req, reply) => {
    const cp = await channelPermissions(db, req.params.id, req.userId);
    if (!cp || cp.channel.guildId) throw notFound();
    await hub.stopRinging(req.params.id, [req.userId]);
    return reply.status(204).send();
  });

  // ── profiles (S17/S18)
  app.get('/users/:id/profile', async (req): Promise<FullProfile> => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound();
    const { rows } = await db.query<FullProfile & { createdAt: Date }>(
      `select u.id, u.username::text as username, u.display_name as "displayName", u.avatar_key as "avatarKey", u.status, u.flags,
              u.bio, u.pronouns, u.accent_color as "accentColor", u.banner_key as "bannerKey", u.created_at as "createdAt"
         from users u where u.id = $1 and u.disabled_at is null`,
      [req.params.id],
    );
    const u = rows[0];
    if (!u) throw notFound('user_not_found');
    if (req.params.id !== req.userId && (await rel(db, req.params.id, req.userId)) === 'blocked') throw notFound('user_not_found');
    const mutualGuilds = await db.query<{ id: string; name: string; iconKey: string | null }>(
      `select g.id, g.name, g.icon_key as "iconKey" from guilds g
         join guild_members a on a.guild_id = g.id and a.user_id = $1
         join guild_members b on b.guild_id = g.id and b.user_id = $2 order by g.name limit 50`,
      [req.userId, req.params.id],
    );
    const mutualFriends = await db.query<{ id: string; username: string; displayName: string | null; avatarKey: string | null; status: 'online' }>(
      `select u.id, u.username::text as username, u.display_name as "displayName", u.avatar_key as "avatarKey", u.status, u.flags
         from relationships a join relationships b on a.target_id = b.target_id join users u on u.id = a.target_id
        where a.user_id = $1 and b.user_id = $2 and a.type = 'friend' and b.type = 'friend' limit 50`,
      [req.userId, req.params.id],
    );
    const status = hub.presenceOf(req.params.id);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarKey: u.avatarKey,
      status: status === 'offline' ? 'invisible' : status,
      bio: u.bio,
      pronouns: u.pronouns,
      accentColor: u.accentColor,
      bannerKey: u.bannerKey ?? null,
      flags: u.flags ?? 0,
      createdAt: new Date(u.createdAt).toISOString(),
      mutualGuilds: req.params.id === req.userId ? [] : mutualGuilds.rows,
      mutualFriends: req.params.id === req.userId ? [] : mutualFriends.rows,
      relationship: await rel(db, req.userId, req.params.id),
    };
  });
}

/** Respects the target's "who can DM me" setting for brand-new 1:1 DMs. */
async function assertDmAllowed(q: Queryable, from: string, to: string) {
  const { rows } = await q.query<{ policy: string }>(`select dm_policy as policy from user_settings where user_id = $1`, [to]);
  const policy = rows[0]?.policy ?? 'server_members';
  if (policy === 'everyone') return;
  const friends = await q.query(`select 1 from relationships where user_id = $1 and target_id = $2 and type = 'friend'`, [from, to]);
  if (friends.rows.length) return;
  if (policy === 'server_members') {
    const shared = await q.query(`select 1 from guild_members a join guild_members b on a.guild_id = b.guild_id where a.user_id = $1 and b.user_id = $2 limit 1`, [from, to]);
    if (shared.rows.length) return;
  }
  throw new HttpError(403, 'dm_not_allowed');
}
