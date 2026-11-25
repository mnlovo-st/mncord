# M0 media spike: results (2026-11-25)

Machine: i7-12700, RTX 5070, 2560×1440 @ 144 Hz monitor, Windows 11. Electron 45.5, livekit-client 2.25,
livekit-server 1.13.11 (local, `--dev`). Publisher and viewer are two Electron windows on the same PC
through the SFU (so no internet bandwidth limits; real networks will be worse).
Raw reports: `m0-*.json` in this folder. Rerun: `npm run spike -w @mncord/desktop -- <mode:fps:codec:secs,…>`.

## Results

| scenario | resolution sent | capture fps | send fps (med/min) | received fps (med/min) | Mbps | encoder | freezes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4K canvas 120, H.264 | 960×540 (!) | 120 | 120 / 109 | 119 / 109 | 17.5 | OpenH264 (software) | 0 |
| 4K canvas 120, AV1 | 1920×1080 | 120 | 118 / 31 | n/a | 7.9 | libaom (software) | n/a |
| **4K canvas 120, H.265** | **3840×2160** | 120 | **118 / 92** | **118 / 88** | 18.7 | **NVIDIA HEVC (hardware)** | 1 (during ramp-up) |
| screen 1440p, getDisplayMedia, 120/144 | 2560×1440 | **48** | 48 | 48 | 17.4 | NVIDIA HEVC | 0 |
| screen 1440p, 720p request | 1280×720 | **48** | 48 | 48 | 9.6 | NVIDIA HEVC | 0 |
| screen 1440p, WGC disabled | 2560×1440 | **48** | 48 | 48 | 17.5 | NVIDIA HEVC | 0 |
| screen 1440p, Electron desktop source (legacy gUM) | 2560×1440 | **57** | 57 / 51 | 57 / 51 | 15.5 | NVIDIA HEVC | 0 |

The fullscreen motion window drew at a steady 144 fps the whole time, so the screen really was changing at 144 Hz.

Mic chain (GTCRN AI suppression → gate → EQ → compressor → limiter, 48 kHz) ran in every run once the
CSP fix landed; Opus published with DTX + RED.

## What this decides

1. **Codec: H.265 (HEVC) first, with H.264 as backup.** In this Electron build, HEVC is the only codec WebRTC
   sends through the GPU (`mediaCapabilities.encodingInfo` reports powerEfficient only for H.265 at
   every resolution from 1080p60 to 2160p120). H.264 and AV1 run in software and can't keep 4K. LiveKit
   `backupCodec: { codec: 'h264' }` covers viewers that can't decode HEVC.
2. **4K 120 encode + SFU transport works**: 3840×2160 at about 118 fps received, about 19 Mbps HEVC.
3. **Chromium's screen capture tops out at about 60 fps** (48 with getDisplayMedia, 57 with the desktop-source
   path), whatever resolution, capturer or constraint. Changing a setting won't get past it.
   → **Go Live above 60 fps needs the native capture helper** from the architecture plan:
   `mncord-capture.exe`, a small sidecar that captures with Windows Graphics Capture at the display's refresh rate
   (DXGI Desktop Duplication as fallback), encodes on the GPU (NVENC / AMF / QuickSync) and publishes to
   LiveKit itself with the LiveKit Rust SDK, as the same user's screen-share track. Up to 60 fps keeps the
   pure-Electron path (no extra process).
4. **Bandwidth ramp-up is slow**: WebRTC's estimator starts low and took about 15–20 s to reach 15–30 Mbps
   (H.264 run even dropped to 540p while ramping). Fixes for M6: start-bitrate hint, probing, and
   `maintain-resolution` during the first seconds for screen content.
5. Security note: the strict CSP caught Vite inlining worklets and fonts as `data:` URLs. Fixed with
   `assetsInlineLimit: 0`, so the CSP stays strict (`script-src 'self' 'wasm-unsafe-eval'`).

## Next for this track (M6)

- `mncord-capture` sidecar (Rust): WGC capture → NVENC/AMF/QSV HEVC+H.264 → LiveKit Rust SDK; spawned by
  the main process, talks over a named pipe; same pass/fail spike harness.
- Simulcast/SVC layers so weak viewers get 1080p/720p.
- Real-network test between two PCs (one on Etisalat at home) through the Oracle VM.
