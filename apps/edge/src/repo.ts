// Read models shared by routes and the gateway. All SQL is parameterised.
import {
  basePermissions,
  computePermissions,
  P,
  type PrivateChannel,
  type Relationship,
  type Channel,
  type Guild,
  type Member,
  type Message,
  type OverwriteLike,
  type Role,
  type RoleLike,
  type SelfUser,
  type User,
} from '@mncord/shared';
import type { Queryable } from './db.ts';

const USER_COLS = `u.id, u.username::text as username, u.display_name as "displayName", u.avatar_key as "avatarKey", u.status`;

export async function getSelf(db: Queryable, userId: string): Promise<SelfUser | null> {
  const { rows } = await db.query<SelfUser>(
    `select ${USER_COLS}, u.email::text as email, u.email_verified as "emailVerified", u.locale,
            u.two_factor_enabled as "mfaEnabled", u.bio, u.pronouns, u.accent_color as "accentColor",
            u.deletion_requested_at as "deletionRequestedAt", u.custom_status as "customStatus"
       from users u where u.id = $1 and u.disabled_at is null`,
    [userId],
  );
  return rows[0] ?? null;
}

export interface GuildContext {
  guild: { id: string; ownerId: string; name: string; iconKey: string | null };
  roles: RoleLike[];
  member: { userId: string; roleIds: string[]; timeoutUntil: Date | null };
}

/** Loads what's needed to compute a member's permissions. null = not a member. */
export async function guildContext(db: Queryable, guildId: string, userId: string): Promise<GuildContext | null> {
  const g = await db.query<{ id: string; ownerId: string; name: string; iconKey: string | null; timeoutUntil: Date | null }>(
    `select g.id, g.owner_id as "ownerId", g.name, g.icon_key as "iconKey", m.timeout_until as "timeoutUntil"
       from guilds g join guild_members m on m.guild_id = g.id and m.user_id = $2 where g.id = $1`,
    [guildId, userId],
  );
  const row = g.rows[0];
  if (!row) return null;
  const roles = await db.query<{ id: string; permissions: string; position: number; isEveryone: boolean }>(
    `select id, permissions::text as permissions, position, is_everyone as "isEveryone" from roles where guild_id = $1`,
    [guildId],
  );
  const mine = await db.query<{ roleId: string }>(`select role_id as "roleId" from member_roles where guild_id = $1 and user_id = $2`, [guildId, userId]);
  return {
    guild: { id: row.id, ownerId: row.ownerId, name: row.name, iconKey: row.iconKey },
    roles: roles.rows.map((r) => ({ ...r, permissions: BigInt(r.permissions) })),
    member: { userId, roleIds: mine.rows.map((r) => r.roleId), timeoutUntil: row.timeoutUntil },
  };
}

export async function channelOverwrites(db: Queryable, channelIds: string[]): Promise<Map<string, OverwriteLike[]>> {
  const map = new Map<string, OverwriteLike[]>();
  if (!channelIds.length) return map;
  const { rows } = await db.query<{ channelId: string; targetId: string; targetType: 'role' | 'member'; allow: string; deny: string }>(
    `select channel_id as "channelId", target_id as "targetId", target_type as "targetType", allow::text as allow, deny::text as deny
       from permission_overwrites where channel_id = any($1::uuid[])`,
    [channelIds],
  );
  for (const r of rows) {
    const list = map.get(r.channelId) ?? [];
    list.push({ targetId: r.targetId, targetType: r.targetType, allow: BigInt(r.allow), deny: BigInt(r.deny) });
    map.set(r.channelId, list);
  }
  return map;
}

const CHANNEL_COLS = `id, guild_id as "guildId", type, name, topic, nsfw, slowmode_s as "slowmodeS", owner_id as "ownerId", parent_id as "parentId", position, bitrate, user_limit as "userLimit", last_message_id as "lastMessageId"`;

export async function getChannel(db: Queryable, channelId: string): Promise<Channel | null> {
  const { rows } = await db.query<Channel>(`select ${CHANNEL_COLS} from channels where id = $1`, [channelId]);
  return rows[0] ?? null;
}

/** What a participant can do in a DM / group DM. */
export const DM_PERMS =
  P.VIEW_CHANNEL | P.SEND_MESSAGES | P.READ_HISTORY | P.ADD_REACTIONS | P.ATTACH_FILES | P.EMBED_LINKS |
  P.USE_EXTERNAL_EMOJI | P.CONNECT | P.SPEAK | P.STREAM | P.USE_VOICE_ACTIVITY;

export async function isBlockedEither(db: Queryable, a: string, b: string) {
  const { rows } = await db.query(
    `select 1 from relationships where type = 'blocked' and ((user_id = $1 and target_id = $2) or (user_id = $2 and target_id = $1)) limit 1`,
    [a, b],
  );
  return rows.length > 0;
}

export async function recipientIds(db: Queryable, channelId: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(`select user_id as id from channel_recipients where channel_id = $1`, [channelId]);
  return rows.map((r) => r.id);
}

/** Permissions of a user in one channel (guild channel or DM), or null if they can't see it at all. */
export async function channelPermissions(db: Queryable, channelId: string, userId: string) {
  const channel = await getChannel(db, channelId);
  if (!channel) return null;
  if (!channel.guildId) {
    if (channel.type !== 'dm' && channel.type !== 'group_dm') return null;
    const recips = await recipientIds(db, channel.id);
    if (!recips.includes(userId)) return null;
    let perms = DM_PERMS;
    if (channel.type === 'dm') {
      const other = recips.find((r) => r !== userId);
      // a block on either side makes a 1:1 DM read-only and call-free
      if (other && (await isBlockedEither(db, userId, other))) perms &= ~(P.SEND_MESSAGES | P.CONNECT | P.ADD_REACTIONS);
    }
    return { channel, ctx: null, perms, recipients: recips };
  }
  const ctx = await guildContext(db, channel.guildId, userId);
  if (!ctx) return null;
  const ow = (await channelOverwrites(db, [channel.id])).get(channel.id) ?? [];
  // threads/categories inherit nothing here yet; M5 adds category sync
  return { channel, ctx, perms: computePermissions(ctx.guild, ctx.member, ctx.roles, ow), recipients: null as string[] | null };
}

/** Full guild as the client sees it: only channels you can view, with your permissions per channel. */
export async function guildForUser(db: Queryable, guildId: string, userId: string): Promise<Guild | null> {
  const ctx = await guildContext(db, guildId, userId);
  if (!ctx) return null;
  const chans = await db.query<Channel>(`select ${CHANNEL_COLS} from channels where guild_id = $1 order by position, id`, [guildId]);
  const ows = await channelOverwrites(db, chans.rows.map((c) => c.id));
  const myPermissions: Record<string, string> = {};
  const visible: Channel[] = [];
  for (const c of chans.rows) {
    const p = computePermissions(ctx.guild, ctx.member, ctx.roles, ows.get(c.id) ?? []);
    if (p === 0n && c.type !== 'category') continue;
    myPermissions[c.id] = p.toString();
    visible.push(c);
  }
  const roles = await db.query<Role>(
    `select id, name, color, position, permissions::text as permissions, hoist, is_everyone as "isEveryone" from roles where guild_id = $1 order by position desc`,
    [guildId],
  );
  const count = await db.query<{ n: string | number }>(`select count(*)::int as n from guild_members where guild_id = $1`, [guildId]);
  const info = await db.query<{ description: string | null; systemChannelId: string | null; verificationLevel: number; defaultNotifications: 'all' | 'mentions' }>(
    `select description, system_channel_id as "systemChannelId", verification_level as "verificationLevel", default_notifications as "defaultNotifications" from guilds where id = $1`,
    [guildId],
  );
  const emo = await db.query<{ id: string; name: string; fileId: string; animated: boolean }>(
    `select id, name, file_id as "fileId", animated from emojis where guild_id = $1 order by name`,
    [guildId],
  );
  const { signedUrl, PUBLIC_BASE } = await import('./files.ts');
  const base = PUBLIC_BASE();
  const i = info.rows[0];
  return {
    id: ctx.guild.id,
    name: ctx.guild.name,
    iconKey: ctx.guild.iconKey,
    iconUrl: ctx.guild.iconKey && /^[0-9a-f-]{36}$/.test(ctx.guild.iconKey) ? `${base}/avatars/${ctx.guild.iconKey}` : null,
    description: i?.description ?? null,
    systemChannelId: i?.systemChannelId ?? null,
    verificationLevel: i?.verificationLevel ?? 0,
    defaultNotifications: i?.defaultNotifications ?? 'mentions',
    emojis: emo.rows.map((e) => ({ id: e.id, name: e.name, animated: e.animated, url: `${base}/avatars/${e.fileId}` })),
    ownerId: ctx.guild.ownerId,
    myGuildPermissions: basePermissions(ctx.guild, ctx.member, ctx.roles).toString(),
    channels: visible,
    roles: roles.rows,
    myPermissions,
    memberCount: Number(count.rows[0]?.n ?? 0),
  };
}

export async function guildIdsForUser(db: Queryable, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(`select guild_id as id from guild_members where user_id = $1 order by joined_at`, [userId]);
  return rows.map((r) => r.id);
}

export async function members(db: Queryable, guildId: string, limit = 1000): Promise<Member[]> {
  const { rows } = await db.query<Member & { roleIds: string[] | null } & User>(
    `select m.user_id as "userId", m.nick, m.joined_at as "joinedAt",
            coalesce(array_agg(mr.role_id) filter (where mr.role_id is not null), '{}') as "roleIds",
            ${USER_COLS}
       from guild_members m join users u on u.id = m.user_id
       left join member_roles mr on mr.guild_id = m.guild_id and mr.user_id = m.user_id
      where m.guild_id = $1
      group by m.user_id, m.nick, m.joined_at, u.id
      order by m.joined_at limit $2`,
    [guildId, limit],
  );
  return rows.map((r) => ({
    userId: r.userId,
    nick: r.nick,
    roleIds: r.roleIds ?? [],
    joinedAt: new Date(r.joinedAt).toISOString(),
    user: { id: r.id, username: r.username, displayName: r.displayName, avatarKey: r.avatarKey, status: r.status },
  }));
}

export const MESSAGE_SELECT = `
  select m.id, m.channel_id as "channelId", m.content, m.type, m.reply_to_id as "replyToId", m.nonce,
         m.edited_at as "editedAt", m.created_at as "createdAt", m.pinned, m.mention_everyone as "mentionEveryone",
         u.id as "authorId", u.username::text as "authorUsername", u.display_name as "authorDisplayName",
         u.avatar_key as "authorAvatarKey", u.status as "authorStatus"
    from messages m left join users u on u.id = m.author_id`;

export interface MessageRow {
  id: string;
  channelId: string;
  content: string;
  type: Message['type'];
  replyToId: string | null;
  nonce: string | null;
  editedAt: Date | null;
  createdAt: Date;
  pinned: boolean;
  mentionEveryone: boolean;
  authorId: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorAvatarKey: string | null;
  authorStatus: User['status'] | null;
}

const authorOf = (r: { authorId: string | null; authorUsername: string | null; authorDisplayName: string | null; authorAvatarKey: string | null; authorStatus: User['status'] | null }): User | null =>
  r.authorId ? { id: r.authorId, username: r.authorUsername!, displayName: r.authorDisplayName, avatarKey: r.authorAvatarKey, status: r.authorStatus ?? 'online' } : null;

/** Bare message (no attachments/reactions). Use hydrate() for the full shape. */
export function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    channelId: r.channelId,
    content: r.content,
    type: r.type,
    replyToId: r.replyToId,
    nonce: r.nonce,
    editedAt: r.editedAt ? new Date(r.editedAt).toISOString() : null,
    createdAt: new Date(r.createdAt).toISOString(),
    author: authorOf(r),
    attachments: [],
    reactions: [],
    pinned: !!r.pinned,
    mentionIds: [],
    mentionEveryone: !!r.mentionEveryone,
    replyTo: null,
  };
}

/** Adds attachments (with fresh signed URLs), reactions (with "me" for the viewer), mentions and reply previews. */
export async function hydrate(db: Queryable, rows: MessageRow[], viewerId: string | null): Promise<Message[]> {
  const msgs = rows.map(toMessage);
  if (!msgs.length) return msgs;
  const ids = msgs.map((m) => m.id);
  const { signedUrl, PUBLIC_BASE } = await import('./files.ts');
  const base = PUBLIC_BASE();
  const att = await db.query<{ messageId: string; id: string; filename: string; size: string | number; contentType: string; width: number | null; height: number | null; spoiler: boolean; expired: boolean }>(
    `select a.message_id as "messageId", f.id, a.filename, f.size_bytes as size, f.content_type as "contentType", f.width, f.height, a.spoiler, f.status = 'expired' as expired
       from attachments a join files f on f.id = a.file_id where a.message_id = any($1::uuid[]) order by a.position`,
    [ids],
  );
  const rx = await db.query<{ messageId: string; emoji: string; count: number; me: boolean }>(
    `select message_id as "messageId", emoji_key as emoji, count(*)::int as count, bool_or(user_id = $2) as me
       from reactions where message_id = any($1::uuid[]) group by message_id, emoji_key order by min(created_at)`,
    [ids, viewerId],
  );
  const men = await db.query<{ messageId: string; userId: string }>(`select message_id as "messageId", user_id as "userId" from message_mentions where message_id = any($1::uuid[])`, [ids]);
  const replyIds = msgs.map((m) => m.replyToId).filter((x): x is string => !!x);
  const replies = replyIds.length ? await db.query<MessageRow>(`${MESSAGE_SELECT} where m.id = any($1::uuid[])`, [replyIds]) : { rows: [] as MessageRow[] };
  const byId = new Map(msgs.map((m) => [m.id, m]));
  for (const a of att.rows) byId.get(a.messageId)?.attachments.push({ id: a.id, filename: a.filename, size: Number(a.size), contentType: a.contentType, width: a.width, height: a.height, spoiler: a.spoiler, url: a.expired ? null : signedUrl(base, a.id), expired: a.expired });
  for (const r of rx.rows) byId.get(r.messageId)?.reactions.push({ emoji: r.emoji, count: r.count, me: !!r.me });
  for (const x of men.rows) byId.get(x.messageId)?.mentionIds.push(x.userId);
  const rmap = new Map(replies.rows.map((r) => [r.id, r]));
  for (const m of msgs) {
    const r = m.replyToId ? rmap.get(m.replyToId) : undefined;
    if (r) m.replyTo = { id: r.id, author: authorOf(r), content: r.content.slice(0, 200) };
  }
  return msgs;
}

const PC_SELECT = `
  select c.id, c.type, c.name, c.owner_id as "ownerId", c.icon_key as "iconKey", c.last_message_id as "lastMessageId",
         coalesce(json_agg(json_build_object('id', u.id, 'username', u.username::text, 'displayName', u.display_name,
                    'avatarKey', u.avatar_key, 'status', u.status)) filter (where u.id is not null and u.id <> $1), '[]') as recipients
    from channels c
    join channel_recipients me on me.channel_id = c.id and me.user_id = $1
    left join channel_recipients cr on cr.channel_id = c.id
    left join users u on u.id = cr.user_id`;

/** DMs and group DMs the user has open, newest activity first. */
export async function privateChannelsForUser(db: Queryable, userId: string): Promise<PrivateChannel[]> {
  const { rows } = await db.query<PrivateChannel>(
    `${PC_SELECT} where c.type in ('dm','group_dm') and me.closed = false
      group by c.id order by coalesce(c.last_message_id, c.id) desc limit 200`,
    [userId],
  );
  return rows;
}

export async function privateChannel(db: Queryable, channelId: string, viewerId: string): Promise<PrivateChannel | null> {
  const { rows } = await db.query<PrivateChannel>(`${PC_SELECT} where c.id = $2 group by c.id`, [viewerId, channelId]);
  return rows[0] ?? null;
}

export async function relationshipsFor(db: Queryable, userId: string): Promise<Relationship[]> {
  const { rows } = await db.query<{ id: string; type: Relationship['type']; nickname: string | null; username: string; displayName: string | null; avatarKey: string | null; status: User['status'] }>(
    `select r.target_id as id, r.type, r.nickname, u.username::text as username, u.display_name as "displayName", u.avatar_key as "avatarKey", u.status
       from relationships r join users u on u.id = r.target_id where r.user_id = $1 order by r.created_at`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, type: r.type, nickname: r.nickname, user: { id: r.id, username: r.username, displayName: r.displayName, avatarKey: r.avatarKey, status: r.status } }));
}

export async function publicUser(db: Queryable, userId: string): Promise<User | null> {
  const { rows } = await db.query<User>(`select ${USER_COLS} from users u where u.id = $1 and u.disabled_at is null`, [userId]);
  return rows[0] ?? null;
}

/** Users who should hear about this user's presence: friends + anyone sharing a guild is handled by the hub. */
export async function friendIds(db: Queryable, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(`select target_id as id from relationships where user_id = $1 and type = 'friend'`, [userId]);
  return rows.map((r) => r.id);
}
