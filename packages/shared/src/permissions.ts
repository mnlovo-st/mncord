// mncord permission system. Bitfield in a Postgres bigint; JS uses BigInt.
// Order of evaluation (same idea every chat app with roles uses):
//   owner → everything
//   base = @everyone | all member roles
//   ADMINISTRATOR → everything
//   channel overwrites: @everyone (deny, allow) → roles (deny all, then allow all) → member (deny, allow)
//   timed-out members keep only VIEW_CHANNEL + READ_HISTORY
//   no VIEW_CHANNEL → nothing in that channel

export const P = {
  VIEW_CHANNEL: 1n << 0n,
  SEND_MESSAGES: 1n << 1n,
  READ_HISTORY: 1n << 2n,
  ADD_REACTIONS: 1n << 3n,
  ATTACH_FILES: 1n << 4n,
  EMBED_LINKS: 1n << 5n,
  MENTION_EVERYONE: 1n << 6n,
  USE_EXTERNAL_EMOJI: 1n << 7n,
  MANAGE_MESSAGES: 1n << 8n,
  CREATE_INVITE: 1n << 9n,
  CREATE_THREADS: 1n << 10n,
  MANAGE_THREADS: 1n << 11n,
  SEND_IN_THREADS: 1n << 12n,
  CONNECT: 1n << 16n,
  SPEAK: 1n << 17n,
  STREAM: 1n << 18n, // camera + screen share
  USE_VOICE_ACTIVITY: 1n << 19n,
  PRIORITY_SPEAKER: 1n << 20n,
  USE_SOUNDBOARD: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  CHANGE_NICKNAME: 1n << 28n,
  MANAGE_NICKNAMES: 1n << 29n,
  KICK_MEMBERS: 1n << 30n,
  BAN_MEMBERS: 1n << 31n,
  TIMEOUT_MEMBERS: 1n << 32n,
  MANAGE_CHANNELS: 1n << 33n,
  MANAGE_ROLES: 1n << 34n,
  MANAGE_WEBHOOKS: 1n << 35n,
  MANAGE_EXPRESSIONS: 1n << 36n,
  MANAGE_EVENTS: 1n << 37n,
  MANAGE_GUILD: 1n << 38n,
  VIEW_AUDIT_LOG: 1n << 39n,
  ADMINISTRATOR: 1n << 62n,
} as const;

export type PermissionName = keyof typeof P;
export const ALL = Object.values(P).reduce((a, b) => a | b, 0n);

/** What @everyone gets in a new server. */
export const DEFAULT_EVERYONE =
  P.VIEW_CHANNEL | P.SEND_MESSAGES | P.READ_HISTORY | P.ADD_REACTIONS | P.ATTACH_FILES | P.EMBED_LINKS |
  P.USE_EXTERNAL_EMOJI | P.CREATE_INVITE | P.CREATE_THREADS | P.SEND_IN_THREADS | P.CONNECT | P.SPEAK |
  P.STREAM | P.USE_VOICE_ACTIVITY | P.USE_SOUNDBOARD | P.CHANGE_NICKNAME;

export interface RoleLike { id: string; permissions: bigint; position: number; isEveryone: boolean }
export interface OverwriteLike { targetId: string; targetType: 'role' | 'member'; allow: bigint; deny: bigint }
export interface MemberLike { userId: string; roleIds: readonly string[]; timeoutUntil?: Date | null }
export interface GuildLike { id: string; ownerId: string }

export function basePermissions(guild: GuildLike, member: MemberLike, roles: readonly RoleLike[]): bigint {
  if (member.userId === guild.ownerId) return ALL;
  const everyone = roles.find((r) => r.isEveryone);
  let perms = everyone?.permissions ?? 0n;
  const mine = new Set(member.roleIds);
  for (const r of roles) if (mine.has(r.id)) perms |= r.permissions;
  if (perms & P.ADMINISTRATOR) return ALL;
  return perms;
}

export function computePermissions(
  guild: GuildLike,
  member: MemberLike,
  roles: readonly RoleLike[],
  overwrites: readonly OverwriteLike[] = [],
  now: Date = new Date(),
): bigint {
  let perms = basePermissions(guild, member, roles);
  if (perms === ALL) return ALL;

  const everyone = roles.find((r) => r.isEveryone);
  const ow = (id: string | undefined) => (id ? overwrites.find((o) => o.targetId === id) : undefined);

  const e = ow(everyone?.id);
  if (e) perms = (perms & ~e.deny) | e.allow;

  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const id of member.roleIds) {
    const o = overwrites.find((x) => x.targetType === 'role' && x.targetId === id);
    if (o) {
      roleDeny |= o.deny;
      roleAllow |= o.allow;
    }
  }
  perms = (perms & ~roleDeny) | roleAllow;

  const m = overwrites.find((x) => x.targetType === 'member' && x.targetId === member.userId);
  if (m) perms = (perms & ~m.deny) | m.allow;

  if (member.timeoutUntil && member.timeoutUntil > now) perms &= P.VIEW_CHANNEL | P.READ_HISTORY;
  if (!(perms & P.VIEW_CHANNEL)) return 0n;
  return perms;
}

export const has = (perms: bigint, flag: bigint) => (perms & flag) === flag;

/** Highest role position a member holds (owner = Infinity). Used for "can only manage below you". */
export function topPosition(guild: GuildLike, member: MemberLike, roles: readonly RoleLike[]): number {
  if (member.userId === guild.ownerId) return Number.POSITIVE_INFINITY;
  const mine = new Set(member.roleIds);
  return roles.filter((r) => mine.has(r.id)).reduce((max, r) => Math.max(max, r.position), 0);
}

export const permsToString = (p: bigint) => p.toString();
export const permsFromString = (s: string) => BigInt(s);
