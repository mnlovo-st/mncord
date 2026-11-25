# mncord

**Free voice, video and text chat for communities. Every feature, for everyone.** © mnlovo

العربية · English · Windows

mncord is a desktop chat app with servers, channels, roles, direct messages, voice rooms and screen
sharing. Everything other apps put behind a subscription is free here: big uploads, HD/high-FPS streaming,
custom emoji everywhere, animated avatars, high-quality audio.

## What's inside

| | |
| --- | --- |
| Accounts | email + username, Argon2id passwords, 2FA (TOTP + backup codes), device list, new-device alerts, password reset |
| Social | friends, requests, blocking, DMs, group DMs, calls with ringing, profiles |
| Servers | templates, invites, roles with 30+ permissions, per-channel permission overwrites, audit log, custom emoji |
| Moderation | kick, ban (with message purge), time-outs, slowmode, 18+ channels, AutoMod-ready schema |
| Messages | markdown (safe, no HTML), replies, mentions (@user, @role), reactions, edits, pins, uploads up to 500 MB, Arabic-aware search |
| Voice | Cloudflare Realtime SFU (via our server, secret never on clients), Opus up to 510 kbps, AI noise suppression (GTCRN) / RNNoise, noise gate, EQ, compressor, push-to-talk that works in games, per-user volume to 400% |
| Video | camera and Go Live up to 1440p 60 fps on the GPU (H.265 with H.264 fallback); 4K/120 encode proven, capture helper planned |
| App | Arabic (full RTL) and English, 3 themes, compact mode, Ctrl+K switcher, right-click menus, notifications, tray, auto-start, auto-update |

## Layout

```
apps/desktop    Electron + React app (Windows)
apps/server     Fastify API + realtime gateway (Node 24, PostgreSQL)
packages/shared types, validation, the permission engine
infra/          free hosting: Docker Compose (Caddy, Postgres 18, server) for an Oracle Always Free VM
replica/        planning: recon, architecture, design system, feature matrix, build log
```

## Develop

```bash
npm install
infra/dev-bin/livekit-server.exe --dev --bind 127.0.0.1 --node-ip 127.0.0.1   # local voice server
npm start -w @mncord/server        # API on http://127.0.0.1:8787 (embedded Postgres, no install)
npm run dev -w @mncord/desktop     # the app
npm test -w @mncord/server         # end-to-end tests
```

## Ship

- Windows installer locally: `npm run dist -w @mncord/desktop` → `apps/desktop/release/<version>/mncord-Setup-<version>.exe`
- Release: push a tag `v1.0.1`; GitHub Actions builds, tests and publishes; installed apps update themselves.
- Server: see [docs/DEPLOY.ar.md](docs/DEPLOY.ar.md) (Arabic, step by step, $0).

## Security

Report vulnerabilities privately to the maintainer (GitHub security advisory), not in public issues.

## Licence

Code: GNU AGPL-3.0 (`LICENSE`). The mncord/mnlovo names, logos and sounds are **not** licensed for reuse,
see [assets/LICENSE-ASSETS.md](assets/LICENSE-ASSETS.md).
