// Wire types (JSON). Permissions travel as decimal strings because JSON has no BigInt.

export interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarKey: string | null;
  avatarUrl?: string | null;
  status: 'online' | 'idle' | 'dnd' | 'invisible';
  /** badges: bit 1 = Dev (mncord developer) */
  flags?: number;
  /** free profile cosmetics: avatar decoration, profile effect, name style, nameplate */
  style?: ProfileStyle | null;
}
export interface ProfileStyle {
  decoration?: string | null;
  effect?: string | null;
  nameStyle?: string | null;
  nameplate?: string | null;
}
/** what someone is playing right now (detected on their PC) */
export interface Activity {
  name: string;
  /** epoch ms */
  startedAt: number;
}
export const USER_FLAG_DEV = 1;
/** green Dev badge */
export const USER_FLAG_DEV_GREEN = 2;
export interface SelfUser extends User {
  /** profile banner image (public picture id) */
  bannerKey?: string | null;
  /** false while the owner hasn't approved this account yet */
  approved?: boolean;
  /** the instance owner (approves new accounts) */
  isOwner?: boolean;
  email: string;
  emailVerified: boolean;
  locale: 'en' | 'ar';
  mfaEnabled: boolean;
  bio: string | null;
  pronouns: string | null;
  accentColor: number | null;
  deletionRequestedAt: string | null;
  customStatus: { text: string; emoji?: string | null; expiresAt?: string | null } | null;
}

export type ChannelType = 'text' | 'voice' | 'category' | 'announcement' | 'stage' | 'forum' | 'dm' | 'group_dm';

export interface Channel {
  id: string;
  guildId: string | null;
  type: ChannelType;
  name: string | null;
  topic: string | null;
  ownerId?: string | null;
  nsfw?: boolean;
  slowmodeS?: number;
  parentId: string | null;
  position: number;
  bitrate: number;
  userLimit: number;
  lastMessageId: string | null;
}

export interface Role {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  hoist: boolean;
  isEveryone: boolean;
}

export interface Member {
  userId: string;
  nick: string | null;
  roleIds: string[];
  joinedAt: string;
  timeoutUntil?: string | null;
  user: User;
}

export interface GuildEmoji {
  id: string;
  name: string;
  url: string;
  animated: boolean;
}

export interface Guild {
  id: string;
  name: string;
  iconKey: string | null;
  iconUrl: string | null;
  description: string | null;
  systemChannelId: string | null;
  verificationLevel: number;
  defaultNotifications: 'all' | 'mentions';
  emojis: GuildEmoji[];
  ownerId: string;
  /** your base permissions in the server (decimal string) */
  myGuildPermissions: string;
  channels: Channel[];
  roles: Role[];
  /** your computed permissions per channel id (decimal strings) */
  myPermissions: Record<string, string>;
  memberCount: number;
}

export interface Attachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  /** signed, expires in 7 days (refetch the message for a fresh one); null once the file expired */
  url: string | null;
  width: number | null;
  height: number | null;
  spoiler: boolean;
  /** images/videos are deleted 14 days after upload; the message keeps this placeholder */
  expired?: boolean;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  me: boolean;
}

export interface ReadState {
  channelId: string;
  lastReadMessageId: string | null;
  mentionCount: number;
}

export interface Message {
  id: string;
  channelId: string;
  author: User | null;
  content: string;
  type: 'default' | 'reply' | 'system_join' | 'system_pin' | 'call' | 'forward';
  attachments: Attachment[];
  reactions: ReactionSummary[];
  pinned: boolean;
  mentionIds: string[];
  mentionEveryone: boolean;
  replyTo?: { id: string; author: User | null; content: string } | null;
  replyToId: string | null;
  nonce: string | null;
  editedAt: string | null;
  createdAt: string;
}

export interface VoiceState {
  userId: string;
  guildId: string | null; // null = DM / group DM call
  channelId: string;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfStream: boolean;
  /** a moderator muted / deafened them in this server */
  serverMute?: boolean;
  serverDeaf?: boolean;
}

export interface Invite {
  code: string;
  guild: { id: string; name: string; iconKey: string | null; memberCount: number };
  channelId: string;
  expiresAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApiError {
  error: string; // machine code, translated on the client
  field?: string;
}

export interface SessionInfo {
  id: string;
  deviceName: string | null;
  os: string | null;
  clientVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface MfaChallenge {
  mfaRequired: true;
  ticket: string;
}

export interface Profile extends User {
  bio: string | null;
  pronouns: string | null;
  accentColor: number | null;
  bannerKey?: string | null;
  createdAt: string;
  activity?: Activity | null;
}

export type RelationshipType = 'friend' | 'blocked' | 'incoming' | 'outgoing';
export interface Relationship {
  id: string; // the other user's id
  type: RelationshipType;
  nickname: string | null;
  user: User;
}

export interface PrivateChannel {
  id: string;
  type: 'dm' | 'group_dm';
  name: string | null;
  ownerId: string | null;
  iconKey: string | null;
  recipients: User[]; // everyone except you
  lastMessageId: string | null;
}

export interface FullProfile extends Profile {
  mutualGuilds: { id: string; name: string; iconKey: string | null }[];
  mutualFriends: User[];
  relationship: RelationshipType | null;
}

export interface Call {
  channelId: string;
  callerId: string;
  ringing: string[]; // user ids still being rung
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: User | null;
  targetId: string | null;
  changes: { key: string; old?: unknown; new?: unknown }[];
  reason: string | null;
  createdAt: string;
}

export interface Ban {
  user: User;
  reason: string | null;
  createdAt: string;
}

export interface InviteInfo {
  code: string;
  channelId: string;
  inviter: User | null;
  uses: number;
  maxUses: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface Overwrite {
  targetId: string;
  targetType: 'role' | 'member';
  allow: string;
  deny: string;
}

// ── Realtime media (Cloudflare Realtime SFU behind our server)
export type MediaSource = 'mic' | 'camera' | 'screen' | 'screen_audio';
export interface RtcParticipant {
  userId: string;
  sources: MediaSource[]; // tracks this person is publishing right now
}
export interface RtcJoin {
  sessionId: string;
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
  allowed: MediaSource[]; // what you may publish (permissions, server mute)
  bitrate: number;
  serverMute: boolean;
  serverDeaf: boolean;
  participants: RtcParticipant[];
  videoAllowed: boolean; // false when the free monthly allowance is nearly used up
  /** best Go Live quality allowed right now (steps down as today's share of the free allowance fills up) */
  streamCap: '1440p100' | '1080p60' | '1080p30' | '720p30';
}
export interface SessionDescription { type: 'offer' | 'answer'; sdp: string }
