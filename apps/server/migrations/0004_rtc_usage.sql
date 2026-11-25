-- Cloudflare Realtime: estimated egress per month, to stay inside the free 1,000 GB
create table if not exists rtc_usage (
  month      text primary key, -- 'YYYY-MM' (UTC)
  bytes      bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table rtc_usage enable row level security;
