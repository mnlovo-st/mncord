# mncord components

Tokens: `tokens.css` (`--c-*` colours, `--text-*`, `--radius-*`, `--motion-*`, `--size-*`).
Tailwind maps them, so components use `bg-surface text-muted rounded-md`, never hex.
Base: Radix primitives (menus, dialogs, tooltips, sliders, switches) for keyboard and screen-reader
behaviour; Lucide icons (ISC). Every component works in RTL with logical properties
(`ps-`, `me-`, `start-`), and direction icons flip with `rtl:-scale-x-100`.

Signature motion (mncord's own, not Discord's): **chrome sheen**: a soft diagonal silver
highlight sweeps once across a guild icon, primary button or the logo on hover/selection
(`--motion-slow`, off under reduced motion). Gold is saved for "you": mentions, unread pills,
primary actions, your own speaking ring.

Global rules
- Focus: `:focus-visible` ring 2px `--c-focus-ring` + 2px offset in the background colour. Never removed.
- Hit target ≥ 32×32 (icon buttons 32, rail icons 48).
- Disabled: 50% opacity, `cursor: not-allowed`, still focusable when it has a tooltip explaining why.
- Text never truncates without a tooltip or `title` with the full value.
- All copy comes from i18n keys (`en.json`, `ar.json`); no strings in components.

---

## Primitives

```
Button
  variants  primary (gold), secondary (surface-raised), ghost, danger (danger-solid), success, link
  sizes     sm 32px · md 38px · lg 44px · icon 32×32
  states    default, hover (lighten + sheen on primary), active (translateY 1px), focus-visible,
            disabled, loading (spinner replaces icon, label kept for SR, aria-busy)
  tokens    primary: bg accent / hover accent-hover / text on-accent, radius sm, text sm/600
  a11y      real <button>; icon-only needs aria-label + Tooltip
  used on   S02 S03 S07 S19 S20 S22–S25 and every modal

Input / Textarea
  variants  text, password (show/hide toggle), search (icon + clear), code (6-digit 2FA)
  sizes     md 40px
  states    default, hover, focus (border focus-ring), invalid (danger border + message below, aria-invalid,
            aria-describedby), disabled, read-only
  tokens    bg surface-input, border border-input (3.5:1), radius sm, label 2xs uppercase EN / 12px AR
  a11y      visible <label>, error text announced politely
  used on   S02–S05 S07 S19 S22–S25

Switch (Toggle)
  states    off, on (gold track with check), focus, disabled
  tokens    track off border-input, on accent; thumb chrome
  a11y      Radix Switch, role=switch, label clickable
  used on   S22–S25

Slider
  variants  plain, with marks (input sensitivity shows live mic level behind the track), dual value
  states    default, dragging (value tooltip), focus, disabled
  a11y      arrow keys ±1, PgUp/PgDn ±10, aria-valuetext ("120%")
  used on   S25, per-user volume (0–400%), stream volume

Select / Radio card / Checkbox / Color picker / Keybind recorder
  Select: Radix Select, searchable when >10 options (devices, languages).
  Radio card: theme picker (midnight, light, amoled), quality presets.
  Keybind recorder: "Press keys…" state, Esc cancels, shows conflicts in danger-text.
  used on   S22–S25

Tooltip
  sides     top (default), right (rail), bottom, left. Mirrors in RTL.
  timing    open 300ms delay, 0ms when moving between tooltips, close 100ms
  tokens    bg popover, text sm/600, radius sm, shadow pop, arrow
  a11y      Radix Tooltip; never the only place essential info lives

Modal (Dialog)
  sizes     sm 440 · md 560 · full-screen (settings)
  motion    scale .96→1 + fade, --motion-base, --ease-spring; backdrop fade to rgba(0,0,0,.7)
  states    default, destructive confirm (type the server name to delete), loading submit
  a11y      focus trapped, Esc closes (unless unsaved changes → shake + "Careful" bar), returns focus
  used on   S12 S18 S19 S20 S30 and confirmations

Context menu / Dropdown menu
  items     item, item with icon, danger item, checkbox, radio, submenu, slider (user volume), separator, label
  motion    fade + 4px slide, --motion-fast
  a11y      Radix ContextMenu; arrow keys, typeahead, Shift+F10 / Menu key opens it
  used on   S32 everywhere (messages, users, channels, servers)

Popout
  profile card, emoji picker, pins, inbox, status picker. Anchored with collision flip, Esc closes.

Toast / Notice bar
  variants  info, success, warning, error; notice bar (top, full width: verify email, update ready,
            connection lost)
  states    enter slide-up, auto-dismiss 5s (errors stay), action button
  a11y      role=status (info/success), role=alert (error)

Badge / Pill / Tag
  mention badge (danger-solid, white, min 16px pill, "99+"), unread pill (gold), NEW tag,
  role pill (role colour dot + name), forum tag, BOT/SYSTEM tag.

Avatar
  sizes     16 20 24 32 40 56 80 120
  parts     image (animated plays on hover, always if user allows), decoration ring, status dot
            with cut-out mask (online, idle moon, dnd bar, offline ring, streaming purple, mobile)
  states    speaking: 2px ring (status-online; gold for you), muted icon overlay
  a11y      alt = display name; status dot has aria-label

Skeleton
  message row, channel row, member row; shimmer uses chrome tint, disabled under reduced motion.

## App shell parts

GuildRail (72px)
  items     Home (mnlovo mark), DM unread avatars, separator, guild icons, folders, add server, discover
  icon      48px circle → radius-guild on hover/selected, chrome sheen, --motion-base spring
  indicator pill at the inline-start edge: 8px dot (unread) → 20px (hover) → 40px (selected)
  states    default, hover, selected, unread, mention badge, muted (dimmed), dragging (lift + shadow),
            folder open/closed (shows 4 mini icons)
  a11y      role=tree; arrow keys move, Enter opens; tooltip shows server name
  used on   all screens

ChannelSidebar (240px)
  header    server name + chevron menu, boost-free banner slot; DM mode: search + Friends + DM list
  ChannelItem variants  text #, voice speaker, stage, forum, announcement, thread (indented, curved line),
            category (collapsible, 2xs label)
  states    default, hover (surface-hover, shows invite + gear icons), selected (surface-selected,
            text), unread (text white + 4px pill), muted (text-faint), locked (no VIEW → hidden;
            no SEND → lock icon), pinned (mncord: pin icon, top section)
  voice     connected users listed under the channel with avatar, speaking ring, mute/deaf/live icons
  used on   S07–S16

UserPanel (56px, bottom of sidebar)
  avatar + status, name + custom status (marquee on hover), mic, deafen, settings buttons
  VoiceConnectedPanel above it when in voice: signal (green/yellow/red), channel name, disconnect,
  camera, screen share, soundboard, noise suppression quick toggle

ChannelHeader (48px)
  icon + name + topic (truncated, click opens), actions: threads, notifications, pins, members
  toggle, search box (expands 144→240px), inbox
  DM: call, video call, pin, add friends

MemberList (240px)
  groups by hoisted role then Online / Offline with counts, virtualised; row = avatar 32 + name in role
  colour + activity line; owner crown; hover surface-hover

Message
  variants  cozy (avatar 40, name + time header), compact (time | name | text in one line),
            grouped continuation (no header, time on hover in gutter), reply (curved connector +
            mini quote), system (join/pin/call icons), forwarded (quote bar + "Forwarded"),
            deleted-author ("Deleted User"), webhook (APP tag)
  content   markdown (bold, italic, underline, strike, spoiler, quote, code inline/block with
            highlight, lists, headings, masked links), mentions (gold-tint pill), custom emoji
            (jumbo when alone), attachments grid, embeds (left colour bar), reactions row
  states    hover (surface-hover + toolbar: react, reply, thread, more), editing (inline input,
            "esc cancel · enter save"), sending (text-faint), failed (danger-text + retry/delete),
            highlighted (mention-bg + gold inline-start bar), jumped-to (flash)
  a11y      list role=log; each message an article with author + time label; toolbar reachable by keyboard
  RTL       `dir="auto"` per message so Arabic/English mix renders right; code blocks LTR
  used on   S08–S16

Composer
  parts     + (upload, thread, poll), textarea autogrow max 50vh, emoji / GIF / sticker buttons,
            reply bar above, upload tiles above, slowmode timer, char counter after 3,800
  states    empty, typing, replying, uploading (progress), no permission ("You can't send messages
            here"), slowmode, offline (queued badge)
  keys      Enter send, Shift+Enter newline, ↑ edit last, Esc cancel reply, Ctrl+K switcher
  used on   S08–S16

TypingIndicator — 3 bouncing dots + "X is typing…", "several people are typing…"

VoiceTile / StreamTile (S11, S13)
  grid auto-layout 1–25 tiles, 16:9, radius lg, bg surface-raised with avatar centred
  states    speaking (2px ring), muted/deafened icons, camera on (video fills), streaming (LIVE
            badge, "Watch" button), focused (spotlight + film strip), popped out, poor connection icon
  stream    viewer count, quality badge ("4K 120"), zoom/pan (wheel + drag), fullscreen,
            volume, pop-out, stop watching

CallControls — bottom-centre pill: camera, screen, activities slot, soundboard, mic (split button for
device), deafen, disconnect (danger-solid). Auto-hide after 3s idle in fullscreen.

GoLivePicker (S12) — tabs Screens / Windows (thumbnails refresh every 2s), quality radio cards
  (720p30 … 4K120, locked options show why: "Your GPU can't encode 4K120"), sound toggle, Go Live.

SettingsLayout (S22–S25) — full-screen; nav column (groups, labels 2xs), content max 740px, close
  "×  ESC" at inline-end; unsaved-changes bar slides up from bottom with Reset / Save (shakes if you try to leave).

MicMeter — live input level bar with threshold marker; DSP chain view (Noise AI → Gate → EQ →
  Compressor → Limiter) with per-stage bypass and preset selector (mncord extra).

QuickSwitcher (S31) — centred modal, fuzzy results with type icons, ↑↓ Enter, prefixes: @ users, # channels, * servers, ! voice.

AuthCard (S02–S05) — centred card 480px on the animated logo background (looped, blurred, dimmed
  from the mnlovo video), QR panel slot, language switch top corner.

Splash (S01) — 2.5s cut of the logo video on black, status line below ("Checking for updates…"),
  then fades into the app.
