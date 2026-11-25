// Request validation shared by server (enforces) and client (shows errors early).
import { z } from 'zod';

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{2,32}$/, 'username_format');

export const password = z.string().min(8, 'password_short').max(128, 'password_long');
/** per-account salt for the on-device Argon2id key derivation (base64url) */
export const salt = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'salt_invalid');
export const PreloginInput = z.object({ login: z.string().trim().min(1).max(254) });

export const RegisterInput = z.object({
  email: z.string().trim().toLowerCase().email('email_invalid').max(254),
  username,
  displayName: z.string().trim().min(1).max(32).optional(),
  password,
  salt: salt.optional(),
  dateOfBirth: z.iso.date('dob_invalid'),
  locale: z.enum(['en', 'ar']).default('en'),
  device: z.string().max(64).optional(),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  login: z.string().trim().min(1).max(254), // email or username
  password: z.string().min(1).max(128),
  device: z.string().max(64).optional(),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const RefreshInput = z.object({ refreshToken: z.string().min(20).max(200) });

export const CreateGuildInput = z.object({
  name: z.string().trim().min(2, 'guild_name_short').max(100),
  template: z.enum(['friends', 'gaming', 'community', 'blank']).default('friends'),
  locale: z.enum(['en', 'ar']).default('en'),
});
export type CreateGuildInput = z.infer<typeof CreateGuildInput>;

export const CreateMessageInput = z.object({
  content: z.string().max(4000, 'message_long').default(''),
  nonce: z.string().max(64).optional(),
  replyToId: z.uuid().optional(),
  attachmentIds: z.array(z.uuid()).max(10).default([]),
  spoilerIds: z.array(z.uuid()).max(10).default([]),
}).refine((v) => v.content.trim().length > 0 || v.attachmentIds.length > 0, { message: 'message_empty', path: ['content'] });
export const EditMessageInput = z.object({ content: z.string().max(4000, 'message_long') }).refine((v) => v.content.trim().length > 0, { message: 'message_empty', path: ['content'] });
export const AckInput = z.object({ messageId: z.uuid() });
export const SearchQuery = z.object({
  guildId: z.uuid().optional(),
  channelId: z.uuid().optional(),
  q: z.string().trim().max(200).default(''),
  authorId: z.uuid().optional(),
  has: z.enum(['file', 'image', 'link']).optional(),
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
}).refine((v) => v.guildId || v.channelId, { message: 'scope_required' });
/** a unicode emoji (1-16 code points) or a custom emoji id */
export const emojiKey = z.string().min(1).max(64).refine((s) => /^[0-9a-f-]{36}$/.test(s) || /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s), 'emoji_invalid');
export type CreateMessageInput = z.infer<typeof CreateMessageInput>;

export const CreateInviteInput = z.object({
  maxAgeSeconds: z.number().int().min(0).max(60 * 60 * 24 * 30).default(60 * 60 * 24 * 7), // 0 = never
  maxUses: z.number().int().min(0).max(1000).default(0),
});

export const MessagesQuery = z.object({
  before: z.uuid().optional(),
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Age gate: 13+, same as most chat apps. */
export function oldEnough(dob: string, now = new Date(), minAge = 13) {
  const d = new Date(`${dob}T00:00:00Z`);
  const limit = new Date(Date.UTC(now.getUTCFullYear() - minAge, now.getUTCMonth(), now.getUTCDate()));
  return d <= limit;
}

// ── M2: account security
export const code6 = z.string().trim().regex(/^\d{6}$/, 'code_invalid');
export const VerifyEmailInput = z.object({ code: code6 });
export const ForgotInput = z.object({ email: z.string().trim().toLowerCase().email('email_invalid').max(254) });
export const ResetInput = z.object({ email: z.string().trim().toLowerCase().email('email_invalid').max(254), code: code6, password, salt: salt.optional(), device: z.string().max(64).optional() });
/** TOTP (6 digits) or a backup code (xxxx-xxxx) */
export const mfaCode = z.string().trim().toLowerCase().regex(/^(\d{6}|[a-z0-9]{4}-?[a-z0-9]{4})$/, 'code_invalid');
export const MfaLoginInput = z.object({ ticket: z.string().min(20).max(1000), code: mfaCode, device: z.string().max(64).optional() });
export const EnableTotpInput = z.object({ secret: z.string().regex(/^[A-Z2-7]{32}$/), code: code6, password: z.string().min(1).max(128) });
export const DisableTotpInput = z.object({ password: z.string().min(1).max(128), code: mfaCode });
export const RegenerateBackupInput = z.object({ password: z.string().min(1).max(128), code: mfaCode });
export const UpdateProfileInput = z.object({
  displayName: z.string().trim().min(1).max(32).nullable().optional(),
  bio: z.string().max(400).nullable().optional(),
  pronouns: z.string().max(40).nullable().optional(),
  locale: z.enum(['en', 'ar']).optional(),
  status: z.enum(['online', 'idle', 'dnd', 'invisible']).optional(),
  accentColor: z.number().int().min(0).max(0xffffff).nullable().optional(),
  avatarFileId: z.uuid().nullable().optional(),
  bannerFileId: z.uuid().nullable().optional(),
  customStatus: z.object({ text: z.string().trim().max(128), emoji: z.string().max(64).nullable().optional(), expiresAt: z.iso.datetime().nullable().optional() }).nullable().optional(),
});
export const ChangeUsernameInput = z.object({ username, password: z.string().min(1).max(128) });
export const ChangeEmailInput = z.object({ email: z.string().trim().toLowerCase().email('email_invalid').max(254), password: z.string().min(1).max(128) });
export const ChangePasswordInput = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password, newSalt: salt.optional() });
export const DeleteAccountInput = z.object({ password: z.string().min(1).max(128), code: mfaCode.optional() });

// ── M3: social
export const FriendRequestInput = z.object({ username });
export const RelationshipUpdateInput = z.object({ type: z.enum(['friend', 'blocked']) });
export const RelationshipNoteInput = z.object({ nickname: z.string().trim().max(32).nullable().optional(), note: z.string().max(256).nullable().optional() });
export const OpenDmInput = z.object({ recipientIds: z.array(z.uuid()).min(1).max(9) });
export const GroupDmUpdateInput = z.object({ name: z.string().trim().min(1).max(100).nullable() });

// ── M5: server management
const name100 = z.string().trim().min(1).max(100);
export const UpdateGuildInput = z.object({
  name: z.string().trim().min(2, 'guild_name_short').max(100).optional(),
  description: z.string().max(300).nullable().optional(),
  iconFileId: z.uuid().nullable().optional(),
  systemChannelId: z.uuid().nullable().optional(),
  verificationLevel: z.number().int().min(0).max(4).optional(),
  defaultNotifications: z.enum(['all', 'mentions']).optional(),
  preferredLocale: z.enum(['en', 'ar']).optional(),
});
export const permString = z.string().regex(/^\d{1,20}$/);
export const CreateRoleInput = z.object({ name: name100.default('new role'), color: z.number().int().min(0).max(0xffffff).default(0), permissions: permString.optional(), hoist: z.boolean().default(false), mentionable: z.boolean().default(false) });
export const UpdateRoleInput = z.object({ name: name100.optional(), color: z.number().int().min(0).max(0xffffff).optional(), permissions: permString.optional(), hoist: z.boolean().optional(), mentionable: z.boolean().optional() });
export const RolePositionsInput = z.array(z.object({ id: z.uuid(), position: z.number().int().min(1).max(250) })).min(1).max(250);
export const UpdateMemberInput = z.object({
  nick: z.string().trim().max(32).nullable().optional(),
  roleIds: z.array(z.uuid()).max(250).optional(),
  timeoutUntil: z.iso.datetime().nullable().optional(),
  serverMute: z.boolean().optional(),
  serverDeaf: z.boolean().optional(),
  reason: z.string().max(512).optional(),
});
export const BanInput = z.object({ reason: z.string().max(512).optional(), deleteMessageSeconds: z.number().int().min(0).max(7 * 86400).default(0) });
export const CreateChannelInput = z.object({
  type: z.enum(['text', 'voice', 'category', 'announcement']),
  name: z.string().trim().min(1).max(100),
  parentId: z.uuid().nullable().optional(),
  topic: z.string().max(1024).optional(),
  private: z.boolean().default(false),
});
export const UpdateChannelInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  topic: z.string().max(1024).nullable().optional(),
  slowmodeS: z.number().int().min(0).max(21600).optional(),
  nsfw: z.boolean().optional(),
  bitrate: z.number().int().min(8000).max(510000).optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
  parentId: z.uuid().nullable().optional(),
});
export const ChannelPositionsInput = z.array(z.object({ id: z.uuid(), position: z.number().int().min(0).max(500), parentId: z.uuid().nullable().optional() })).min(1).max(500);
export const OverwriteInput = z.object({ type: z.enum(['role', 'member']), allow: permString, deny: permString });
export const CreateEmojiInput = z.object({ name: z.string().regex(/^[A-Za-z0-9_]{2,32}$/, 'emoji_name'), fileId: z.uuid() });
export const AuditQuery = z.object({ before: z.uuid().optional(), actorId: z.uuid().optional(), action: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const DeleteGuildInput = z.object({ password: z.string().min(1).max(128), code: mfaCode.optional() });

// ── M7: notifications
export const NotificationSettingInput = z.object({
  guildId: z.uuid().nullable().optional(),
  channelId: z.uuid().nullable().optional(),
  level: z.enum(['default', 'all', 'mentions', 'nothing']).default('default'),
  mutedUntil: z.iso.datetime().nullable().optional(),
  suppressEveryone: z.boolean().optional(),
}).refine((v) => v.guildId || v.channelId, { message: 'scope_required' });

// ── realtime media
export const mediaSource = z.enum(['mic', 'camera', 'screen', 'screen_audio']);
const sdp = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().min(10).max(200_000) });
export const RtcPushInput = z.object({ sessionDescription: sdp, tracks: z.array(z.object({ mid: z.string().max(16), source: mediaSource })).min(1).max(4) });
export const RtcPullInput = z.object({ tracks: z.array(z.object({ userId: z.uuid(), source: mediaSource })).min(1).max(32) });
export const RtcRenegotiateInput = z.object({ sessionDescription: sdp });
export const RtcCloseInput = z.object({ mids: z.array(z.string().max(16)).min(1).max(32), sessionDescription: sdp.optional(), unpublish: z.array(mediaSource).max(4).default([]) });
