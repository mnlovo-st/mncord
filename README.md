# mncord

**Free voice, video and text chat for communities. Every feature, for everyone.** © mnlovo

العربية · English · Windows

mncord is a desktop chat app with servers, channels, roles, direct messages, voice rooms and screen
sharing. Everything other apps put behind a subscription is free here: big uploads, HD/high-FPS streaming,
custom emoji everywhere, animated avatars, high-quality audio.

## What's inside

| | |
| --- | --- |
| Accounts | email + username, Argon2id passwords (derived on your device, the server never sees them), 2FA (TOTP + backup codes), device list, new-device alerts, password reset |
| Social | friends, requests, blocking, DMs, group DMs, calls with ringing, profiles |
| Servers | templates, invites, roles with 30+ permissions, per-channel permission overwrites, audit log, custom emoji |
| Moderation | kick, ban (with message purge), time-outs, slowmode, 18+ channels, AutoMod-ready schema |
| Messages | markdown (safe, no HTML), replies, mentions (@user, @role), reactions, edits, pins, uploads up to 200 MB (images/videos kept 14 days), Arabic-aware search |
| Voice | Cloudflare Realtime SFU (via our server, secret never on clients), Opus 96 kbps by default with DTX + FEC and a gentle output leveller, AI noise suppression (GTCRN) / RNNoise, noise gate, EQ, compressor, push-to-talk that works in games, per-user volume to 400% |
| Video | camera and Go Live up to 1440p 100 fps on the GPU (H.265 with H.264 fallback, Windows Graphics Capture); quality steps down automatically to stay inside the free monthly allowance |
| App | Arabic (full RTL) and English, 3 themes, compact mode, Ctrl+K switcher, right-click menus, notifications, tray, auto-start, auto-update |

## Layout

```
apps/desktop    Electron + React app (Windows)
apps/edge       the server: one Cloudflare Worker + one Durable Object (SQLite) + R2 storage, free plan
packages/shared types, validation, the permission engine
replica/        planning: recon, architecture, design system, feature matrix, build log
```

## Develop

```bash
npm install
node apps/edge/scripts/dev-vars.mjs   # local keys (.dev.vars, git-ignored)
npm run dev -w @mncord/edge        # the server on http://127.0.0.1:8787 (real workerd runtime, local SQLite + R2)
npm run dev -w @mncord/desktop     # the app
npm test -w @mncord/edge           # end-to-end tests against the real Worker
```

## Ship

- Windows installer locally: `npm run dist -w @mncord/desktop` → `apps/desktop/release/<version>/mncord-Setup-<version>.exe`
- Release: push a tag `v1.0.1`; GitHub Actions builds, tests and publishes; installed apps update themselves.
- Server: `npm run deploy -w @mncord/edge`. Step-by-step (Arabic): [docs/DEPLOY.ar.md](docs/DEPLOY.ar.md). Cost: $0 on Cloudflare's free plan.
- The earlier self-hosted Node/Postgres server (Docker, Oracle) is kept in git history at tag `legacy-node-server`.

## Security

Report vulnerabilities privately to the maintainer (GitHub security advisory), not in public issues.

## Licence

Code: GNU AGPL-3.0 (`LICENSE`). The mncord/mnlovo names, logos and sounds are **not** licensed for reuse,
see [assets/LICENSE-ASSETS.md](assets/LICENSE-ASSETS.md).
