// S10 messaging: history, send (attachments, mentions, replies), edit, delete, reactions, pins, read states, search.
import { AckInput, CreateMessageInput, EditMessageInput, emojiKey, has, MessagesQuery, P, SearchQuery, type Channel, type Message } from '@mncord/shared';
import type { App } from '../shim.ts';
import type { Db, Queryable } from '../db.ts';
import { forbidden, HttpError, notFound, parse, requireAuth } from '../http.ts';
import { channelOverwrites, channelPermissions, guildContext, hydrate, MESSAGE_SELECT, recipientIds, type MessageRow } from '../repo.ts';
import { computePermissions } from '@mncord/shared';
import type { Hub } from '../gateway.ts';

const MAX_PINS = 250;
const MAX_REACTIONS_PER_MESSAGE = 20; // distinct emoji

/** Users an @username mention may target: members who can see the channel (guild) or its recipients (DM). */
async function resolveMentions(db: Queryable, channel: Channel, content: string, authorId: string): Promise<string[]> {
  const names = [...new Set([...content.matchAll(/(?:^|[^\w@])@([a-z0-9_.]{2,32})\b/gi)].map((m) => m[1]!.toLowerCase()))].slice(0, 50);
  if (!names.length) return [];
  const { rows } = channel.guildId
    ? await db.query<{ id: string }>(
        `select u.id from users u join guild_members gm on gm.user_id = u.id and gm.guild_id = $1 where lower(u.username::text) = any($2::text[])`,
        [channel.guildId, names],
      )
    : await db.query<{ id: string }>(
        `select u.id from users u join channel_recipients cr on cr.user_id = u.id and cr.channel_id = $1 where lower(u.username::text) = any($2::text[])`,
        [channel.id, names],
      );
  return rows.map((r) => r.id).filter((id) => id !== authorId);
}

async function oneMessage(db: Queryable, id: string, viewer: string | null) {
  const { rows } = await db.query<MessageRow>(`${MESSAGE_SELECT} where m.id = $1`, [id]);
  return rows[0] ? (await hydrate(db, rows, viewer))[0]! : null;
}

export function messageRoutes(app: App, db: Db, hub: Hub) {
  app.addHook('preHandler', requireAuth);

  const access = async (channelId: string, userId: string, need: bigint) => {
    const cp = await channelPermissions(db, channelId, userId);
    if (!cp) throw notFound();
    if (!has(cp.perms, need)) throw forbidden();
    return cp;
  };

  app.get('/channels/:id/messages', async (req) => {
    const q = parse(MessagesQuery, req.query);
    const hcp = await access(req.params.id, req.userId, P.VIEW_CHANNEL | P.READ_HISTORY);
    if (hcp.channel.nsfw) {
      const dob = await db.query<{ adult: boolean }>(`select date_of_birth <= date('now', '-18 years') as adult from users where id = $1`, [req.userId]);
      if (!dob.rows[0]?.adult) throw forbidden('age_restricted');
    }
    const params: unknown[] = [req.params.id, q.limit];
    let where = 'm.channel_id = $1';
    if (q.before) {
      params.push(q.before);
      where += ` and m.id < $${params.length}`;
    }
    if (q.after) {
      params.push(q.after);
      where += ` and m.id > $${params.length}`;
    }
    const order = q.after && !q.before ? 'asc' : 'desc';
    const { rows } = await db.query<MessageRow>(`${MESSAGE_SELECT} where ${where} order by m.id ${order} limit $2`, params);
    const list = await hydrate(db, rows, req.userId);
    return order === 'desc' ? list.reverse() : list; // always oldest → newest
  });

  app.post('/channels/:id/messages', { config: { rateLimit: { max: 10, timeWindow: '5 seconds' } } }, async (req, reply) => {
    const input = parse(CreateMessageInput, req.body);
    const cp = await access(req.params.id, req.userId, P.VIEW_CHANNEL | P.SEND_MESSAGES);
    if (!['text', 'announcement', 'dm', 'group_dm'].includes(cp.channel.type)) throw new HttpError(400, 'not_text_channel');
    if (input.attachmentIds.length && !has(cp.perms, P.ATTACH_FILES)) throw forbidden();
    if (cp.channel.nsfw) {
      const dob = await db.query<{ adult: boolean }>(`select date_of_birth <= date('now', '-18 years') as adult from users where id = $1`, [req.userId]);
      if (!dob.rows[0]?.adult) throw forbidden('age_restricted');
    }
    // slowmode: one message per N seconds, unless you can manage the channel or its messages
    const slow = cp.channel.slowmodeS ?? 0;
    if (slow > 0 && !has(cp.perms, P.MANAGE_MESSAGES) && !has(cp.perms, P.MANAGE_CHANNELS)) {
      const last = await db.query<{ at: string | null }>(
        `select max(created_at) as at from messages where channel_id = $1 and author_id = $2 and type in ('default','reply') and created_at > $3`,
        [req.params.id, req.userId, new Date(Date.now() - slow * 1000)],
      );
      const at = last.rows[0]?.at;
      const wait = at ? Math.max(0, Math.ceil((new Date(at).getTime() + slow * 1000 - Date.now()) / 1000)) : 0;
      if (wait > 0) throw new HttpError(429, 'slowmode', String(wait));
    }

    if (input.nonce) {
      const dup = await db.query<{ id: string }>(`select id from messages where channel_id = $1 and author_id = $2 and nonce = $3`, [req.params.id, req.userId, input.nonce]);
      if (dup.rows[0]) return reply.status(200).send(await oneMessage(db, dup.rows[0].id, req.userId));
    }
    if (input.replyToId) {
      const r = await db.query(`select 1 from messages where id = $1 and channel_id = $2`, [input.replyToId, req.params.id]);
      if (!r.rows.length) throw new HttpError(400, 'reply_not_found');
    }
    const mentionsEveryone = /(^|\s)@(everyone|here)\b/.test(input.content) && (cp.channel.guildId ? has(cp.perms, P.MENTION_EVERYONE) : false);
    const mentioned = await resolveMentions(db, cp.channel, input.content, req.userId);
    const mentionRoles: string[] = [];
    if (cp.channel.guildId && input.content.includes('@')) {
      const roles = await db.query<{ id: string; name: string; mentionable: boolean }>(`select id, name, mentionable from roles where guild_id = $1 and not is_everyone`, [cp.channel.guildId]);
      for (const r of roles.rows) {
        if (!input.content.includes(`@${r.name}`)) continue;
        if (!r.mentionable && !has(cp.perms, P.MENTION_EVERYONE)) continue;
        mentionRoles.push(r.id);
        const holders = await db.query<{ id: string }>(`select user_id as id from member_roles where role_id = $1 and user_id <> $2 limit 1000`, [r.id, req.userId]);
        for (const h of holders.rows) if (!mentioned.includes(h.id)) mentioned.push(h.id);
      }
    }

    const id = await db.tx(async (q) => {
      // attachments must be the sender's own, freshly uploaded, unused files
      if (input.attachmentIds.length) {
        const ok = await q.query<{ id: string }>(
          `update files set attached = true where id = any($1::uuid[]) and owner_id = $2 and status = 'ready' and kind = 'attachment' and attached = false returning id`,
          [input.attachmentIds, req.userId],
        );
        if (ok.rows.length !== new Set(input.attachmentIds).size) throw new HttpError(400, 'attachment_invalid');
      }
      const ins = await q.query<{ id: string }>(
        `insert into messages (channel_id, author_id, content, nonce, reply_to_id, type, mention_everyone, mention_roles)
         values ($1, $2, $3, $4, $5, $6, $7, $8::uuid[]) returning id`,
        [req.params.id, req.userId, input.content, input.nonce ?? null, input.replyToId ?? null, input.replyToId ? 'reply' : 'default', mentionsEveryone, mentionRoles],
      );
      const mid = ins.rows[0]!.id;
      let pos = 0;
      for (const fid of input.attachmentIds) {
        await q.query(
          `insert into attachments (message_id, file_id, filename, spoiler, position) select $1, f.id, coalesce(f.original_name, 'file'), $3, $4 from files f where f.id = $2`,
          [mid, fid, input.spoilerIds.includes(fid), pos++],
        );
      }
      for (const uid of mentioned) {
        await q.query(`insert into message_mentions (message_id, user_id) values ($1, $2) on conflict do nothing`, [mid, uid]);
        await q.query(
          `insert into read_states (user_id, channel_id, mention_count) values ($1, $2, 1)
           on conflict (user_id, channel_id) do update set mention_count = read_states.mention_count + 1, updated_at = now()`,
          [uid, req.params.id],
        );
      }
      await q.query(`update channels set last_message_id = $2 where id = $1`, [req.params.id, mid]);
      // sending counts as reading
      await q.query(
        `insert into read_states (user_id, channel_id, last_read_message_id, mention_count) values ($1, $2, $3, 0)
         on conflict (user_id, channel_id) do update set last_read_message_id = excluded.last_read_message_id, mention_count = 0, updated_at = now()`,
        [req.userId, req.params.id, mid],
      );
      return mid;
    });
    const msg = (await oneMessage(db, id, null))!;
    await hub.dispatchToChannelViewers(cp.channel, { t: 'MESSAGE_CREATE', d: { ...msg, guildId: cp.channel.guildId } });
    return reply.status(201).send(msg);
  });

  app.patch('/channels/:id/messages/:mid', { config: { rateLimit: { max: 10, timeWindow: '10 seconds' } } }, async (req) => {
    const { content } = parse(EditMessageInput, req.body);
    const cp = await access(req.params.id, req.userId, P.VIEW_CHANNEL);
    const r = await db.query<{ id: string }>(
      `update messages set content = $3, edited_at = now() where id = $1 and channel_id = $2 and author_id = $4 and type in ('default','reply') returning id`,
      [req.params.mid, req.params.id, content, req.userId],
    );
    if (!r.rows.length) throw forbidden('not_author');
    const msg = (await oneMessage(db, req.params.mid, null))!;
    await hub.dispatchToChannelViewers(cp.channel, { t: 'MESSAGE_UPDATE', d: { ...msg, guildId: cp.channel.guildId } });
    return msg;
  });

  app.delete('/channels/:id/messages/:mid', async (req, reply) => {
    const cp = await access(req.params.id, req.userId, P.VIEW_CHANNEL);
    const { rows } = await db.query<{ authorId: string | null }>(`select author_id as "authorId" from messages where id = $1 and channel_id = $2`, [req.params.mid, req.params.id]);
    const m = rows[0];
    if (!m) throw notFound();
    if (m.authorId !== req.userId && !(cp.channel.guildId && has(cp.perms, P.MANAGE_MESSAGES))) throw forbidden();
    await db.query(`delete from messages where id = $1`, [req.params.mid]);
    await hub.dispatchToChannelViewers(cp.channel, { t: 'MESSAGE_DELETE', d: { id: req.params.mid, channelId: req.params.id } });
    return reply.status(204).send();
  });

  // ── reactions
  app.put('/channels/:id/messages/:mid/reactions/:emoji', { config: { rateLimit: { max: 20, timeWindow: '5 seconds' } } }, async (req, reply) => {
    const emoji = parse(emojiKey, decodeURIComponent(req.params.emoji));
    const cp = await access(req.params.id, req.userId, P.VIEW_CHANNEL | P.READ_HISTORY);
    const exists = await db.query(`select 1 from messages where id = $1 and channel_id = $2`, [req.params.mid, req.params.id]);
    if (!exists.rows.length) throw notFound();
    const already = await db.query(`select 1 from reactions where message_id = $1 and emoji_key = $2 limit 1`, [req.params.mid, emoji]);
    // adding a new emoji needs ADD_REACTIONS; joining an existing one only needs to see the message
    if (!already.rows.length) {
      if (!has(cp.perms, P.ADD_REACTIONS)) throw forbidden();
      const distinct = await db.query<{ n: number }>(`select count(distinct emoji_key)::int as n from reactions where message_id = $1`, [req.params.mid]);
      if ((distinct.rows[0]?.n ?? 0) >= MAX_REACTIONS_PER_MESSAGE) throw new HttpError(400, 'too_many_reactions');
    }
    const ins = await db.query(`insert into reactions (message_id, emoji_key, user_id) values ($1, $2, $3) on conflict do nothing returning 1`, [req.params.mid, emoji, req.userId]);
    if (ins.rows.length) await hub.dispatchToChannelViewers(cp.channel, { t: 'MESSAGE_REACTION_ADD', d: { messageId: req.params.mid, channelId: req.params.id, emoji, userId: req.userId } });
    return reply.status(204).send();
  });

  app.delete('/channels/:id/messages/:mid/reactions/:emoji', async (req, reply) => {
    const emoji = parse(emojiKey, decodeURIComponent(req.params.emoji));
    const cp = await access(req.params.id, req.userId, P.VIEW_CHANNEL);
    const del = await db.query(`delete from reactions where message_id = $1 and emoji_key = $2 and user_id = $3 returning 1`, [req.params.mid, emoji, req.userId]);
    if (del.rows.length) await hub.dispatchToChannelViewers(cp.channel, { t: 'MESSAGE_REACTION_REMOVE', d: { messageId: req.params.mid, channelId: req.params.id, emoji, userId: req.userId } });
    return reply.status(204).send();
  });

  // ── pins (guild: MANAGE_MESSAGES; DMs: any participant)
  const canPin = (cp: { channel: Channel; perms: bigint }) => !cp.channel.guildId || has(cp.perms, P.MANAGE_MESSAGES);

  app.get('/channels/:id/pins', async (req) => {
    await access(req.params.id, req.userId, P.VIEW_CHANNEL | P.READ_HISTORY);
    const { rows } = await db.query<MessageRow>(`${MESSAGE_SELECT} where m.channel_id = $1 and m.pinned order by m.id desc limit ${MAX_PINS}`, [req.params.id]);
    return hydrate(db, rows, req.userId);
  });

  for (const pin of [true, false]) {
    app[pin ? 'put' : 'delete']('/channels/:id/pins/:mid', async (req, reply) => {
      const cp = await access(req.params.id, req.userId, P.VIEW_CHANNEL);
      if (!canPin(cp)) throw forbidden();
      if (pin) {
        const n = await db.query<{ n: number }>(`select count(*)::int as n from messages where channel_id = $1 and pinned`, [req.params.id]);
        if ((n.rows[0]?.n ?? 0) >= MAX_PINS) throw new HttpError(400, 'too_many_pins');
      }
      const r = await db.query(`update messages set pinned = $3 where id = $1 and channel_id = $2 and pinned <> $3 returning id`, [req.params.mid, req.params.id, pin]);
      if (r.rows.length) {
        const msg = (await oneMessage(db, req.params.mid, null))!;
        await hub.dispatchToChannelViewers(cp.channel, { t: 'MESSAGE_UPDATE', d: { ...msg, guildId: cp.channel.guildId } });
        if (pin) {
          const sys = await db.query<{ id: string }>(`insert into messages (channel_id, author_id, type, content) values ($1, $2, 'system_pin', '') returning id`, [req.params.id, req.userId]);
          const sm = (await oneMessage(db, sys.rows[0]!.id, null))!;
          await hub.dispatchToChannelViewers(cp.channel, { t: 'MESSAGE_CREATE', d: { ...sm, guildId: cp.channel.guildId } });
        }
      }
      return reply.status(204).send();
    });
  }

  // ── read states
  app.post('/channels/:id/ack', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { messageId } = parse(AckInput, req.body);
    await access(req.params.id, req.userId, P.VIEW_CHANNEL);
    await db.query(
      `insert into read_states (user_id, channel_id, last_read_message_id, mention_count) values ($1, $2, $3, 0)
       on conflict (user_id, channel_id) do update set
         last_read_message_id = greatest(read_states.last_read_message_id, excluded.last_read_message_id), mention_count = 0, updated_at = now()`,
      [req.userId, req.params.id, messageId],
    );
    hub.dispatchToUser(req.userId, { t: 'READ_STATE_UPDATE', d: { channelId: req.params.id, lastReadMessageId: messageId, mentionCount: 0 } });
    return reply.status(204).send();
  });

  app.get('/users/@me/mentions', async (req) => {
    const { rows } = await db.query<MessageRow>(
      `${MESSAGE_SELECT} join message_mentions mm on mm.message_id = m.id and mm.user_id = $1 order by m.id desc limit 50`,
      [req.userId],
    );
    // drop anything from channels you can no longer see
    const out: Message[] = [];
    for (const m of await hydrate(db, rows, req.userId)) {
      const cp = await channelPermissions(db, m.channelId, req.userId);
      if (cp && has(cp.perms, P.VIEW_CHANNEL | P.READ_HISTORY)) out.push({ ...m, guildId: cp.channel.guildId } as Message);
    }
    return out;
  });

  // ── search: only channels you can read; Arabic-normalised substring match
  app.get('/search', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const q = parse(SearchQuery, req.query);
    let channelIds: string[];
    if (q.channelId) {
      await access(q.channelId, req.userId, P.VIEW_CHANNEL | P.READ_HISTORY);
      channelIds = [q.channelId];
    } else {
      const ctx = await guildContext(db, q.guildId!, req.userId);
      if (!ctx) throw notFound();
      const chans = await db.query<{ id: string }>(`select id from channels where guild_id = $1 and type in ('text','announcement','public_thread')`, [q.guildId]);
      const ows = await channelOverwrites(db, chans.rows.map((c) => c.id));
      channelIds = chans.rows.filter((c) => has(computePermissions(ctx.guild, ctx.member, ctx.roles, ows.get(c.id) ?? []), P.VIEW_CHANNEL | P.READ_HISTORY)).map((c) => c.id);
    }
    if (!channelIds.length) return { total: 0, messages: [] };
    const params: unknown[] = [channelIds];
    const where = ['m.channel_id = any($1::uuid[])', "m.type in ('default','reply')"];
    if (q.q) {
      params.push(normalize(q.q));
      where.push(`m.content_norm like '%' || $${params.length} || '%'`);
    }
    if (q.authorId) {
      params.push(q.authorId);
      where.push(`m.author_id = $${params.length}`);
    }
    if (q.has === 'link') where.push(`m.content ~* 'https?://'`);
    if (q.has === 'file' || q.has === 'image')
      where.push(`exists (select 1 from attachments a join files f on f.id = a.file_id where a.message_id = m.id${q.has === 'image' ? ` and f.content_type like 'image/%'` : ''})`);
    if (q.before) {
      params.push(q.before);
      where.push(`m.id < $${params.length}`);
    }
    const sql = `${MESSAGE_SELECT} where ${where.join(' and ')} order by m.id desc limit ${q.limit}`;
    const { rows } = await db.query<MessageRow>(sql, params);
    return { messages: await hydrate(db, rows, req.userId) };
  });
}

/** Same normalisation as messages.content_norm (migration 0003), plus LIKE wildcards escaped. */
export function normalize(s: string) {
  return s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[ً-ْٰ]/g, '')
    .toLowerCase()
    .replace(/[\\%_]/g, (c) => `\\${c}`);
}

export { recipientIds };
