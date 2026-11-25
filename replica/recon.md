# Recon map: Discord (Windows desktop) → mncord by mnlovo

Scope: the core of Discord's desktop app, rebuilt clean-room as **mncord**: account and sign-in,
friends and DMs, servers with text/voice/forum/stage channels, roles and permissions, voice and
video, screen share (Go Live), every user and server settings page, plus every Nitro perk
turned on free for everyone. Windows first (Electron), English + Modern Standard Arabic (full RTL).
For: the owner (mnlovo) and their community, mainly in the UAE/GCC. Free product, $0 running cost.
Date: 2026-11-25

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | Help center | https://support.discord.com/hc/en-us | full feature and settings reference |
| 2 | Public developer docs (API, gateway, permissions) | https://discord.com/developers/docs | data model: Guild, Channel, Message, Role, Invite, VoiceState… read only for the model, no endpoints copied |
| 3 | Nitro page (paid gating) | https://discord.com/nitro | the perks mncord makes free |
| 4 | Patch notes / changelog | https://discord.com/blog/discord-patch-notes-february-4-2026 | recent: zoom + pan on screenshares |
| 5 | "Adding the updates you want to see" | https://discord.com/blog/adding-the-discord-updates-you-want-to-see | community-requested batch |
| 6 | Dexerto, user-requested features | https://www.dexerto.com/entertainment/discord-rolls-out-huge-batch-of-highly-requested-features-after-asking-users-for-ideas-3410116/ | pinned DMs, pinned channels, big avatars, hide badges, mod tools |
| 7 | Feedback board / community votes | https://support.discord.com/hc/en-us/articles/213490807 | e.g. restore old compact UI |
| 8 | UAE status: vpnMentor (May 2026) | https://www.vpnmentor.com/blog/gaming/is-discord-banned-in-uae/ | voice/video/screen share blocked, text works |
| 9 | UAE status: The National (2018) | https://www.thenationalnews.com/business/technology/uae-gamers-voice-anger-as-chat-app-blocked-by-etisalat-1.612629 | Etisalat cites the UAE regulatory framework; VoIP must be licensed |
| 10 | UAE status: Bridge Legal | https://bridgelegal.org/?p=10270 | enforcement varies by network |
| 11 | Oracle Always Free | https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm | candidate $0 host (A1 limits reportedly halved in 2026, verify) |
| 12 | Owner's logo PNG + IMG_9090.MOV | local | chrome/liquid-metal wordmark "mnlovo", 4K60, 15.6 s on black |

No Discord bundles, binaries or network traffic were read. The owner's own Discord account was not used.

## Core loop

Join a server with friends → talk in text channels → hop into a voice channel with one click →
share your screen or game at high quality. Voice and Go Live are the parts people pay Nitro for.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Splash / updater | app launch | load, check updates | animated logo, progress text | checking, downloading, error/offline |
| S02 | Login | first launch / signed out | email or username + password | AuthCard, Input, Button, QR panel | empty, error, rate-limited, captcha |
| S03 | Register | Login → "Register" | email, display name, username, password, DOB | AuthCard, DatePicker | taken username, weak password, underage |
| S04 | 2FA / verify | after login if enabled | TOTP or backup code | CodeInput | wrong code, locked |
| S05 | Forgot / reset password | Login → "Forgot" | email reset link | Input, Toast | sent, invalid token |
| S06 | Email verify banner | top of app until verified | nag + resend | Notice bar | sent, verified |
| S07 | Home → Friends | top of guild rail | Online / All / Pending / Blocked / Add Friend | Tabs, FriendRow, SearchBar, Active Now column | empty per tab, filled |
| S08 | DM conversation | DM list | 1:1 chat, call | MessageList, Composer, CallBar, ProfilePanel | empty (start of DM), filled, blocked user |
| S09 | Group DM | "+" in DM header | up to N people, name/icon | Same as S08 + member list | empty, filled, owner tools |
| S10 | Server – text channel | guild rail → channel | main chat | GuildRail, ChannelSidebar, ChannelHeader, MessageList, Composer, MemberList, UserPanel | empty channel, filled, no permission (read-only), slowmode, NSFW gate |
| S11 | Voice channel – connected | click voice channel | voice grid / focused stream | VoiceTile, StreamTile, CallControls, VoiceConnectedPanel | alone, many users, video, streaming, poor connection |
| S12 | Go Live picker | screen icon in voice panel | pick screen/window, quality, fps, audio | Modal, SourceGrid, QualitySelect | no sources, permission denied |
| S13 | Stream viewer | click "Watch" on a stream | watch fullscreen, pop out, zoom/pan | VideoPlayer, StreamControls | buffering, ended, viewer count |
| S14 | Stage channel | stage channel | speakers vs audience | StageGrid, RaiseHand | not live, live, request to speak |
| S15 | Forum channel | forum channel | posts as threads with tags | PostCard, TagFilter, SortSelect | empty, filled, closed post |
| S16 | Thread view | "Threads" or message → thread | side panel thread | ThreadPanel | archived, locked |
| S17 | Member list / user popout | click avatar | profile card, roles, note, message | ProfilePopout, RolePill | self, other, blocked, bot |
| S18 | Full profile modal | popout → "View full profile" | about, mutual servers/friends | Modal, Tabs | |
| S19 | Create server | guild rail "+" | template → name/icon | Modal steps, IconUpload | |
| S20 | Join via invite | "+" → join / link | preview + join | InviteCard | invalid, expired, banned, full |
| S21 | Server discovery | compass on rail | browse public servers | ServerCard, Category tabs, Search | empty search |
| S22 | Server settings | server name menu → Settings | Overview, Roles, Emoji, Stickers, Soundboard, Widget, Server template, Custom invite link, Safety/AutoMod, Audit log, Bans, Members, Invites, Integrations/Webhooks, Community, Onboarding, Delete server | SettingsLayout, RoleEditor, PermissionToggle | unsaved-changes bar, no permission |
| S23 | Channel settings | gear on channel | Overview (topic, slowmode, NSFW, bitrate, user limit, region), Permissions, Invites, Integrations | PermissionOverwriteEditor | sync / unsynced with category |
| S24 | User settings | gear in user panel | My Account, Profiles, Privacy & Safety, Family Center, Authorized Apps, Devices, Connections, Clips; App: Appearance, Accessibility, Voice & Video, Chat, Notifications, Keybinds, Language, Windows settings, Streamer mode, Advanced; Activity privacy; Log out | SettingsLayout, Slider, Toggle, Select, KeybindRecorder | |
| S25 | Voice & Video settings | S24 tab | devices, volume, input sensitivity, PTT, noise suppression, echo cancel, AGC, QoS, codec, video preview | DeviceSelect, MicMeter, Toggle | no mic, denied permission |
| S26 | Search | header search box | filters from:, in:, has:, before: | SearchPanel, ResultCard | no results |
| S27 | Pinned messages | pin icon | list pins | Popout | empty |
| S28 | Inbox | inbox icon | mentions, unreads | Popout, Tabs | empty |
| S29 | Emoji / GIF / sticker picker | composer buttons | pick media | Picker, Tabs, Search | no results, locked (Nitro → free in mncord) |
| S30 | Upload modal | drop / "+" | files, spoiler, caption | Modal, FileTile | too large, failed |
| S31 | Quick switcher | Ctrl+K | jump anywhere | CommandPalette | |
| S32 | Context menus | right-click anywhere | actions per object | ContextMenu (nested) | |
| S33 | Soundboard | voice panel | play sounds | SoundGrid | cooldown |
| S34 | Events | server header "Events" | schedule events | EventCard, EventModal | none, live, ended |
| S35 | Onboarding / rules screening | first join of community server | rules, pick roles/channels | Stepper | |
| S36 | Incoming call | DM call | accept / decline | RingModal | missed |
| S37 | Status picker | user panel avatar | online/idle/DND/invisible + custom status | Menu | |
| S38 | Image/video lightbox | click attachment | view, zoom, open original | Lightbox | |
| S39 | In-game overlay | hotkey in game | voice + chat over a game | Overlay | **could** |
| S40 | Connection info / RTC panel | voice panel → signal icon | ping, packet loss, codec, fps, bitrate | DebugPanel | |
| S41 | Bookmarks / Saved | new (mncord) | save messages for later | List | empty |
| S42 | Nitro / Shop / Boosts | user settings | paid upsell | — | **skip**: everything free |

## Flows

```
F01 New user signs up and lands home
    S01 -> S02 -> S03 -> S06 -> S07
    happy path clicks: ~6
    edge: username taken, offline, email already used, underage DOB

F02 Add a friend and DM them
    S07 Add Friend -> request -> (other accepts) -> S08
    happy path clicks: 4
    edge: username not found, blocked, request already pending, friend requests disabled

F03 Create a server and invite friends
    S19 template -> name -> invite modal copy link
    happy path clicks: 4
    edge: icon too large, invite expiry/max uses

F04 Join a server by invite
    link / S20 -> preview -> Join -> S35 (if onboarding) -> S10
    clicks: 2
    edge: invalid, expired, banned, verification level

F05 Chat in a channel
    S10 type -> Enter; reply, edit, delete, react, mention, upload, thread
    edge: slowmode, missing perms, message too long, network drop (queued + retry), rate limit

F06 Join voice and talk
    click voice channel (1 click) -> S11; mute/deafen; leave
    edge: channel full, no mic permission, poor network, switching device mid-call

F07 Go Live / share screen
    S11 -> S12 pick source + 1080p/1440p/4K + 30/60/120 fps + audio -> Go Live -> others click Watch (S13)
    clicks: 3 to start, 1 to watch
    edge: GPU has no HW encoder, uploader bandwidth too low (auto-downgrade), window minimised, app audio capture

F08 Set up roles and permissions
    S22 Roles -> create -> toggle perms -> assign; S23 channel overwrites
    edge: role hierarchy, can't edit roles above yours, deny vs allow precedence

F09 Moderate
    right-click user -> timeout / kick / ban; AutoMod rules; audit log
    edge: can't act on higher role, ban with message purge

F10 Tune mic
    S24 -> S25 pick device -> sensitivity -> noise suppression level -> test mic (loopback)
    edge: no device, exclusive mode device

F11 Change language to Arabic
    S24 Language -> العربية -> whole UI mirrors to RTL instantly
    edge: mixed LTR/RTL message text, numerals, timestamps

F12 Recover account
    S02 forgot -> email -> S05 new password -> all other sessions revoked
    edge: 2FA on, lost 2FA (backup codes)

F13 DM call
    S08 call button -> S36 ring on other side -> accept -> voice/video/screen share in DM

F14 First run of the Windows app
    download installer -> install (per-user) -> S01 updater -> S02
    edge: SmartScreen warning (unsigned exe), auto-update rollback
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| GuildRail icon | server, folder, home, add, discover, DM unread | default, hover (squircle morph), selected (pill), unread dot, mention badge, dragging | all |
| ChannelItem | text, voice, stage, forum, announcement, thread, category | default, hover, selected, unread, muted, locked, connected users list | S10–S16 |
| Message | default, compact, grouped, reply, system, deleted, embed, attachment | hover toolbar, editing, sending, failed, highlighted mention | S08–S16 |
| Composer | channel, DM, thread, forum post | empty, typing, slowmode, no permission, uploading, replying | S08–S16 |
| VoiceTile | user, video, stream | speaking ring, muted, deafened, focused, popped out | S11, S13 |
| CallControls | voice panel, call bar, fullscreen | mic/deafen/camera/screen/soundboard/disconnect, tooltips | S08, S11 |
| UserPanel | bottom-left | status, mute, deafen, settings | all |
| Modal | small, medium, full-screen settings | open/close animation, confirm, destructive | many |
| ContextMenu | nested, with checkboxes/radios/sliders (per-user volume) | | all |
| Popout | profile, pins, inbox, emoji picker | | many |
| Toast / Notice bar | info, success, warning, error | | all |
| Tooltip | top, right, bottom, left | | all |
| Settings controls | Toggle, Slider, Select, Radio card, Color picker, KeybindRecorder | default, disabled, focus | S22–S25 |
| Avatar | sizes 16–128, animated, decoration, status dot | online, idle, dnd, offline, streaming | all |
| Badge / RolePill / Tag | | | many |
| Skeleton loaders | message, channel, member | | loading states |

## Inferred data model

Evidence for almost every entity is the public developer docs (source 2), so confidence is high.

```
User          id (snowflake), username (unique), display_name, email, email_verified,
              password_hash, totp_secret_enc, avatar, banner, accent_color, bio, pronouns,
              locale, flags, created_at
              evidence: S03, S18, API User object       confidence: high
Session       id, user_id, device_name, os, ip_hash, last_seen, refresh_token_hash
              evidence: S24 Devices                     confidence: high
Relationship  user_id, target_id, type (friend | blocked | incoming | outgoing), nickname
              evidence: S07                             confidence: high
Guild         id, name, icon, banner, owner_id, verification_level, default_notifications,
              explicit_filter, system_channel_id, rules_channel_id, vanity_code, features[]
              evidence: S19, S22                        confidence: high
Member        guild_id, user_id, nick, avatar, roles[], joined_at, timeout_until, flags
              evidence: S17, S22 Members                confidence: high
Role          id, guild_id, name, color, icon, hoist, mentionable, position, permissions (bitfield)
              evidence: S22 Roles                       confidence: high
Channel       id, guild_id?, type (text|voice|category|announcement|stage|forum|dm|group_dm|thread),
              name, topic, position, parent_id, nsfw, rate_limit_per_user, bitrate, user_limit,
              rtc_region, last_message_id
              evidence: S10–S16, S23                    confidence: high
Overwrite     channel_id, target_id, target_type (role|member), allow, deny
              evidence: S23 Permissions                 confidence: high
Message       id, channel_id, author_id, content, type, reply_to_id, edited_at, pinned, flags,
              mentions[], mention_roles[], mention_everyone, nonce
              evidence: S10                             confidence: high
Attachment    id, message_id, filename, size, content_type, url, width, height, spoiler
Reaction      message_id, emoji_id|unicode, user_id, burst (super)
Emoji/Sticker/Sound  id, guild_id, name, file, animated, creator_id
Invite        code, guild_id, channel_id, inviter_id, max_uses, uses, expires_at, temporary
ReadState     user_id, channel_id, last_read_message_id, mention_count
VoiceState    user_id, guild_id, channel_id, session_id, self_mute, self_deaf, server_mute,
              server_deaf, self_video, self_stream     (ephemeral, in memory / Redis-like)
AuditLog      id, guild_id, actor_id, action, target_id, changes (json), reason, created_at
Ban           guild_id, user_id, reason
AutoModRule   id, guild_id, trigger (keyword|spam|mention), actions (json), exempt_roles[]
Webhook       id, channel_id, token_hash, name, avatar
ScheduledEvent id, guild_id, channel_id, name, start_at, end_at, status
UserSettings  user_id, theme, density, locale, rtl, notification prefs (json), keybinds (json),
              voice prefs (json, local-first)
Thread meta   channel_id, archived, locked, auto_archive_minutes, applied_tags[]
Bookmark      user_id, message_id, note      (new in mncord)   confidence: n/a
```

Relationships: User n-n Guild via Member; Guild 1-n Channel, Role, Emoji, Invite, Ban, AuditLog;
Channel 1-n Message, Overwrite, Thread; Message 1-n Attachment, Reaction; Member n-n Role;
User n-n User via Relationship; DM/GroupDM channel n-n User (recipients).

## Feature matrix

See `features.csv`. Must: 69, should: 33, could: 15, skip: 8 (125 rows).

## Out of scope (cannot or should not be cloned)

- Discord's name, logo, Wumpus, Blurple brand, sounds and illustrations: mncord uses mnlovo's
  chrome wordmark and its own palette and sounds (the owner will supply sound files).
- Discord's network and users: mncord starts with zero servers and zero users.
- Paid features (Nitro, Boosts, Shop, Orbs/Quests): no payments at all; every perk is free.
- Activities/embedded games (licensed partner content), Spotify/Xbox/PlayStation connections (partner deals).
- Discord's private API and bot ecosystem compatibility.
- Getting around government blocking. mncord gets no special evasion (DPI obfuscation, domain
  fronting). It simply runs on its own servers. **Legal note:** UAE rules require VoIP services to
  be licensed (sources 8–10). A self-hosted voice app used by a private group is a grey area; a
  public service offered to UAE users is a regulatory risk the owner carries. Get local advice
  before advertising it publicly in the UAE.

## Honest limits on the owner's targets

| target | reality |
| --- | --- |
| $0 forever | Possible for a small/medium community: Oracle Always Free VM (voice SFU + API + Postgres) or Supabase free + self-hosted LiveKit, Cloudflare (DNS, R2 10 GB free, Tunnel), GitHub Releases for the installer + auto-update. Limits: free tiers can change (Oracle cut A1 in 2026); thousands of concurrent 4K viewers need bandwidth no free tier gives. |
| 4K 120 fps screen share | Achievable P2P/SFU-forwarded with a hardware encoder (NVENC/AMF/QSV, H.264/HEVC/AV1) and roughly 25–50 Mbps upload from the streamer. The server only forwards packets, so it costs bandwidth, not CPU. It auto-drops quality for viewers with weak connections (simulcast/SVC). "Never stutters" can't be promised on a bad network; adaptive bitrate is the real answer. |
| Studio audio | Opus at up to 510 kbps stereo, 48 kHz, FEC + DTX, music mode with processing off. |
| Mic tools beyond Discord | RNNoise / DeepFilterNet3 (open-source AI noise removal, WASM/native), noise gate, EQ, compressor, limiter, de-esser, AGC, echo cancellation, live monitoring, per-user volume up to 400%, saved presets. |
| Exe without warnings | A code-signing certificate normally costs money. Free route: open-source repo + SignPath Foundation (free for OSS). Unsigned exe = SmartScreen "unknown publisher" at first. |
| 100% no bugs | No software reaches that. Plan: typed code (TypeScript), automated tests, crash reporting, staged auto-updates with rollback. |

## Size

Screens 42 (41 to build), flows 14, entities 22. Hard parts: realtime gateway + presence;
WebRTC SFU with 4K120 simulcast on free hardware; the audio processing chain; the permission
system (roles × overwrites × hierarchy); full RTL Arabic UI; Windows packaging, signing and
auto-update; account security (Argon2id, 2FA, refresh-token rotation, rate limits, E2EE for DMs/calls).
Size: **XL → rescope into phases**:

1. Phase 1 (MVP, L): auth, friends, DMs, servers, text channels, roles basics, voice, 1080p60
   screen share, AR/EN, Windows installer + auto-update.
2. Phase 2: 4K120 Go Live, advanced mic suite, forums/threads/stage, AutoMod, audit log, soundboard.
3. Phase 3: E2EE calls, overlay, events, discovery, bots/webhooks, mncord-only extras.
