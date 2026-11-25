# Moving the mncord server to Cloudflare (decided 2026-11-25)

Owner's requirements: 20 people, daily use for hours, never exceed a free limit, no card charges, best quality.
Max Go Live 2K (1440p) at 100 fps, uploads up to 200 MB, every image/video deleted after 14 days,
voice quality high and comfortable, app must feel premium. English is the default language.

## Architecture
- `apps/edge`: one Cloudflare Worker + ONE Durable Object (`Hub`, `idFromName('main')`, `locationHint: 'me'`
  = Middle East). 20 people fit easily in one object; one object = strong consistency, no cross-object sync.
  - The Worker only routes: `/api/*` and `/gateway` → Hub; `/files/*` and `/avatars/*` served by the Worker
    straight from R2 after checking the HMAC signature (no Hub request).
  - Hub keeps everything in its built-in SQLite (`ctx.storage.sql`). Free plan: SQLite-backed DOs only, 5 GB total.
  - Gateway = WebSockets on the Hub with the Hibernation API (`ctx.acceptWebSocket`, attachments hold userId,
    `setWebSocketAutoResponse` answers heartbeats without waking it). Voice states live in SQLite so they
    survive eviction.
  - Duration budget: 13,000 GB-s/day ≈ 28 h at 128 MB, so even awake 24/7 the Hub stays free.
- Route code is ported from `apps/server` through a small Fastify-like shim (`app.get(path, opts, handler)`,
  `req.params/query/body/userId`, `reply.status().send()`), so logic and validation stay identical.
- SQL: Postgres → SQLite via a thin adapter: `$n` → `?n`, arrays/objects → JSON, Date → ISO string,
  `= any($n)` → `in (select value from json_each($n))`, booleans coerced back by column name, ids from a
  uuidv7 default expression, timestamps stored as ISO-8601 text (`strftime('%Y-%m-%dT%H:%M:%fZ','now')`).
- Tests: the existing HTTP/WebSocket tests run against `wrangler dev` (real workerd), with a dev-only
  `/__dev/sql` endpoint (enabled only by the DEV_TOOLS var) replacing direct DB access.

## CPU limit (10 ms per request on Workers Free)
- Password hashing moves to the client (Bitwarden-style): `POST /auth/prelogin {login}` → salt (deterministic
  fake salt for unknown logins, so no user enumeration). Client runs Argon2id (hash-wasm) → sends the 32-byte
  key; server stores SHA-256(key + pepper). DB leak still costs an Argon2id per guess.
- Breached-password check (HIBP k-anonymity) moves to the client too.
- Images are resized/re-encoded on the client before upload (also strips EXIF). Videos uploaded as-is.

## Files (R2, free 10 GB storage, egress free)
- Max 200 MB per file. Uploads are R2 multipart through the Hub/Worker binding in 50 MB parts (the Worker
  request body limit on Free is 100 MB), so no S3 keys are needed.
- Cron (daily): delete attachments older than 14 days from R2; messages keep a small "expired" placeholder.
- Hard storage guard: refuse new uploads above 9 GB total, so we never pass 10 GB.

## Email
- Gmail SMTP (app password) over Workers TCP sockets on port 465 (Cloudflare Email Sending is paid-only).

## Voice / video (Cloudflare Realtime, 1,000 GB/month free, egress only)
- Opus voice: 96 kbps, DTX (silence is not sent) + in-band FEC; receive-side gentle compressor so loud and
  quiet people sit at the same level.
- Go Live presets up to 1440p100 (HEVC, ~12 Mbps). Electron capture may top out near 60 fps; try the WGC
  capturer flags, measure, and report honestly.
- Daily media budget ≈ 31 GB (1,000 GB / 32 days): near it, new streams are capped to 1080p30, then 720p30;
  video stops at 950 GB/month and voice at 995 GB/month (already implemented).

## Oracle
- Free Ampere limit was halved in 2026 to 2 OCPU / 12 GB (instances above are shut down). The retry script
  now asks for 2/12 or 1/6 only. If a VM ever appears it is a bonus, not part of the plan.
