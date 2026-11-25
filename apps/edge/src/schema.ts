// mncord schema for the Hub's SQLite (translated from the original Postgres migrations, see git tag legacy-node-server). © mnlovo.
// ids: UUIDv7 text built in SQL (time-ordered, so "id < cursor" pagination still works).
// times: ISO-8601 UTC text. booleans: 0/1. arrays/objects: JSON text. bitfields: decimal text (exact).
import { NOW, UUID } from './db.ts';
export { UUID };

// 48-bit millisecond timestamp + version 7 + random. 'now' is fixed for the whole statement, so both
// halves of the timestamp always agree.
const id = `id text primary key default ${UUID}`;
const ts = (name: string) => `${name} text not null default ${NOW}`;

// Arabic-friendly search text: alef forms → ا, ى → ي, ة → ه, tatweel and tashkeel removed, Latin lowercased.
const NORM_CHARS: [string, string][] = [['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'], ['ٱ', 'ا'], ['ى', 'ي'], ['ة', 'ه'], ['ـ', ''], ['ً', ''], ['ٌ', ''], ['ٍ', ''], ['َ', ''], ['ُ', ''], ['ِ', ''], ['ّ', ''], ['ْ', ''], ['ٰ', '']];
const NORM = NORM_CHARS.reduce((acc, [a, b]) => `replace(${acc}, '${a}', '${b}')`, 'content');

export const SCHEMA_VERSION = 2;
/** upgrades for databases created by an older version (run in order, each once) */
export const MIGRATIONS: Record<number, string[]> = {
  2: [
    `alter table users add column approved_at text`,
    `alter table dev_outbox add column html text`,
    // the smoke-test accounts made while setting up production must not become "the first account" (owner)
    `delete from guilds where owner_id in (select id from users where email like '%@example.test')`,
    `delete from users where email like '%@example.test'`,
    `update users set approved_at = created_at`,
  ],
};
export const SCHEMA = `
create table if not exists users (
  ${id},
  email text not null unique collate nocase,
  email_verified integer not null default 0,
  username text not null unique collate nocase,
  display_name text,
  avatar_key text, banner_key text, accent_color integer,
  profile_theme text not null default '{}',
  bio text, pronouns text,
  locale text not null default 'en' check (locale in ('en','ar')),
  status text not null default 'online' check (status in ('online','idle','dnd','invisible')),
  custom_status text,
  hide_badges integer not null default 0,
  date_of_birth text not null,
  two_factor_enabled integer not null default 0,
  disabled_at text,
  deletion_requested_at text,
  approved_at text,
  ${ts('created_at')}, ${ts('updated_at')}
);

create table if not exists accounts (
  ${id},
  user_id text not null references users(id) on delete cascade,
  provider_id text not null default 'credential',
  account_id text not null,
  password_hash text,
  password_salt text,
  ${ts('created_at')}, ${ts('updated_at')},
  unique (provider_id, account_id)
);
create index if not exists accounts_user on accounts (user_id);

create table if not exists sessions (
  ${id},
  user_id text not null references users(id) on delete cascade,
  token_hash blob not null unique,
  family_id text not null,
  device_name text, os text, client_version text, ip_prefix text,
  ${ts('last_seen_at')},
  expires_at text not null,
  revoked_at text,
  ${ts('created_at')}, ${ts('updated_at')}
);
create index if not exists sessions_user on sessions (user_id) where revoked_at is null;
create index if not exists sessions_family on sessions (family_id);
create index if not exists sessions_expires on sessions (expires_at);
create index if not exists sessions_user_device on sessions (user_id, device_name, os, created_at desc);

create table if not exists verifications (
  ${id},
  identifier text not null,
  value_hash blob not null,
  attempts integer not null default 0,
  expires_at text not null,
  ${ts('created_at')}
);
create index if not exists verifications_identifier on verifications (identifier);

create table if not exists two_factors (
  ${id},
  user_id text not null unique references users(id) on delete cascade,
  secret_enc blob not null,
  backup_codes_hash text not null default '[]',
  last_used_step integer not null default 0,
  ${ts('created_at')}
);

create table if not exists user_settings (
  user_id text primary key references users(id) on delete cascade,
  theme text not null default 'dark',
  accent integer,
  density text not null default 'cozy',
  font_scale integer not null default 100,
  reduced_motion integer not null default 0,
  streamer_mode text not null default '{}',
  friend_request_policy text not null default 'everyone'
    check (friend_request_policy in ('everyone','friends_of_friends','server_members','nobody')),
  dm_policy text not null default 'server_members' check (dm_policy in ('everyone','server_members','friends')),
  guild_folders text not null default '[]',
  keybinds text not null default '{}',
  notification_prefs text not null default '{}',
  ${ts('updated_at')}
);

create table if not exists relationships (
  user_id text not null references users(id) on delete cascade,
  target_id text not null references users(id) on delete cascade,
  type text not null check (type in ('friend','blocked','incoming','outgoing')),
  nickname text, note text,
  ${ts('created_at')}, ${ts('updated_at')},
  primary key (user_id, target_id),
  check (user_id <> target_id)
);
create index if not exists relationships_target on relationships (target_id);

create table if not exists files (
  ${id},
  owner_id text references users(id) on delete set null,
  key text not null unique,
  kind text not null default 'attachment' check (kind in ('attachment','avatar','icon','emoji','banner')),
  content_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  sha256 blob,
  width integer, height integer, duration_ms integer,
  status text not null default 'pending' check (status in ('pending','ready','quarantined','expired')),
  original_name text,
  attached integer not null default 0,
  upload_id text,
  ${ts('created_at')}
);
create index if not exists files_owner on files (owner_id, created_at);
create index if not exists files_status on files (status, kind, created_at);

create table if not exists guilds (
  ${id},
  name text not null check (length(name) between 2 and 100),
  icon_key text, banner_key text, description text,
  owner_id text not null references users(id) on delete restrict,
  verification_level integer not null default 0,
  default_notifications text not null default 'mentions' check (default_notifications in ('all','mentions')),
  explicit_filter integer not null default 1,
  system_channel_id text references channels(id) on delete set null,
  rules_channel_id text references channels(id) on delete set null,
  afk_channel_id text references channels(id) on delete set null,
  afk_timeout_s integer not null default 300,
  vanity_code text unique collate nocase,
  is_discoverable integer not null default 0,
  community_enabled integer not null default 0,
  onboarding text not null default '{}',
  preferred_locale text not null default 'en' check (preferred_locale in ('en','ar')),
  ${ts('created_at')}, ${ts('updated_at')}
);
create index if not exists guilds_owner on guilds (owner_id);

create table if not exists roles (
  ${id},
  guild_id text not null references guilds(id) on delete cascade,
  name text not null,
  color integer not null default 0,
  icon_key text,
  hoist integer not null default 0,
  mentionable integer not null default 0,
  position integer not null default 0,
  permissions text not null default '0',
  is_everyone integer not null default 0,
  ${ts('created_at')}, ${ts('updated_at')}
);
create index if not exists roles_guild on roles (guild_id, position);
create unique index if not exists one_everyone_role on roles (guild_id) where is_everyone;

create table if not exists guild_members (
  guild_id text not null references guilds(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  nick text, avatar_key text, banner_key text, bio text,
  ${ts('joined_at')},
  timeout_until text,
  onboarding_done integer not null default 0,
  server_mute integer not null default 0,
  server_deaf integer not null default 0,
  primary key (guild_id, user_id)
);
create index if not exists guild_members_user on guild_members (user_id);

create table if not exists member_roles (
  guild_id text not null,
  user_id text not null,
  role_id text not null references roles(id) on delete cascade,
  primary key (guild_id, user_id, role_id),
  foreign key (guild_id, user_id) references guild_members(guild_id, user_id) on delete cascade
);
create index if not exists member_roles_role on member_roles (role_id);

create table if not exists channels (
  ${id},
  guild_id text references guilds(id) on delete cascade,
  type text not null check (type in ('text','voice','category','announcement','stage','forum','dm','group_dm','public_thread','private_thread')),
  name text, topic text, icon_key text,
  owner_id text references users(id) on delete set null,
  parent_id text references channels(id) on delete cascade,
  position integer not null default 0,
  nsfw integer not null default 0,
  slowmode_s integer not null default 0 check (slowmode_s between 0 and 21600),
  bitrate integer not null default 96000 check (bitrate between 8000 and 510000),
  user_limit integer not null default 0 check (user_limit between 0 and 99),
  video_quality text not null default 'auto',
  last_message_id text,
  archived integer not null default 0,
  locked integer not null default 0,
  auto_archive_min integer not null default 4320,
  applied_tags text not null default '[]',
  default_sort text,
  ${ts('created_at')}, ${ts('updated_at')},
  check ((type in ('dm','group_dm')) = (guild_id is null))
);
create index if not exists channels_guild on channels (guild_id, position);
create index if not exists channels_parent on channels (parent_id);

create table if not exists channel_recipients (
  channel_id text not null references channels(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  closed integer not null default 0,
  ${ts('added_at')},
  primary key (channel_id, user_id)
);
create index if not exists channel_recipients_user on channel_recipients (user_id);

create table if not exists dm_pairs (
  user_low text not null references users(id) on delete cascade,
  user_high text not null references users(id) on delete cascade,
  channel_id text not null unique references channels(id) on delete cascade,
  primary key (user_low, user_high),
  check (user_low < user_high)
);

create table if not exists permission_overwrites (
  channel_id text not null references channels(id) on delete cascade,
  target_id text not null,
  target_type text not null check (target_type in ('role','member')),
  allow text not null default '0',
  deny text not null default '0',
  primary key (channel_id, target_id)
);
create index if not exists permission_overwrites_target on permission_overwrites (target_id);

create table if not exists messages (
  ${id},
  channel_id text not null references channels(id) on delete cascade,
  author_id text references users(id) on delete set null,
  webhook_id text,
  type text not null default 'default' check (type in ('default','reply','system_join','system_pin','call','thread_created','forward')),
  content text not null default '' check (length(content) <= 4000),
  content_norm text generated always as (lower(${NORM})) stored,
  reply_to_id text references messages(id) on delete set null,
  forwarded_from text,
  embeds text not null default '[]',
  mention_everyone integer not null default 0,
  mention_roles text not null default '[]',
  pinned integer not null default 0,
  flags integer not null default 0,
  nonce text,
  edited_at text,
  ${ts('created_at')}
);
create index if not exists messages_channel on messages (channel_id, id desc);
create index if not exists messages_author on messages (author_id, id desc);
create index if not exists messages_pinned on messages (channel_id) where pinned;
create unique index if not exists messages_nonce on messages (channel_id, author_id, nonce) where nonce is not null;

create table if not exists message_mentions (
  message_id text not null references messages(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  primary key (user_id, message_id)
);

create table if not exists attachments (
  ${id},
  message_id text not null references messages(id) on delete cascade,
  file_id text not null references files(id) on delete restrict,
  filename text not null,
  spoiler integer not null default 0,
  description text,
  position integer not null default 0
);
create index if not exists attachments_message on attachments (message_id);
create index if not exists attachments_file on attachments (file_id);

create table if not exists emojis (
  ${id},
  guild_id text not null references guilds(id) on delete cascade,
  name text not null,
  file_id text not null references files(id) on delete restrict,
  animated integer not null default 0,
  creator_id text references users(id) on delete set null,
  ${ts('created_at')},
  unique (guild_id, name)
);

create table if not exists reactions (
  message_id text not null references messages(id) on delete cascade,
  emoji_key text not null,
  user_id text not null references users(id) on delete cascade,
  burst integer not null default 0,
  ${ts('created_at')},
  primary key (message_id, emoji_key, user_id, burst)
);
create index if not exists reactions_user on reactions (user_id);

create table if not exists read_states (
  user_id text not null references users(id) on delete cascade,
  channel_id text not null references channels(id) on delete cascade,
  last_read_message_id text,
  mention_count integer not null default 0,
  ${ts('updated_at')},
  primary key (user_id, channel_id)
);
create index if not exists read_states_channel on read_states (channel_id);

create table if not exists notification_settings (
  ${id},
  user_id text not null references users(id) on delete cascade,
  guild_id text references guilds(id) on delete cascade,
  channel_id text references channels(id) on delete cascade,
  level text not null default 'default' check (level in ('default','all','mentions','nothing')),
  muted_until text,
  suppress_everyone integer not null default 0,
  suppress_roles integer not null default 0,
  keywords text not null default '[]',
  check (guild_id is not null or channel_id is not null)
);
create unique index if not exists notif_guild on notification_settings (user_id, guild_id) where channel_id is null;
create unique index if not exists notif_channel on notification_settings (user_id, channel_id) where channel_id is not null;

create table if not exists invites (
  code text primary key collate nocase,
  guild_id text not null references guilds(id) on delete cascade,
  channel_id text not null references channels(id) on delete cascade,
  inviter_id text references users(id) on delete set null,
  max_uses integer not null default 0 check (max_uses >= 0),
  uses integer not null default 0,
  temporary integer not null default 0,
  expires_at text,
  ${ts('created_at')},
  check (max_uses = 0 or uses <= max_uses)
);
create index if not exists invites_guild on invites (guild_id);

create table if not exists bans (
  guild_id text not null references guilds(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  reason text,
  banned_by text references users(id) on delete set null,
  ${ts('created_at')},
  primary key (guild_id, user_id)
);

create table if not exists audit_log (
  ${id},
  guild_id text not null references guilds(id) on delete cascade,
  actor_id text references users(id) on delete set null,
  action text not null,
  target_id text,
  changes text not null default '[]',
  reason text,
  ${ts('created_at')}
);
create index if not exists audit_log_guild on audit_log (guild_id, id desc);

create table if not exists rtc_usage (
  month text primary key,
  bytes integer not null default 0,
  day text,
  day_bytes integer not null default 0,
  ${ts('updated_at')}
);

-- dev/test only: mail that would have been sent
create table if not exists dev_outbox (
  ${id},
  recipient text not null, subject text not null, body text not null, html text,
  ${ts('created_at')}
);

create table if not exists schema_meta (k text primary key, v text not null);
`;
