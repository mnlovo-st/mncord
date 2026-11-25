# Architecture: mncord by mnlovo (a rebuild of Discord's core features)

Inputs: `recon.md` (42 screens, 14 flows), `features.csv` (125 rows). Target: Windows desktop,
English + Arabic (RTL), every perk free, **$0 running cost**.

## Shape in one picture

```
 Windows PC (mncord.exe, Electron)                       One free VM (Oracle Always Free, ARM64, Ubuntu)
 ┌───────────────────────────────────┐   HTTPS + WSS    ┌──────────────────────────────────────────────┐
 │ React UI (AR/EN, RTL)             │ ───────────────▶ │ Caddy (TLS, HTTP/3)                          │
 │ Audio chain: DeepFilterNet → gate │                  │   ├─ /api/v1/*  ┐                            │
 │   → EQ → compressor → limiter     │                  │   ├─ /gateway   ├─ mncord-server (Node 24,   │
 │ Screen capture 4K120 (HW encode)  │                  │   └─ /files/*   ┘   Fastify + ws, one process)│
 │ LiveKit client SDK                │   WebRTC UDP     │ LiveKit SFU (forwards media, simulcast/SVC)  │
 │ Tokens in Windows DPAPI           │ ═══════════════▶ │   TURN/TLS on 443 fallback                   │
 └───────────────────────────────────┘                  │ PostgreSQL 18     files on 200 GB block vol. │
          ▲ auto-update (GitHub Releases)               │ nightly encrypted backup → Oracle Object St. │
                                                        └──────────────────────────────────────────────┘
```

One server process, one database, one VM. No microservices, no Redis until one process stops
being enough (that is thousands of concurrent users away).

## Stack

| layer | choice | why |
| --- | --- | --- |
| desktop shell | **Electron** (latest stable) + electron-vite | Bundled Chromium = same WebRTC everywhere; `desktopCapturer` + system-audio loopback on Windows; best-known path to a Discord-style app. Tauri's WebView2 lacks loopback audio capture. |
| UI | React 19 + TypeScript (strict) + Tailwind 4 (logical props for RTL) + Radix primitives + Framer Motion | Accessible menus/popovers like Discord's, animations, `ms-`/`me-` utilities so Arabic mirrors for free. |
| state / data | TanStack Query (REST) + Zustand (gateway cache) | Gateway events patch the cache; no refetch storms. |
| i18n | i18next + ICU plurals, `dir="rtl"` switch, IBM Plex Sans Arabic + Inter (both OFL, bundled) | Arabic plurals have 6 forms; ICU handles them. |
| shared code | `packages/shared`: zod schemas, permission bitfield, gateway event types | One source of truth; server and client can't drift. |
| server | Node 24 + Fastify 5 + `ws` | REST + WebSocket gateway in one process; typed with zod. |
| database | **PostgreSQL 18** on the VM; dev/tests use embedded PGlite (no install). Thin parameterised-SQL data layer (changed from Drizzle in M1) | Built-in `uuidv7()` (time-ordered ids), full-text + trigram search for Arabic. Self-hosted = no 500 MB cap and no auto-pause (Supabase free has both). |
| auth | **Own session layer on vetted primitives** (changed in M1): `@node-rs/argon2` (Argon2id), `jose` (EdDSA JWT), rotating refresh tokens with reuse detection | Better Auth's session model didn't fit desktop bearer flows plus our token-family revocation. No crypto is hand-written; the session logic is covered by tests. |
| voice / video / screen | **Cloudflare Realtime SFU** (free 1,000 GB/month, edge near the UAE), every call proxied by our server which holds the secret and enforces permissions. *Changed 2026-11-25: the Oracle home region turned out to be Brazil, too far for live media; LiveKit self-hosting was the original plan* | Real SFU: simulcast, VP9/AV1 SVC, Opus up to 510 kbps, E2EE support, server-side mute, webhooks. The server forwards packets, so 4K costs bandwidth, not CPU. |
| audio processing | AudioWorklet chain in the renderer: DeepFilterNet3 (WASM, MIT/Apache) with RNNoise fallback, then gate, EQ, compressor, limiter | All on the user's PC, $0, better than an on/off toggle. |
| files | local disk on the VM's free 200 GB block volume, served by the server via signed URLs | No credit card needed (R2 asks for one). Images re-encoded to WebP/AVIF thumbnails with `sharp`. |
| email | SMTP behind an interface. Default: a dedicated Gmail account with an app password (500/day free). Swap: Brevo free (300/day) | Only for verify / reset / new-device alerts. |
| jobs | in-process scheduler (`croner`) + a `jobs` loop; backups via systemd timer | Nothing to pay for, nothing extra to run. |
| hosting | Oracle Cloud Always Free ARM VM + Docker Compose (caddy, postgres, server); media on Cloudflare | The only free tier with UDP ports, a public IPv4, ~10 TB egress and a persistent disk. |
| domain / TLS | Free: `mncord.duckdns.org` (DuckDNS) + Let's Encrypt via Caddy. Optional ~40 AED/yr own domain later → adds Cloudflare DNS and DDoS proxy for the API | Keeps it at 0 AED; the app reads the server URL from config, so switching later is one release. |
| crash reports | Sentry free plan (5k events/mo), PII scrubbed, opt-out toggle | Real stack traces from users' PCs. |
| CI / release | GitHub Actions: lint + typecheck + tests → build NSIS `.exe` on `windows-latest` → GitHub Release → `electron-updater` | Free (unlimited on public repos; 2,000 min/mo private, Windows counts 2×). |
| code signing | SignPath Foundation (free for open-source repos). Until then: unsigned + SmartScreen notice | The only $0 signing route. Needs the repo public with an OSI licence. |
| repo | **Public** (owner decision 2026-11-25). Code under AGPL-3.0 (proposed; forks must stay open, including hosted forks). The mncord name, mnlovo logo, logo video, sounds and art are **excluded** from the licence: "© mnlovo, all rights reserved" in `assets/LICENSE-ASSETS.md` | Free Actions minutes + SignPath eligibility; brand stays mnlovo's. Secrets never in the repo (env files + GitHub encrypted secrets). |
| tests | Vitest (shared + server), Playwright for Electron (e2e), k6 for gateway load | |

Repo layout (pnpm workspaces):
```
mnvcord/
  apps/desktop      Electron main + preload + React renderer
  apps/server       Fastify API, gateway, jobs, Drizzle schema + migrations
  packages/shared   zod schemas, permissions, events, i18n keys
  infra/            docker-compose.yml, Caddyfile, livekit.yaml, backup scripts, VM setup
  replica/          this planning folder (not shipped)
```

## Schema

Tables: **37** (validated on Postgres: creates cleanly, constraints tested). Full SQL in
[schema.sql](schema.sql), migration 0001.

Access rules: **data-layer checks**. Clients never touch Postgres. Every route and gateway
event goes through one function:

```ts
// packages/shared/permissions.ts (Discord-compatible algorithm, own code)
computePermissions(member, guild, channel?) =
  owner                             → ALL
  base = @everyone.permissions | OR(member.roles.permissions)
  base has ADMINISTRATOR            → ALL
  channel? apply overwrites: @everyone deny/allow → role denies/allows (OR'd) → member deny/allow
  member timed out                  → only VIEW_CHANNEL | READ_MESSAGE_HISTORY
  no VIEW_CHANNEL                   → 0 (also hides the channel)
```
Plus the hierarchy rule: you can only manage roles/members strictly below your highest role.
RLS is switched on with no policies as a backstop: a leaked read-only DB credential gets nothing.

Ephemeral state (in server memory, rebuilt on reconnect): voice states, presence, typing,
gateway sessions with a resume buffer.

Key constraints the recon called for:
- one 1:1 DM per pair → `dm_pairs (user_low, user_high)` primary key, so two simultaneous
  "Message" clicks can't create two DMs
- last invite use → `check (uses <= max_uses)` + `update … set uses = uses + 1 where …` in the join transaction
- duplicate sends on flaky network → unique `(channel_id, author_id, nonce)`
- case-insensitive usernames → `citext unique`
- one `@everyone` role per guild → partial unique index
- `allow & deny = 0` on overwrites

## API

REST under `https://<host>/api/v1`, JSON, `Authorization: Bearer <access token>` (15-min JWT,
EdDSA). Refresh tokens are opaque, rotated on every use, and reuse revokes the whole family.
"member" = in the guild; "perm X" = `computePermissions` includes X.

### F01 / F12 Account

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /auth/register | create account, send verify mail | anyone (rate 3/h/IP) | email, username, password, display_name, dob | session tokens | F01 |
| POST /auth/login | sign in | anyone (5/15 min per account+IP, then captcha-free cooldown) | login, password | tokens or `{mfa_required, ticket}` | F01 |
| POST /auth/mfa/totp | finish 2FA login | holder of ticket | ticket, code or backup code | tokens | F01 |
| POST /auth/refresh | rotate tokens | holder of refresh token | refresh_token | new pair | — |
| POST /auth/logout | revoke this session | self | — | 204 | — |
| POST /auth/verify-email | confirm email | link holder | token | 204 | F01 |
| POST /auth/forgot · /auth/reset | reset password, revoke all sessions | anyone / link holder | email · token+password | 204 | F12 |
| GET/DELETE /users/@me/sessions[/:id] | list / revoke devices | self | — | sessions | S24 |
| POST/DELETE /users/@me/mfa | enable (verify code) / disable (needs password) | self | secret, code / password | backup codes | S24 |
| GET/PATCH /users/@me | profile, username, email (re-verify), password | self (sensitive changes need password) | fields | user | S24 |
| DELETE /users/@me | schedule deletion (14-day grace) | self + password | — | 204 | — |
| GET/PATCH /users/@me/settings | synced settings | self | fields | settings | S24 |
| GET /users/:id/profile | full profile + mutuals | any user not blocking you | — | profile | S17 S18 |

### F02 / F13 Friends and DMs

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /users/@me/relationships | friends, pending, blocked | self | — | list | F02 |
| POST /users/@me/relationships | send request by username | self (respects target's policy, 10/min) | username | relationship | F02 |
| PUT /users/@me/relationships/:id | accept / block | self | type | relationship | F02 |
| DELETE /users/@me/relationships/:id | remove / cancel / unblock | self | — | 204 | F02 |
| PATCH /users/@me/relationships/:id | nickname, note | self | — | — | — |
| POST /users/@me/channels | open DM (idempotent via dm_pairs) or group DM | self (target's dm_policy) | recipient_ids | channel | F02 |
| PUT/DELETE /channels/:id/recipients/:uid | add / remove group member | group owner (remove), member (add) | — | 204 | S09 |
| PUT/DELETE /users/@me/pins/:channel_id | pin a DM or channel | self | position | 204 | requested |

### F03 / F04 Servers and invites

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /guilds | create from template (channels + @everyone) | any verified user | name, icon, template | guild | F03 |
| GET/PATCH/DELETE /guilds/:id | read / settings / delete | member / MANAGE_GUILD / owner+password | fields | guild | S22 |
| POST /guilds/:id/transfer | give ownership | owner + password (+2FA) | user_id | guild | S22 |
| GET /guilds/:id/members?after= | paginated members | member | — | members | S17 |
| PATCH /guilds/:id/members/:uid | nick, roles, timeout, server mute/deaf, move voice | perms per field + hierarchy | fields | member | F09 |
| DELETE /guilds/:id/members/:uid | kick | KICK_MEMBERS + hierarchy | reason | 204 | F09 |
| DELETE /users/@me/guilds/:id | leave | member (not owner) | — | 204 | — |
| PUT/DELETE /guilds/:id/bans/:uid | ban (+purge 0–7 days) / unban | BAN_MEMBERS + hierarchy | reason, purge_s | 204 | F09 |
| POST /channels/:id/invites | create invite | CREATE_INSTANT_INVITE | max_age, max_uses, temporary | invite | F03 |
| GET /invites/:code | preview | anyone signed in | — | guild preview, counts | F04 |
| POST /invites/:code | join (checks ban, expiry, uses, verification level in one transaction) | signed-in user | — | guild | F04 |
| DELETE /invites/:code | revoke | MANAGE_GUILD or inviter | — | 204 | S22 |
| GET /discovery?q=&category= | public servers | signed in | — | guilds | S21 |
| PUT /guilds/:id/onboarding | rules, role picks | MANAGE_GUILD | json | — | S35 |

### F05 Channels and messages

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /guilds/:id/channels | create channel/category | MANAGE_CHANNELS | type, name, parent, overwrites | channel | S10 |
| PATCH /guilds/:id/channels (bulk) | reorder / move | MANAGE_CHANNELS | [{id, position, parent_id}] | 204 | — |
| PATCH/DELETE /channels/:id | settings / delete | MANAGE_CHANNELS | fields | channel | S23 |
| PUT/DELETE /channels/:id/permissions/:target | overwrites | MANAGE_ROLES (can't grant what you lack) | allow, deny, type | 204 | F08 |
| GET /channels/:id/messages?before=&after=&around=&limit≤100 | history | VIEW_CHANNEL + READ_MESSAGE_HISTORY | — | messages | F05 |
| POST /channels/:id/messages | send (nonce dedupe, slowmode, automod, mentions) | SEND_MESSAGES (+ATTACH_FILES, MENTION_EVERYONE) | content, nonce, reply_to, attachments[], flags | message | F05 |
| PATCH /channels/:id/messages/:mid | edit | author | content | message | F05 |
| DELETE /channels/:id/messages/:mid | delete | author or MANAGE_MESSAGES | — | 204 | F05 |
| POST /channels/:id/messages/bulk-delete | purge ≤100, <14 days | MANAGE_MESSAGES | ids | 204 | F09 |
| PUT/DELETE /channels/:id/messages/:mid/reactions/:emoji/@me | react | ADD_REACTIONS (new emoji) / READ | burst? | 204 | F05 |
| DELETE …/reactions[/:emoji] | clear | MANAGE_MESSAGES | — | 204 | — |
| PUT/DELETE /channels/:id/pins/:mid · GET /channels/:id/pins | pin | MANAGE_MESSAGES / VIEW | — | — | S27 |
| POST /channels/:id/messages/:mid/forward | forward snapshot | VIEW source + SEND target | target_channel_id | message | — |
| POST /channels/:id/typing | typing indicator (10s) | SEND_MESSAGES | — | 204 | F05 |
| POST /channels/:id/ack | mark read | VIEW | message_id | 204 | — |
| GET /search?guild_id|channel_id&q&from&has&before&after | search (FTS + trigram) | only channels you can view | filters | results | S26 |
| GET /users/@me/mentions | inbox | self | — | messages | S28 |
| POST /channels/:id/threads · /messages/:mid/threads | create thread / forum post | CREATE_PUBLIC_THREADS / SEND in forum | name, tags, first message | channel | S15 S16 |
| PATCH /channels/:thread | archive, lock, tags | creator or MANAGE_THREADS | — | — | S16 |
| CRUD /users/@me/bookmarks | saved messages | self | message_id, note, remind_at | — | S41 |
| CRUD /users/@me/scheduled-messages | send later | self (SEND checked at send time too) | channel_id, content, send_at | — | requested |

### Files

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /uploads | reserve upload (size/type check, per-user quota) | signed in | filename, size, type | upload_id, url | S30 |
| PUT /uploads/:id | stream bytes; sha256 + magic-byte sniff; image re-encode; EXIF stripped | uploader | bytes | file | S30 |
| GET /files/:key?sig&exp | serve (signed, expiring, `Content-Disposition` safe, `nosniff`) | link holder | — | bytes | — |

### F06 / F07 / F10 Voice, video, screen share

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /voice/:channel_id/join | checks CONNECT, user limit, bans; returns LiveKit token with grants: canPublish mic only if SPEAK, camera if STREAM, screen if STREAM; max bitrate from channel | member | — | `{livekit_url, token}` | F06 |
| POST /voice/:channel_id/move | move a user | MOVE_MEMBERS | user_id, to | 204 | — |
| POST /voice/:channel_id/soundboard/:sound_id | play sound to room | USE_SOUNDBOARD | — | 204 | S33 |
| POST /calls/:dm_id/ring · /calls/:dm_id/stop | ring DM recipients | recipient | — | 204 | F13 |
| CRUD /guilds/:id/sounds · emojis · stickers | assets | MANAGE_GUILD_EXPRESSIONS | file, name | — | S22 |

Screen share quality presets (client-side, server enforces only max bitrate):
720p30 · 1080p60 · 1440p60 · 1440p120 · 4K60 · **4K120**. Codec preference AV1 → H.264 (HW) → VP9.
Simulcast/SVC sends lower layers so weak viewers get 1080p/720p instead of stutter.

### F08 / F09 Roles and moderation

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| CRUD /guilds/:id/roles, PATCH positions | roles | MANAGE_ROLES + hierarchy | fields | role | F08 |
| GET /guilds/:id/audit-log?before&user&action | audit log | VIEW_AUDIT_LOG | — | entries | F09 |
| CRUD /guilds/:id/automod/rules | AutoMod | MANAGE_GUILD | trigger, actions | rule | F09 |
| CRUD /channels/:id/webhooks, POST /webhooks/:id/:token | webhooks in | MANAGE_WEBHOOKS / token holder (rate 30/min) | — | — | could |
| CRUD /guilds/:id/events, PUT …/subscribers/@me | events | MANAGE_EVENTS / member | — | — | S34 |
| POST /reports | report message/user | signed in (5/h) | target, reason | 204 | — |

### Gateway (`wss://<host>/gateway`, JSON frames, zlib-stream optional)

Client → server: `IDENTIFY{token}` · `RESUME{session_id, seq}` · `HEARTBEAT` · `PRESENCE_UPDATE` ·
`VOICE_STATE_UPDATE{self_mute, self_deaf, self_video, self_stream}` · `REQUEST_MEMBERS{guild, query}` ·
`SUBSCRIBE_CHANNEL{id}` (member list ranges for big servers).

Server → client: `READY` (user, settings, guilds + channels you can see, DMs, read states, relationships) ·
`RESUMED` · `GUILD_CREATE/UPDATE/DELETE` · `CHANNEL_*` · `THREAD_*` · `MESSAGE_CREATE/UPDATE/DELETE/DELETE_BULK` ·
`MESSAGE_REACTION_ADD/REMOVE` · `TYPING_START` · `PRESENCE_UPDATE` · `GUILD_MEMBER_ADD/UPDATE/REMOVE` ·
`GUILD_ROLE_*` · `VOICE_STATE_UPDATE` · `CALL_CREATE/DELETE` (ring) · `RELATIONSHIP_*` ·
`USER_SETTINGS_UPDATE` (multi-device sync) · `READ_STATE_UPDATE` · `SESSIONS_REPLACE` (force logout).

Fan-out is permission-aware: a message event goes only to sockets whose user can VIEW that
channel (cached per guild, invalidated on role/overwrite change). Heartbeat 41s, resume buffer 60s.

### Webhooks in, out, jobs

Webhooks in: **LiveKit** `participant_joined/left`, `track_published` (HMAC-verified,
idempotent by event id) → voice states, "LIVE" badges, `call` system message. Incoming user
webhooks (`POST /webhooks/:id/:token`).
Webhooks out: none in v1.

Jobs:

| job | schedule | does |
| --- | --- | --- |
| scheduled-messages | every 5 s | send due rows with `FOR UPDATE SKIP LOCKED`, re-check perms |
| bookmark-reminders | every 1 min | DM-yourself reminder |
| thread-autoarchive | every 5 min | archive idle threads |
| invite-expiry | hourly | delete expired invites |
| session-cleanup | hourly | drop expired/revoked sessions, verifications |
| orphan-files | hourly | delete `pending` uploads older than 24 h |
| account-deletion | daily | anonymise accounts past 14-day grace (messages stay, author → "Deleted User") |
| timeouts-expiry | every 1 min | emit member update when timeouts end |
| events-status | every 1 min | start/complete scheduled events |
| backup | daily 04:00 (systemd) | `pg_dump` → `age` encrypt → Oracle Object Storage (free 20 GB), keep 14 daily + 8 weekly; monthly restore test |
| disk-watch | every 15 min | alert owner if block volume > 80% |

## Security plan (the owner asked for strong protection)

- **Passwords:** Argon2id, min 8 chars + breached-password check against the free HIBP k-anonymity API (only a 5-char hash prefix leaves the server).
- **Tokens:** 15-min access JWT, rotating refresh token with reuse detection; stored in Windows DPAPI via Electron `safeStorage`, never in localStorage.
- **2FA:** TOTP + 10 one-time backup codes; required for owner-level actions on big servers.
- **New-device email** with "this wasn't me" one-click session revoke.
- **Rate limits** on every route (token bucket per user + per IP), stricter on auth, invites, friend requests, uploads.
- **Input:** zod validation on every route and gateway frame; message rendering via a Markdown parser that outputs React nodes, **never** raw HTML; links open externally after a confirm for non-mncord domains.
- **Electron hardening:** `contextIsolation`, `sandbox`, `nodeIntegration:false`, strict CSP, no `remote`, a typed allow-list preload bridge, `will-navigate`/`setWindowOpenHandler` blocked, permission handler grants only mic/camera/screen to our own origin, Electron fuses (no `RunAsNode`, ASAR integrity, cookie encryption).
- **Updates:** electron-updater verifies the signed release manifest (SHA-512); downgrade blocked.
- **Uploads:** size + magic-byte checks, images re-encoded (kills polyglots, strips EXIF/GPS), served with `nosniff` and `attachment` for non-media, never from the API origin's cookies.
- **Link embeds:** fetched server-side with SSRF guard (block private/link-local IPs after DNS resolve), 1 MB / 3 s limits.
- **Server:** non-root containers, only 80/443/UDP media ports open (Oracle security list + ufw), SSH key-only + fail2ban, Postgres not exposed, secrets in env files outside the repo, automatic security updates, `npm audit`/Dependabot in CI.
- **Calls:** DTLS-SRTP always (WebRTC default). LiveKit E2EE for DM calls in phase 3.
- **Moderation safety:** blocks are enforced server-side (no DMs, no friend requests, messages collapsed), report flow, owner admin panel.

## The parts that bite

- **Time zones:** everything stored UTC; client formats in the user's locale. Arabic gets `ar` with Latin digits by default and an option for Arabic-Indic digits. Scheduled messages and events store UTC and show local time; the UAE has no DST, but other users do.
- **Idempotency:** message `nonce` unique index; LiveKit webhooks deduped by id; invite join is one transaction; DM creation through `dm_pairs`; scheduled jobs use `SKIP LOCKED` so a restart can't double-send.
- **Races:** last invite use (check constraint), two DMs at once (pk), role reorder (single bulk transaction), editing a deleted message (404), voice join while full (LiveKit `maxParticipants` + server check).
- **Rate limits:** ours, per route. The free Gmail SMTP cap (500/day) limits sign-ups per day, so the email interface queues and can switch to Brevo.
- **File size limits:** 500 MB per file for everyone, but a 200 GB disk fills up: per-user quota (e.g. 5 GB), video above 100 MB transcoded, and a server-wide retention policy the owner can set. This is the one "unlimited" that physics won't give.
- **Search:** Postgres has no Arabic stemmer, so it uses `simple` FTS + trigram for substring matches. Normalise Arabic before indexing (أ/إ/آ→ا, ة→ه, ى→ي, strip tashkeel) in a generated column during M4.
- **Realtime:** single process holds all sockets; graceful restarts use `RESUME` so users don't notice deploys. Measured with k6 before release.
- **Offline:** outgoing messages queued in IndexedDB with nonce, retried on reconnect; failed ones show "retry/delete".
- **4K120 bandwidth:** the uploader needs ~25–50 Mbps up; each viewer of the top layer pulls the same from the VM. 10 TB/month egress ≈ 450 viewer-hours of 4K120 at 50 Mbps. So the default is 1080p60, with 4K120 opt-in per stream and an owner-set cap.
- **Chromium capture at 120 fps (M0 measured, 2026-11-25):** capped at about 60 fps (48 with getDisplayMedia, 57 with the desktop source). Decision: ≤60 fps stays in Electron; >60 fps Go Live uses the `mncord-capture` sidecar (Rust: WGC → NVENC/AMF/QSV → LiveKit Rust SDK). HEVC is the only hardware codec in Electron WebRTC, so the default is H.265 with an H.264 backup codec. See `spike/M0-results.md`. Original note: Chromium's capturer and encoder may cap fps on some GPUs. M0 spike measures it; fallback is a native capture helper (Windows Graphics Capture + NVENC/AMF) published as a LiveKit track. This is the riskiest item and gets tested first.
- **Email deliverability:** Gmail-sent mail can hit spam folders. Verification is not required to chat (only to create servers / DM non-friends), so a lost mail never locks someone out.
- **Multi-tenancy:** every guild query filters by guild id via membership; permission cache invalidation on role/overwrite/member changes is the classic bug, so it gets unit tests on the permission function plus e2e tests.
- **GDPR-style deletion:** user deletion anonymises the account and removes profile/files; messages stay as "Deleted User" (like Discord), with an option to bulk-delete own messages first.
- **RTL:** mixed Arabic/English messages use `dir="auto"` per message; icons that mean direction (back, reply arrow) flip and others don't; code blocks stay LTR.
- **UAE VoIP:** media runs on standard WebRTC/TURN ports with no special evasion. Some networks may still throttle UDP; TURN over TLS on 443 is the fallback. The legal note in recon.md stands.

## Build order

0. **M0 spike (prove the riskiest parts, ~days):** Electron window + LiveKit on the VM: 2 users talk; one shares the screen at 4K120 HW-encoded, and the receiver measures fps/bitrate in the stats panel; DeepFilterNet worklet on the mic. Pass/fail decides whether the native capture helper is needed.
1. **M1 vertical slice:** register → login → create server → send a message seen live by a second user → click voice channel and talk.
   Screens S01 S02 S03 S07 S10 S11 S19 · tables users, accounts, sessions, guilds, roles, guild_members, channels, messages · routes /auth/register|login|refresh, POST /guilds, GET/POST messages, /voice/join, gateway READY/MESSAGE_CREATE/VOICE_STATE_UPDATE.
2. **Must-haves by area:**
   - M2 Accounts & security: S04 S05 S06 S24 (account, devices) · 2FA, reset, verify, sessions, rate limits, DPAPI storage, Electron hardening.
   - M3 Social & DMs: S07 S08 S09 S17 S36 · relationships, dm_pairs, channel_recipients · DM calls + ring.
   - M4 Messaging core: S10 S26 S27 S28 S29 S30 S38 · attachments, files, reactions, emojis/stickers, read_states, mentions, search, offline queue, markdown.
   - M5 Servers & permissions: S20 S22 S23 S32 · roles, member_roles, overwrites, invites, bans, kick/timeout, folders.
   - M6 Voice & Go Live: S11 S12 S13 S25 S40 · mic suite (noise AI, gate, EQ, comp), per-user volume 400%, PTT global hotkey, screen share up to 4K120, stream audio.
   - M7 App polish: S31 S37 · themes, compact mode, keybinds, notifications/toasts, Ctrl+K, context menus, tray + autostart, **Arabic RTL pass over every screen**.
   - M8 Ship: NSIS installer, auto-update, Sentry, CI, infra scripts, backups, first GitHub Release (v1.0.0).
3. **Should-haves:** forums, threads, announcements, AutoMod, audit log, soundboard, pinned DMs/channels, scheduled messages, bookmarks, embeds, zoom/pan + pop-out streams, AV1/HEVC choice, profile themes, hide badges, streamer mode, signing via SignPath.
4. **Could-haves:** stage, discovery, events, onboarding, webhooks, bot API, clips, overlay, background blur, translation, E2EE calls, QR login.
5. **Fixes from replica-entrepreneur:** after it runs (pain points from real Discord reviews).
