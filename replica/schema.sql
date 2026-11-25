-- mncord schema v1 (PostgreSQL 18). © mnlovo.
-- Run order: this file is migration 0001. Drizzle schema in apps/server mirrors it.
-- IDs: uuidv7() (built in since PG18), so ids sort by creation time and message
--      pagination can use "id < cursor" just like snowflakes.
-- Times: timestamptz, UTC. No money anywhere (mncord has no payments).
-- Access rules: enforced in the server data layer (packages/shared/permissions.ts),
--      never by clients. Clients never connect to Postgres. RLS is still enabled with
--      no policies as a backstop, and the app role owns no superuser rights.

create extension if not exists pg_trgm;
create extension if not exists citext;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────────────────────── accounts ─────────────────────────────
-- users/sessions/accounts/verifications/two_factors follow Better Auth's core
-- schema (username + twoFactor + bearer plugins), ids switched to uuid.

create table users (
  id               uuid primary key default uuidv7(),
  email            citext not null unique,
  email_verified   boolean not null default false,
  username         citext not null unique
                   check (username ~ '^[a-z0-9_.]{2,32}$'),
  display_name     text check (char_length(display_name) between 1 and 32),
  avatar_key       text,                  -- file key, may be animated (free for all)
  banner_key       text,
  accent_color     integer,               -- 0xRRGGBB
  profile_theme    jsonb not null default '{}',
  bio              text check (char_length(bio) <= 400),
  pronouns         text check (char_length(pronouns) <= 40),
  locale           text not null default 'en' check (locale in ('en','ar')),
  status           text not null default 'online'
                   check (status in ('online','idle','dnd','invisible')),
  custom_status    jsonb,                 -- {text, emoji, expires_at}
  hide_badges      boolean not null default false,
  date_of_birth    date not null,
  two_factor_enabled boolean not null default false,
  disabled_at      timestamptz,           -- account disabled / deletion pending
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger users_updated before update on users for each row execute function set_updated_at();
create index users_username_trgm on users using gin (username gin_trgm_ops);

create table accounts (                   -- credential store (password provider)
  id            uuid primary key default uuidv7(),
  user_id       uuid not null references users(id) on delete cascade,
  provider_id   text not null default 'credential',
  account_id    text not null,
  password_hash text,                     -- Argon2id (m=64MiB, t=3, p=1)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider_id, account_id)
);
create index on accounts (user_id);

create table sessions (                   -- one row per signed-in device
  id           uuid primary key default uuidv7(),
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   bytea not null unique,     -- SHA-256 of the opaque refresh token
  family_id    uuid not null,             -- rotation family: reuse => revoke family
  device_name  text,
  os           text,
  client_version text,
  ip_prefix    inet,                      -- /24 or /48 only, privacy
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on sessions (user_id) where revoked_at is null;
create index on sessions (family_id);
create index on sessions (expires_at);

create table verifications (              -- email verify, password reset, new-device codes
  id          uuid primary key default uuidv7(),
  identifier  text not null,              -- e.g. 'reset:<user_id>'
  value_hash  bytea not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index on verifications (identifier);
create index on verifications (expires_at);

create table two_factors (
  id            uuid primary key default uuidv7(),
  user_id       uuid not null unique references users(id) on delete cascade,
  secret_enc    bytea not null,           -- AES-256-GCM, key from server env
  backup_codes_hash bytea[] not null,
  created_at    timestamptz not null default now()
);

create table user_settings (              -- synced settings; voice device prefs stay local
  user_id      uuid primary key references users(id) on delete cascade,
  theme        text not null default 'dark' check (theme in ('dark','light','amoled','system')),
  accent       integer,
  density      text not null default 'cozy' check (density in ('cozy','compact')),
  font_scale   smallint not null default 100 check (font_scale between 75 and 150),
  reduced_motion boolean not null default false,
  streamer_mode jsonb not null default '{}',
  friend_request_policy text not null default 'everyone'
               check (friend_request_policy in ('everyone','friends_of_friends','server_members','nobody')),
  dm_policy    text not null default 'server_members'
               check (dm_policy in ('everyone','server_members','friends')),
  guild_folders jsonb not null default '[]',   -- [{id,name,color,guild_ids[]}]
  keybinds     jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);
create trigger user_settings_updated before update on user_settings for each row execute function set_updated_at();

create table relationships (              -- one row per direction
  user_id    uuid not null references users(id) on delete cascade,
  target_id  uuid not null references users(id) on delete cascade,
  type       text not null check (type in ('friend','blocked','incoming','outgoing')),
  nickname   text check (char_length(nickname) <= 32),
  note       text check (char_length(note) <= 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_id),
  check (user_id <> target_id)
);
create index on relationships (target_id);
create trigger relationships_updated before update on relationships for each row execute function set_updated_at();

-- ───────────────────────────── files ─────────────────────────────
create table files (                      -- every stored blob, for quota and cleanup
  id           uuid primary key default uuidv7(),
  owner_id     uuid references users(id) on delete set null,
  key          text not null unique,      -- path on disk/object store
  content_type text not null,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 524288000), -- 500 MB
  sha256       bytea not null,
  width        integer,
  height       integer,
  duration_ms  integer,
  status       text not null default 'pending' check (status in ('pending','ready','quarantined')),
  created_at   timestamptz not null default now()
);
create index on files (owner_id, created_at);
create index on files (sha256);
create index on files (status, created_at) where status = 'pending';

-- ───────────────────────────── servers (guilds) ─────────────────────────────
create table guilds (
  id                    uuid primary key default uuidv7(),
  name                  text not null check (char_length(name) between 2 and 100),
  icon_key              text,
  banner_key            text,
  description           text check (char_length(description) <= 300),
  owner_id              uuid not null references users(id) on delete restrict, -- transfer before delete
  verification_level    smallint not null default 0 check (verification_level between 0 and 4),
  default_notifications text not null default 'mentions' check (default_notifications in ('all','mentions')),
  explicit_filter       smallint not null default 1 check (explicit_filter between 0 and 2),
  system_channel_id     uuid,             -- fk added after channels
  rules_channel_id      uuid,
  afk_channel_id        uuid,
  afk_timeout_s         integer not null default 300,
  vanity_code           citext unique check (vanity_code ~ '^[a-z0-9-]{3,32}$'),
  is_discoverable       boolean not null default false,
  community_enabled     boolean not null default false,
  onboarding            jsonb not null default '{}',
  preferred_locale      text not null default 'en' check (preferred_locale in ('en','ar')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on guilds (owner_id);
create index on guilds (is_discoverable) where is_discoverable;
create trigger guilds_updated before update on guilds for each row execute function set_updated_at();

create table roles (
  id           uuid primary key default uuidv7(),
  guild_id     uuid not null references guilds(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 100),
  color        integer not null default 0,
  icon_key     text,
  hoist        boolean not null default false,
  mentionable  boolean not null default false,
  position     integer not null default 0,
  permissions  bigint not null default 0,  -- bitfield, see packages/shared/permissions.ts
  is_everyone  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on roles (guild_id, position);
create unique index one_everyone_role on roles (guild_id) where is_everyone;
create trigger roles_updated before update on roles for each row execute function set_updated_at();

create table guild_members (
  guild_id       uuid not null references guilds(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  nick           text check (char_length(nick) <= 32),
  avatar_key     text,                     -- per-server profile (free)
  banner_key     text,
  bio            text check (char_length(bio) <= 400),
  joined_at      timestamptz not null default now(),
  timeout_until  timestamptz,
  onboarding_done boolean not null default false,
  server_mute    boolean not null default false,
  server_deaf    boolean not null default false,
  primary key (guild_id, user_id)
);
create index on guild_members (user_id);
create index on guild_members (guild_id, joined_at);

create table member_roles (
  guild_id uuid not null,
  user_id  uuid not null,
  role_id  uuid not null references roles(id) on delete cascade,
  primary key (guild_id, user_id, role_id),
  foreign key (guild_id, user_id) references guild_members(guild_id, user_id) on delete cascade
);
create index on member_roles (role_id);

-- ───────────────────────────── channels ─────────────────────────────
-- One table for guild channels, DMs, group DMs and threads (like Discord's model).
create table channels (
  id                  uuid primary key default uuidv7(),
  guild_id            uuid references guilds(id) on delete cascade,
  type                text not null check (type in
                      ('text','voice','category','announcement','stage','forum',
                       'dm','group_dm','public_thread','private_thread')),
  name                text check (char_length(name) <= 100),
  topic               text check (char_length(topic) <= 1024),
  icon_key            text,                -- group DM icon
  owner_id            uuid references users(id) on delete set null, -- group DM owner / thread creator
  parent_id           uuid references channels(id) on delete cascade, -- category or thread parent
  position            integer not null default 0,
  nsfw                boolean not null default false,
  slowmode_s          integer not null default 0 check (slowmode_s between 0 and 21600),
  bitrate             integer not null default 128000 check (bitrate between 8000 and 510000),
  user_limit          smallint not null default 0 check (user_limit between 0 and 99),
  video_quality       text not null default 'auto' check (video_quality in ('auto','full')),
  last_message_id     uuid,
  -- thread fields
  archived            boolean not null default false,
  locked              boolean not null default false,
  auto_archive_min    integer not null default 4320 check (auto_archive_min in (60,1440,4320,10080)),
  applied_tags        uuid[] not null default '{}',
  -- forum fields
  default_sort        text check (default_sort in ('latest_activity','creation')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((type in ('dm','group_dm')) = (guild_id is null))
);
create index on channels (guild_id, position);
create index on channels (parent_id);
create index on channels (parent_id, archived) where type in ('public_thread','private_thread');
create trigger channels_updated before update on channels for each row execute function set_updated_at();

alter table guilds
  add foreign key (system_channel_id) references channels(id) on delete set null,
  add foreign key (rules_channel_id)  references channels(id) on delete set null,
  add foreign key (afk_channel_id)    references channels(id) on delete set null;

create table channel_recipients (         -- DM / group DM members, private thread members
  channel_id uuid not null references channels(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  closed     boolean not null default false,  -- hidden from DM list
  added_at   timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index on channel_recipients (user_id);

create table dm_pairs (                   -- guarantees exactly one 1:1 DM per pair (race-safe)
  user_low   uuid not null references users(id) on delete cascade,
  user_high  uuid not null references users(id) on delete cascade,
  channel_id uuid not null unique references channels(id) on delete cascade,
  primary key (user_low, user_high),
  check (user_low < user_high)
);

create table permission_overwrites (
  channel_id  uuid not null references channels(id) on delete cascade,
  target_id   uuid not null,              -- role id or user id
  target_type text not null check (target_type in ('role','member')),
  allow       bigint not null default 0,
  deny        bigint not null default 0,
  primary key (channel_id, target_id),
  check ((allow & deny) = 0)
);
create index on permission_overwrites (target_id);

create table forum_tags (
  id         uuid primary key default uuidv7(),
  channel_id uuid not null references channels(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 20),
  emoji      text,
  moderated  boolean not null default false,
  position   integer not null default 0
);
create index on forum_tags (channel_id);

create table user_pins (                  -- pinned DMs and pinned channels (requested features)
  user_id    uuid not null references users(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  position   integer not null default 0,
  primary key (user_id, channel_id)
);

-- ───────────────────────────── messages ─────────────────────────────
create table messages (
  id               uuid primary key default uuidv7(),
  channel_id       uuid not null references channels(id) on delete cascade,
  author_id        uuid references users(id) on delete set null,  -- null = deleted user
  webhook_id       uuid,
  type             text not null default 'default' check (type in
                   ('default','reply','system_join','system_pin','call','thread_created','forward')),
  content          text not null default '' check (char_length(content) <= 4000),
  reply_to_id      uuid references messages(id) on delete set null,
  forwarded_from   jsonb,                 -- snapshot {channel_id,message_id,content,author}
  embeds           jsonb not null default '[]',
  mention_everyone boolean not null default false,
  mention_roles    uuid[] not null default '{}',
  pinned           boolean not null default false,
  flags            integer not null default 0,     -- suppress_embeds, silent, …
  nonce            text,                  -- client id for optimistic send / dedupe
  edited_at        timestamptz,
  created_at       timestamptz not null default now(),
  search           tsvector generated always as (to_tsvector('simple', content)) stored
);
create index on messages (channel_id, id desc);
create index on messages (author_id, id desc);
create index on messages (channel_id) where pinned;
create index messages_search on messages using gin (search);
create index messages_trgm on messages using gin (content gin_trgm_ops); -- Arabic substring search
create unique index messages_nonce on messages (channel_id, author_id, nonce) where nonce is not null;

create table message_mentions (           -- powers Inbox + mention badges
  message_id uuid not null references messages(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  primary key (user_id, message_id)
);

create table attachments (
  id          uuid primary key default uuidv7(),
  message_id  uuid not null references messages(id) on delete cascade,
  file_id     uuid not null references files(id) on delete restrict,
  filename    text not null check (char_length(filename) <= 255),
  spoiler     boolean not null default false,
  description text check (char_length(description) <= 1024),
  position    smallint not null default 0
);
create index on attachments (message_id);
create index on attachments (file_id);

create table emojis (
  id         uuid primary key default uuidv7(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  name       text not null check (name ~ '^[A-Za-z0-9_]{2,32}$'),
  file_id    uuid not null references files(id) on delete restrict,
  animated   boolean not null default false,
  creator_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (guild_id, name)
);

create table stickers (
  id         uuid primary key default uuidv7(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 30),
  tags       text,
  file_id    uuid not null references files(id) on delete restrict,
  format     text not null check (format in ('png','apng','gif','webp','lottie')),
  creator_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on stickers (guild_id);

create table sounds (                     -- soundboard
  id         uuid primary key default uuidv7(),
  guild_id   uuid references guilds(id) on delete cascade, -- null = built-in mncord sound
  name       text not null check (char_length(name) between 2 and 32),
  emoji      text,
  volume     real not null default 1 check (volume between 0 and 1),
  file_id    uuid not null references files(id) on delete restrict,
  creator_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on sounds (guild_id);

create table reactions (
  message_id uuid not null references messages(id) on delete cascade,
  emoji_key  text not null,               -- unicode char or custom emoji uuid
  user_id    uuid not null references users(id) on delete cascade,
  burst      boolean not null default false,       -- super reaction (free)
  created_at timestamptz not null default now(),
  primary key (message_id, emoji_key, user_id, burst)
);
create index on reactions (user_id);

create table read_states (
  user_id              uuid not null references users(id) on delete cascade,
  channel_id           uuid not null references channels(id) on delete cascade,
  last_read_message_id uuid,
  mention_count        integer not null default 0,
  updated_at           timestamptz not null default now(),
  primary key (user_id, channel_id)
);
create index on read_states (channel_id);

create table bookmarks (                  -- saved messages (mncord extra)
  user_id    uuid not null references users(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  note       text check (char_length(note) <= 200),
  remind_at  timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index on bookmarks (remind_at) where remind_at is not null;

create table scheduled_messages (         -- mncord extra
  id          uuid primary key default uuidv7(),
  user_id     uuid not null references users(id) on delete cascade,
  channel_id  uuid not null references channels(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 4000),
  send_at     timestamptz not null,
  status      text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  sent_message_id uuid references messages(id) on delete set null,
  error       text,
  created_at  timestamptz not null default now()
);
create index on scheduled_messages (send_at) where status = 'pending';
create index on scheduled_messages (user_id);

create table notification_settings (      -- per server / per channel overrides
  id         uuid primary key default uuidv7(),
  user_id    uuid not null references users(id) on delete cascade,
  guild_id   uuid references guilds(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  level      text not null default 'default' check (level in ('default','all','mentions','nothing')),
  muted_until timestamptz,
  suppress_everyone boolean not null default false,
  suppress_roles    boolean not null default false,
  keywords   text[] not null default '{}',
  check (guild_id is not null or channel_id is not null)
);
create unique index on notification_settings (user_id, guild_id) where channel_id is null;
create unique index on notification_settings (user_id, channel_id) where channel_id is not null;

-- ───────────────────────────── invites & moderation ─────────────────────────────
create table invites (
  code        citext primary key check (code ~ '^[A-Za-z0-9]{8,16}$'),
  guild_id    uuid not null references guilds(id) on delete cascade,
  channel_id  uuid not null references channels(id) on delete cascade,
  inviter_id  uuid references users(id) on delete set null,
  max_uses    integer not null default 0 check (max_uses >= 0),
  uses        integer not null default 0,
  temporary   boolean not null default false,
  expires_at  timestamptz,                 -- null = never
  created_at  timestamptz not null default now(),
  check (max_uses = 0 or uses <= max_uses)  -- the check makes "two people take the last use" fail safely
);
create index on invites (guild_id);
create index on invites (expires_at) where expires_at is not null;

create table bans (
  guild_id   uuid not null references guilds(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  reason     text check (char_length(reason) <= 512),
  banned_by  uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create table audit_log (
  id         uuid primary key default uuidv7(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  actor_id   uuid references users(id) on delete set null,
  action     text not null,               -- 'member_ban_add', 'role_update', …
  target_id  uuid,
  changes    jsonb not null default '[]',
  reason     text check (char_length(reason) <= 512),
  created_at timestamptz not null default now()
);
create index on audit_log (guild_id, id desc);
create index on audit_log (guild_id, actor_id);

create table automod_rules (
  id           uuid primary key default uuidv7(),
  guild_id     uuid not null references guilds(id) on delete cascade,
  name         text not null,
  trigger_type text not null check (trigger_type in ('keyword','spam','mention_spam','link')),
  trigger_meta jsonb not null default '{}',    -- keywords, regex, allow list, mention limit
  actions      jsonb not null default '[]',    -- block, alert(channel), timeout(seconds)
  enabled      boolean not null default true,
  exempt_roles uuid[] not null default '{}',
  exempt_channels uuid[] not null default '{}',
  creator_id   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on automod_rules (guild_id) where enabled;
create trigger automod_updated before update on automod_rules for each row execute function set_updated_at();

create table webhooks (
  id         uuid primary key default uuidv7(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  avatar_key text,
  token_hash bytea not null,
  creator_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on webhooks (channel_id);

create table scheduled_events (
  id          uuid primary key default uuidv7(),
  guild_id    uuid not null references guilds(id) on delete cascade,
  channel_id  uuid references channels(id) on delete set null,
  creator_id  uuid references users(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 100),
  description text check (char_length(description) <= 1000),
  location    text,
  start_at    timestamptz not null,
  end_at      timestamptz,
  status      text not null default 'scheduled' check (status in ('scheduled','active','completed','cancelled')),
  cover_key   text,
  created_at  timestamptz not null default now(),
  check (end_at is null or end_at > start_at)
);
create index on scheduled_events (guild_id, start_at);
create index on scheduled_events (status, start_at) where status in ('scheduled','active');

create table event_subscribers (
  event_id uuid not null references scheduled_events(id) on delete cascade,
  user_id  uuid not null references users(id) on delete cascade,
  primary key (event_id, user_id)
);
create index on event_subscribers (user_id);

create table reports (                    -- user reports to server mods / to mncord admin
  id          uuid primary key default uuidv7(),
  reporter_id uuid references users(id) on delete set null,
  guild_id    uuid references guilds(id) on delete cascade,
  message_id  uuid references messages(id) on delete set null,
  target_user uuid references users(id) on delete set null,
  reason      text not null check (char_length(reason) <= 1000),
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at  timestamptz not null default now()
);
create index on reports (status, created_at);

-- Voice states, presence and typing live in server memory (ephemeral), not in Postgres.

-- Backstop: RLS on, no policies. Only the server's table-owner role can read/write.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
