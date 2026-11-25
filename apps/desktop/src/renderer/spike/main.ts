// M0 media spike: proves voice + high-fps screen share + mic chain on LiveKit before the real app.
// Automated: MNCORD_SPIKE=screen|canvas4k (see apps/desktop/scripts/spike.mjs). Manual: role=manual.
import '../styles/app.css';
import { Room, RoomEvent, Track, type RemoteTrack, type LocalTrackPublication, type VideoCodec } from 'livekit-client';
import { createMicChain, DEFAULT_MIC, type MicChain, type Suppression } from '../media/micChain';

const p = new URLSearchParams(location.search);
const role = (p.get('role') ?? 'manual') as 'publisher' | 'viewer' | 'manual';
const mode = (p.get('mode') ?? 'screen') as 'screen' | 'canvas4k';
const fps = Number(p.get('fps') ?? 120);
const codec = (p.get('codec') ?? 'h264') as VideoCodec;
const seconds = Number(p.get('seconds') ?? 25);
const roomName = p.get('room') ?? 'spike-manual';
const WARMUP_S = 6;

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="flex h-full flex-col gap-3 bg-bg p-4 text-text">
    <header class="flex items-center gap-3">
      <h1 class="font-display text-lg font-semibold">mncord M0 · <span id="role"></span></h1>
      <span id="state" class="rounded-xs bg-surface-raised px-2 py-0.5 text-xs text-muted">idle</span>
      <div id="controls" class="ms-auto flex flex-wrap items-center gap-2"></div>
    </header>
    <div class="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-3">
      <div class="relative min-h-0 overflow-hidden rounded-lg bg-black">
        <video id="video" autoplay playsinline muted class="size-full object-contain"></video>
        <canvas id="gen" class="hidden"></canvas>
      </div>
      <pre id="stats" class="min-h-0 overflow-auto rounded-lg bg-surface p-3 font-mono text-xs leading-5 text-muted"></pre>
    </div>
    <div id="sources" class="hidden grid-cols-4 gap-2"></div>
  </div>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
$('role').textContent = role === 'manual' ? 'manual test' : `${role} · ${mode} · ${fps}fps · ${codec}`;
const setState = (s: string) => ($('state').textContent = s);
const statsEl = $<HTMLPreElement>('stats');

async function token(identity: string) {
  const r = await fetch(`http://127.0.0.1:7890/token?identity=${encodeURIComponent(identity)}&room=${encodeURIComponent(roomName)}`);
  if (!r.ok) throw new Error(`token server ${r.status}`);
  return (await r.json()) as { token: string; url: string };
}

async function connect(identity: string, before?: (room: Room) => void) {
  const { token: t, url } = await token(identity);
  const room = new Room({ adaptiveStream: false, dynacast: false });
  room.on(RoomEvent.Disconnected, () => setState('disconnected'));
  before?.(room); // listeners must exist before connect: subscriptions can complete during it
  await room.connect(url, t);
  setState(`connected · ${room.name}`);
  return room;
}

// ── sources ────────────────────────────────────────────────────────────
function startCanvas4k(rate: number): MediaStreamTrack {
  const c = $<HTMLCanvasElement>('gen');
  c.width = 3840;
  c.height = 2160;
  const g = c.getContext('2d', { alpha: false, desynchronized: true })!;
  let n = 0;
  const draw = () => {
    n++;
    const t = n / rate;
    // moving content everywhere so the encoder really has to work (like a fast game)
    const grad = g.createLinearGradient(0, 0, 3840, 2160);
    grad.addColorStop(0, `hsl(${(t * 40) % 360} 60% 20%)`);
    grad.addColorStop(1, `hsl(${(t * 40 + 180) % 360} 60% 35%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 3840, 2160);
    for (let i = 0; i < 60; i++) {
      const x = (Math.sin(t * 1.7 + i) * 0.5 + 0.5) * 3600;
      const y = (Math.cos(t * 1.3 + i * 0.7) * 0.5 + 0.5) * 1950;
      g.fillStyle = `hsl(${(i * 37 + t * 90) % 360} 80% 60%)`;
      g.fillRect(x, y, 240, 210);
    }
    g.fillStyle = '#fff';
    g.font = 'bold 160px Inter, sans-serif';
    g.fillText(`mncord 4K · frame ${n}`, 120, 260);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return c.captureStream(rate).getVideoTracks()[0]!;
}

async function startScreen(rate: number): Promise<MediaStreamTrack[]> {
  if (p.get('legacy') === '1') {
    // Electron's desktop source path: frame rate goes straight to the native capturer
    const sources = await window.mncord.capture.listSources();
    const screenSrc = sources.find((s) => s.id.startsWith('screen:'))!;
    const s = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSrc.id,
          maxWidth: Number(p.get('capw') ?? 3840),
          maxHeight: Number(p.get('caph') ?? 2160),
          minFrameRate: Math.min(rate, 60),
          maxFrameRate: rate,
        },
      } as unknown as MediaTrackConstraints,
    });
    return s.getTracks();
  }
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: Number(p.get('capw') ?? 3840) },
      height: { ideal: Number(p.get('caph') ?? 2160) },
      frameRate: { ideal: rate, max: rate },
    },
    audio: true,
  });
  return s.getTracks();
}

async function startMic(suppression: Suppression): Promise<MicChain | null> {
  try {
    const raw = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 48000 },
    });
    return await createMicChain(raw, { ...DEFAULT_MIC, suppression });
  } catch (e) {
    console.warn('mic unavailable', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return null;
  }
}

// ── stats ──────────────────────────────────────────────────────────────
type Sample = Record<string, number | string | boolean | undefined>;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};
function summarise(samples: Sample[]) {
  const use = samples.slice(WARMUP_S);
  const nums = (k: string) => use.map((s) => s[k]).filter((v): v is number => typeof v === 'number');
  const out: Record<string, unknown> = { samples: use.length };
  for (const k of ['fps', 'captureFps', 'kbps', 'width', 'height', 'jitterMs', 'audioKbps', 'micLevelDb']) {
    const v = nums(k);
    if (v.length) out[k] = { median: +median(v).toFixed(1), min: +Math.min(...v).toFixed(1), max: +Math.max(...v).toFixed(1) };
  }
  const last = use.at(-1) ?? {};
  for (const k of ['codec', 'encoder', 'decoder', 'powerEfficient', 'qualityLimitation', 'framesDropped', 'freezeCount', 'freezeSeconds']) out[k] = last[k];
  out.limitationCounts = use.reduce<Record<string, number>>((acc, s) => {
    const r = String(s.qualityLimitation ?? 'none');
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
  return out;
}

function codecName(report: RTCStatsReport, codecId?: string) {
  const c = codecId ? (report.get(codecId) as { mimeType?: string } | undefined) : undefined;
  return c?.mimeType?.replace('video/', '').replace('audio/', '');
}

let prevBytes = new Map<string, { bytes: number; ts: number }>();
function kbps(id: string, bytes: number, ts: number) {
  const prev = prevBytes.get(id);
  prevBytes.set(id, { bytes, ts });
  return prev ? ((bytes - prev.bytes) * 8) / (ts - prev.ts) : undefined; // bytes/ms*8 = kbit/s
}

async function publisherSample(videoPub: LocalTrackPublication | undefined, audioPub: LocalTrackPublication | undefined, mic: MicChain | null): Promise<Sample> {
  const s: Sample = {};
  const sender = videoPub?.track?.sender;
  if (sender) {
    const r = await sender.getStats();
    r.forEach((st) => {
      if (st.type === 'outbound-rtp' && st.kind === 'video') {
        s.fps = st.framesPerSecond;
        s.width = st.frameWidth;
        s.height = st.frameHeight;
        s.kbps = kbps(st.id, st.bytesSent, st.timestamp);
        s.encoder = st.encoderImplementation;
        s.powerEfficient = st.powerEfficientEncoder;
        s.qualityLimitation = st.qualityLimitationReason;
        s.codec = codecName(r, st.codecId);
      }
      if (st.type === 'media-source' && st.kind === 'video') s.captureFps = st.framesPerSecond;
    });
  }
  const aSender = audioPub?.track?.sender;
  if (aSender) {
    const r = await aSender.getStats();
    r.forEach((st) => {
      if (st.type === 'outbound-rtp' && st.kind === 'audio') s.audioKbps = kbps(st.id, st.bytesSent, st.timestamp);
    });
  }
  if (mic) s.micLevelDb = +mic.levelDb().toFixed(1);
  return s;
}

async function viewerSample(track: RemoteTrack | undefined): Promise<Sample> {
  const s: Sample = {};
  const receiver = track?.receiver;
  if (!receiver) return s;
  const r = await receiver.getStats();
  r.forEach((st) => {
    if (st.type === 'inbound-rtp' && st.kind === 'video') {
      s.fps = st.framesPerSecond;
      s.width = st.frameWidth;
      s.height = st.frameHeight;
      s.kbps = kbps(st.id, st.bytesReceived, st.timestamp);
      s.decoder = st.decoderImplementation;
      s.framesDropped = st.framesDropped;
      s.freezeCount = st.freezeCount;
      s.freezeSeconds = st.totalFreezesDuration;
      s.jitterMs = st.jitterBufferEmittedCount ? (st.jitterBufferDelay / st.jitterBufferEmittedCount) * 1000 : undefined;
      s.codec = codecName(r, st.codecId);
    }
  });
  return s;
}

function show(obj: unknown) {
  statsEl.textContent = JSON.stringify(obj, null, 2);
}

// ── roles ──────────────────────────────────────────────────────────────
async function runPublisher(auto: boolean, opts = { mode, fps, codec, suppression: 'gtcrn' as Suppression }) {
  const room = await connect(`pub-${Date.now()}`);
  const mic = await startMic(opts.suppression);
  let audioPub: LocalTrackPublication | undefined;
  if (mic) {
    audioPub = await room.localParticipant.publishTrack(mic.track, {
      source: Track.Source.Microphone,
      audioPreset: { maxBitrate: 128_000 },
      dtx: true,
      red: true,
    });
  }
  const tracks = opts.mode === 'canvas4k' ? [startCanvas4k(opts.fps)] : await startScreen(opts.fps);
  const video = tracks.find((t) => t.kind === 'video')!;
  video.contentHint = 'motion';
  $<HTMLVideoElement>('video').srcObject = new MediaStream([video]);
  const settings = video.getSettings();
  const is4k = (settings.width ?? 0) >= 3000 || opts.mode === 'canvas4k';
  const videoPub = await room.localParticipant.publishTrack(video, {
    source: Track.Source.ScreenShare,
    videoCodec: opts.codec,
    backupCodec: false,
    simulcast: false,
    degradationPreference: 'maintain-framerate',
    videoEncoding: { maxBitrate: is4k ? 45_000_000 : 25_000_000, maxFramerate: opts.fps, priority: 'high' },
    screenShareEncoding: { maxBitrate: is4k ? 45_000_000 : 25_000_000, maxFramerate: opts.fps, priority: 'high' },
  });
  const sysAudio = tracks.find((t) => t.kind === 'audio');
  if (sysAudio) await room.localParticipant.publishTrack(sysAudio, { source: Track.Source.ScreenShareAudio, audioPreset: { maxBitrate: 256_000 }, dtx: false, red: false });

  const samples: Sample[] = [];
  const timer = setInterval(async () => {
    const s = await publisherSample(videoPub, audioPub, mic);
    samples.push(s);
    show({ capture: settings, mic: mic ? 'gtcrn chain on' : 'no mic', live: s });
  }, 1000);
  if (auto) {
    setTimeout(async () => {
      clearInterval(timer);
      await window.mncord.spike.report('publisher', { captureSettings: settings, micChain: !!mic, systemAudio: !!sysAudio, summary: summarise(samples) });
    }, seconds * 1000);
  }
  return { room, mic, stop: () => clearInterval(timer) };
}

async function runViewer(auto: boolean) {
  let videoTrack: RemoteTrack | undefined;
  const onTrack = (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video) {
      videoTrack = track;
      track.attach($<HTMLVideoElement>('video'));
    } else {
      track.attach(); // play remote audio
    }
  };
  const room = await connect(`view-${Date.now()}`, (r) => {
    r.on(RoomEvent.TrackSubscribed, onTrack);
    r.on(RoomEvent.TrackSubscriptionFailed, (sid, pp, reason) => console.warn('subscription failed', sid, pp.identity, reason));
  });
  // and anything that was already subscribed by the time connect() resolved
  for (const pp of room.remoteParticipants.values()) for (const pub of pp.trackPublications.values()) if (pub.track && !videoTrack) onTrack(pub.track);
  const samples: Sample[] = [];
  const timer = setInterval(async () => {
    const s = await viewerSample(videoTrack);
    if (videoTrack) samples.push(s);
    show({ subscribed: !!videoTrack, live: s });
  }, 1000);
  if (auto) {
    setTimeout(async () => {
      clearInterval(timer);
      await window.mncord.spike.report('viewer', { summary: summarise(samples) });
    }, (seconds - 1.5) * 1000);
  }
}

async function runManual() {
  const controls = $('controls');
  controls.innerHTML = `
    <select id="m-res" class="h-8 rounded-sm border border-border-input bg-surface-input px-2 text-sm">
      <option value="60">60 fps</option><option value="120" selected>120 fps</option><option value="144">144 fps</option></select>
    <select id="m-codec" class="h-8 rounded-sm border border-border-input bg-surface-input px-2 text-sm">
      <option>h264</option><option>av1</option><option>vp9</option><option>h265</option></select>
    <select id="m-ns" class="h-8 rounded-sm border border-border-input bg-surface-input px-2 text-sm">
      <option value="gtcrn">AI noise (GTCRN)</option><option value="rnnoise">RNNoise</option><option value="off">No suppression</option></select>
    <button id="m-share" class="h-8 rounded-sm bg-accent px-3 text-sm font-semibold text-on-accent">Pick screen & go live</button>
    <button id="m-watch" class="h-8 rounded-sm bg-surface-raised px-3 text-sm font-semibold">Join as viewer</button>`;
  $('m-watch').onclick = () => void runViewer(false);
  $('m-share').onclick = async () => {
    const list = $('sources');
    list.classList.replace('hidden', 'grid');
    const sources = await window.mncord.capture.listSources();
    list.innerHTML = '';
    for (const s of sources) {
      const b = document.createElement('button');
      b.className = 'flex flex-col gap-1 rounded-md bg-surface p-2 text-start text-xs hover:bg-surface-hover';
      b.innerHTML = `<img src="${s.thumbnail}" alt="" class="aspect-video w-full rounded-sm object-cover" /><span class="truncate"></span>`;
      b.querySelector('span')!.textContent = s.name;
      b.onclick = async () => {
        list.classList.replace('grid', 'hidden');
        await window.mncord.capture.selectSource(s.id);
        await runPublisher(false, {
          mode: 'screen',
          fps: Number(($('m-res') as HTMLSelectElement).value),
          codec: ($('m-codec') as HTMLSelectElement).value as VideoCodec,
          suppression: ($('m-ns') as HTMLSelectElement).value as Suppression,
        });
      };
      list.append(b);
    }
  };
}

function runMotion() {
  // full-screen animation at display refresh rate, so screen capture has real 120/144 Hz content
  document.body.innerHTML = '<canvas id="m" style="position:fixed;inset:0;width:100vw;height:100vh"></canvas>';
  const c = document.getElementById('m') as HTMLCanvasElement;
  c.width = innerWidth * devicePixelRatio;
  c.height = innerHeight * devicePixelRatio;
  const g = c.getContext('2d', { alpha: false })!;
  let n = 0;
  const loop = () => {
    n++;
    g.fillStyle = `hsl(${(n * 3) % 360} 50% 18%)`;
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `hsl(${(i * 47 + n * 5) % 360} 80% 60%)`;
      g.fillRect(((n * 9 + i * 97) % (c.width + 200)) - 200, (i * 61) % c.height, 200, 120);
    }
    g.fillStyle = '#fff';
    g.font = 'bold 96px Inter, sans-serif';
    g.fillText(`frame ${n}`, 80, c.height - 80);
    if (n % 600 === 0) console.warn(`motion rAF fps ≈ ${(600 / ((performance.now() - t0) / 1000)).toFixed(1)}`), (t0 = performance.now());
    requestAnimationFrame(loop);
  };
  let t0 = performance.now();
  requestAnimationFrame(loop);
}

const start =
  role === 'publisher' ? runPublisher(true) : role === 'viewer' ? runViewer(true) : role === ('motion' as string) ? runMotion() : runManual();
Promise.resolve(start).catch((e: unknown) => {
  setState('error');
  show({ error: String(e) });
  if (role !== 'manual') void window.mncord.spike.report(role, { error: String(e) });
});
