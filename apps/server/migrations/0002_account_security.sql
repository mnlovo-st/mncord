-- M2: account security
-- one-time codes get an attempt counter (5 wrong tries kill the code)
alter table verifications add column if not exists attempts smallint not null default 0;
-- TOTP replay protection: a code's 30-second step can be used once
alter table two_factors add column if not exists last_used_step bigint not null default 0;
-- self-service deletion with a 14-day grace period (disabled_at stays for admin bans)
alter table users add column if not exists deletion_requested_at timestamptz;
create index if not exists users_deletion_due on users (deletion_requested_at) where deletion_requested_at is not null;
-- recent devices, for "new sign-in" alerts
create index if not exists sessions_user_device on sessions (user_id, device_name, os, created_at desc);
