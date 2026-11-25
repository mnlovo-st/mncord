// Voice + video + Go Live over Cloudflare Realtime SFU (through our server). The mic goes through the
// mncord processing chain; remote audio plays through Web Audio so per-user volume can reach 400%.
import type { MediaSource, RtcJoin } from '@mncord/shared';
import { create } from 'zustand';
import { createMicChain, DEFAULT_MIC, type MicChain, type MicSettings, type Suppression } from '../media/micChain';
import { api } from './api';
import { send } from './gateway';
import { setPrefs, usePrefs } from './prefs';
import { RtcEngine } from './rtc';
import { playSound } from './sounds';
import { get as getApp, set as setApp } from './store';

interface VoiceUi {
  channelId: string | null;
  guildId: string | null;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string | null;
  muted: boolean;
  deafened: boolean;
  serverMuted: boolean;
  serverDeafened: boolean;
  suppression: Suppression;
  camera: boolean;
  streaming: boolean;
  pttActive: boolean;
  allowed: MediaSource[];
  videoAllowed: boolean;
}
export const useVoice = create<VoiceUi>(() => ({
  channelId: null,
  guildId: null,
  status: 'idle',
  error: null,
  muted: false,
  deafened: false,
  serverMuted: false,
  serverDeafened: false,
  suppression: usePrefs.getState().suppression,
  camera: false,
  streaming: false,
  pttActive: false,
  allowed: [],
  videoAllowed: true,
}));
const setV = useVoice.setState;
const getV = useVoice.getState;

/** Video tracks to render (remote and local) + what each person is publishing (to offer "Watch stream"). */
export interface MediaTiles { camera?: MediaStreamTrack; screen?: MediaStreamTrack }
export const useMedia = create<{ tiles: Record<string, MediaTiles>; available: Record<string, MediaSource[]> }>(() => ({ tiles: {}, available: {} }));
const setTile = (userId: string, kind: keyof MediaTiles, track: MediaStreamTrack | undefined) =>
  useMedia.setState((s) => {
    const cur = { ...s.tiles[userId], [kind]: track };
    const tiles = { ...s.tiles };
    if (!cur.camera && !cur.screen) delete tiles[userId];
    else tiles[userId] = cur;
    return { tiles };
  });

let engine: RtcEngine | null = null;
let mic: MicChain | null = null;
let pttOff: (() => void) | null = null;
let pttTimer: ReturnType<typeof setTimeout> | null = null;
let speakTimer: ReturnType<typeof setInterval> | null = null;

// ── remote audio through Web Audio: gain per user (0–400%) + level meter for speaking rings
let actx: AudioContext | null = null;
const remoteAudio = new Map<string, { el: HTMLAudioElement; src: MediaStreamAudioSourceNode; gain: GainNode; meter: AnalyserNode; userId: string }>();
function audioCtx() {
  if (!actx) {
    actx = new AudioContext({ latencyHint: 'interactive' });
    const out = usePrefs.getState().outputDeviceId;
    if (out !== 'default') void (actx as AudioContext & { setSinkId?(id: string): Promise<void> }).setSinkId?.(out).catch(() => {});
  }
  return actx;
}
function playRemote(key: string, userId: string, track: MediaStreamTrack) {
  stopRemote(key);
  const ctx = audioCtx();
  const stream = new MediaStream([track]);
  // Chromium only starts pulling remote WebRTC audio into Web Audio when an element also consumes the stream
  const el = new Audio();
  el.srcObject = stream;
  el.muted = true;
  void el.play().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain();
  const meter = ctx.createAnalyser();
  meter.fftSize = 512;
  src.connect(meter);
  src.connect(gain).connect(ctx.destination);
  remoteAudio.set(key, { el, src, gain, meter, userId });
  applyUserVolume(userId);
}
function stopRemote(key: string) {
  const r = remoteAudio.get(key);
  if (!r) return;
  r.src.disconnect();
  r.gain.disconnect();
  r.el.srcObject = null;
  remoteAudio.delete(key);
}
function applyUserVolume(userId: string) {
  const vol = getV().deafened || getV().serverDeafened ? 0 : (usePrefs.getState().userVolumes[userId] ?? 1);
  for (const r of remoteAudio.values()) if (r.userId === userId) r.gain.gain.setTargetAtTime(vol, audioCtx().currentTime, 0.02);
}
export function setUserVolume(userId: string, vol: number) {
  setPrefs({ userVolumes: { ...usePrefs.getState().userVolumes, [userId]: Math.max(0, Math.min(4, vol)) } });
  applyUserVolume(userId);
}
const rms = (a: AnalyserNode) => {
  const buf = new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(buf);
  let s = 0;
  for (const v of buf) s += v * v;
  return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9);
};
function startSpeakingMeter() {
  if (speakTimer) clearInterval(speakTimer);
  speakTimer = setInterval(() => {
    const speaking: Record<string, boolean> = {};
    for (const r of remoteAudio.values()) if (rms(r.meter) > -50) speaking[r.userId] = true;
    const me = getApp().me?.id;
    const v = getV();
    if (me && mic && !v.muted && !v.serverMuted && (usePrefs.getState().inputMode === 'vad' || v.pttActive) && mic.levelDb() > -50) speaking[me] = true;
    const prev = getApp().speaking;
    if (Object.keys(prev).length !== Object.keys(speaking).length || Object.keys(speaking).some((k) => !prev[k])) setApp({ speaking });
  }, 120);
}

const micSettings = (): MicSettings => ({ ...DEFAULT_MIC, ...usePrefs.getState().mic, suppression: getV().suppression });

function publishState() {
  const v = getV();
  if (!v.channelId) return;
  send({ op: 'voice_state', guildId: v.guildId, channelId: v.channelId, selfMute: v.muted || v.deafened || v.serverMuted || (usePrefs.getState().inputMode === 'ptt' && !v.pttActive), selfDeaf: v.deafened, selfVideo: v.camera, selfStream: v.streaming });
}

/** The mic is live only when: not muted, not deafened, not server-muted, and (voice activity or PTT held). */
function syncMic() {
  if (!mic) return;
  const v = getV();
  const live = !v.muted && !v.deafened && !v.serverMuted && (usePrefs.getState().inputMode === 'vad' || v.pttActive);
  mic.track.enabled = live; // disabled tracks send silence frames: tiny and keeps the session alive
}

function setupPtt() {
  pttOff?.();
  pttOff = null;
  const prefs = usePrefs.getState();
  if (prefs.inputMode !== 'ptt' || !prefs.ptt) {
    void window.mncord?.ptt.configure(null);
    return;
  }
  const onState = (down: boolean) => {
    if (pttTimer) clearTimeout(pttTimer);
    if (down) {
      if (!getV().pttActive) playSound('ptt_on');
      setV({ pttActive: true });
      syncMic();
      publishState();
    } else {
      pttTimer = setTimeout(() => {
        setV({ pttActive: false });
        playSound('ptt_off');
        syncMic();
        publishState();
      }, usePrefs.getState().pttReleaseMs);
    }
  };
  if (window.mncord) {
    void window.mncord.ptt.configure(prefs.ptt);
    pttOff = window.mncord.ptt.onState(onState);
  } else {
    const b = prefs.ptt;
    const down = (e: KeyboardEvent | MouseEvent) => {
      if ((b.kind === 'key' && e instanceof KeyboardEvent && e.code === b.code && !e.repeat) || (b.kind === 'mouse' && e instanceof MouseEvent && e.button === b.button)) onState(true);
    };
    const up = (e: KeyboardEvent | MouseEvent) => {
      if ((b.kind === 'key' && e instanceof KeyboardEvent && e.code === b.code) || (b.kind === 'mouse' && e instanceof MouseEvent && e.button === b.button)) onState(false);
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('mousedown', down);
    addEventListener('mouseup', up);
    pttOff = () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('mousedown', down);
      removeEventListener('mouseup', up);
    };
  }
}
usePrefs.subscribe((s, prev) => {
  if (s.inputMode !== prev.inputMode || JSON.stringify(s.ptt) !== JSON.stringify(prev.ptt)) {
    if (getV().channelId) setupPtt();
    syncMic();
    publishState();
  }
  if (JSON.stringify(s.mic) !== JSON.stringify(prev.mic) && mic) void mic.update(micSettings());
});

/** Auto-subscribe: everyone's mic and camera. Screen shares only when you press "Watch". */
const AUTO: MediaSource[] = ['mic', 'camera'];
async function syncSubscriptions(userId: string, sources: MediaSource[]) {
  const e = engine;
  if (!e || userId === getApp().me?.id) return;
  useMedia.setState((s) => ({ available: { ...s.available, [userId]: sources } }));
  e.forgetUser(userId, sources); // tracks they stopped
  const want = sources.filter((s) => AUTO.includes(s) && !(s === 'camera' && !getV().videoAllowed)).map((source) => ({ userId, source }));
  if (want.length && !getV().serverDeafened) await e.subscribe(want).catch((err) => console.warn('[voice] subscribe failed', err));
}

export async function joinVoice(guildId: string | null, channelId: string) {
  if (getV().channelId === channelId && getV().status !== 'error') return;
  await leaveVoice();
  setV({ channelId, guildId, status: 'connecting', error: null, camera: false, streaming: false, pttActive: false });
  try {
    const join = await api<RtcJoin>('POST', `/voice/${channelId}/join`);
    setV({ serverMuted: join.serverMute, serverDeafened: join.serverDeaf, allowed: join.allowed, videoAllowed: join.videoAllowed });
    const e = new RtcEngine(channelId, join);
    engine = e;
    e.onTrack = (userId, source, track) => {
      if (source === 'mic' || source === 'screen_audio') playRemote(`${userId}:${source}`, userId, track);
      else setTile(userId, source === 'screen' ? 'screen' : 'camera', track);
      track.addEventListener('ended', () => e.onEnded(userId, source));
    };
    e.onEnded = (userId, source) => {
      if (source === 'mic' || source === 'screen_audio') stopRemote(`${userId}:${source}`);
      else setTile(userId, source === 'screen' ? 'screen' : 'camera', undefined);
    };
    e.onState = (s) => {
      if (s === 'failed') {
        playSound('disconnect');
        // rejoin cleanly (new session, everything renegotiated)
        const { guildId: g, channelId: c } = getV();
        if (c) void leaveVoice().then(() => joinVoice(g, c));
      }
    };
    publishState(); // you're in the channel now (others see you; the server lets you pull)

    if (join.allowed.includes('mic')) {
      try {
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: usePrefs.getState().inputDeviceId !== 'default' ? { ideal: usePrefs.getState().inputDeviceId } : undefined,
            echoCancellation: usePrefs.getState().echoCancellation, noiseSuppression: false, autoGainControl: usePrefs.getState().autoGain, channelCount: 1, sampleRate: 48000,
          },
        });
        mic = await createMicChain(raw, micSettings());
        syncMic();
        await e.publish(mic.track, 'mic', { maxBitrate: Math.min(join.bitrate, 510_000) });
      } catch (err) {
        console.warn('[voice] mic unavailable', err);
        setV({ error: (err as Error).name === 'NotAllowedError' ? 'mic_denied' : null, muted: true });
      }
    }
    for (const p of join.participants) await syncSubscriptions(p.userId, p.sources);
    setV({ status: 'connected' });
    setupPtt();
    startSpeakingMeter();
    playSound('join');
    publishState();
  } catch (err) {
    console.error('[voice] join failed', err);
    setV({ status: 'error', error: (err as { code?: string }).code ?? 'unknown' });
    await engine?.close();
    engine = null;
  }
}

export async function leaveVoice() {
  const had = getV().channelId;
  pttOff?.();
  pttOff = null;
  void window.mncord?.ptt.configure(null);
  if (speakTimer) clearInterval(speakTimer);
  speakTimer = null;
  mic?.destroy();
  mic = null;
  for (const k of [...remoteAudio.keys()]) stopRemote(k);
  const e = engine;
  engine = null;
  await e?.close();
  useMedia.setState({ tiles: {}, available: {} });
  if (had) {
    const v = getV();
    send({ op: 'voice_state', guildId: v.guildId, channelId: null, selfMute: v.muted, selfDeaf: v.deafened });
    playSound('leave');
  }
  setV({ channelId: null, guildId: null, status: 'idle', camera: false, streaming: false, pttActive: false, serverMuted: false, serverDeafened: false });
  setApp({ speaking: {} });
}

/** Gateway: someone in your call started/stopped publishing. */
export function onRtcTracks(d: { channelId: string; userId: string; sources: MediaSource[] }) {
  if (d.channelId !== getV().channelId) return;
  const before = useMedia.getState().available[d.userId] ?? [];
  if (d.sources.includes('screen') && !before.includes('screen')) playSound('stream_start');
  if (!d.sources.includes('screen') && before.includes('screen')) playSound('stream_stop');
  void syncSubscriptions(d.userId, d.sources);
}

/** Gateway: a moderator server-muted/deafened you or your permissions changed. */
export function onRtcForce(d: { channelId: string; serverMute: boolean; serverDeaf: boolean; allowed: MediaSource[] }) {
  if (d.channelId !== getV().channelId || !engine) return;
  setV({ serverMuted: d.serverMute, serverDeafened: d.serverDeaf, allowed: d.allowed });
  for (const s of ['mic', 'camera', 'screen', 'screen_audio'] as MediaSource[]) if (!d.allowed.includes(s) && engine.isPublishing(s)) engine.dropLocal(s);
  if (!d.allowed.includes('camera')) setTile(getApp().me?.id ?? 'me', 'camera', undefined);
  if (!d.allowed.includes('screen')) setTile(getApp().me?.id ?? 'me', 'screen', undefined);
  setV({ camera: getV().camera && d.allowed.includes('camera'), streaming: getV().streaming && d.allowed.includes('screen') });
  for (const r of remoteAudio.values()) applyUserVolume(r.userId);
  syncMic();
  publishState();
}

export async function setMuted(muted: boolean) {
  setV({ muted });
  playSound(muted ? 'mute' : 'unmute');
  syncMic();
  publishState();
}

export async function setDeafened(deafened: boolean) {
  setV({ deafened });
  playSound(deafened ? 'deafen' : 'undeafen');
  for (const r of remoteAudio.values()) applyUserVolume(r.userId);
  syncMic();
  publishState();
}

export async function setSuppression(s: Suppression) {
  setV({ suppression: s });
  setPrefs({ suppression: s });
  if (mic) await mic.update(micSettings());
}

// ── camera
export async function toggleCamera() {
  const e = engine;
  if (!e) return;
  const me = getApp().me?.id ?? 'me';
  if (getV().camera) {
    await e.unpublish('camera');
    setTile(me, 'camera', undefined);
    setV({ camera: false });
  } else {
    if (!getV().allowed.includes('camera')) return;
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
    const track = s.getVideoTracks()[0]!;
    await e.publish(track, 'camera', { maxBitrate: 2_500_000, simulcast: true });
    setTile(me, 'camera', track);
    setV({ camera: true });
  }
  publishState();
}

// ── Go Live. Up to 60 fps through Chromium; higher rates need the mncord-capture helper.
export const STREAM_PRESETS = {
  '720p30': { width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
  '1080p30': { width: 1920, height: 1080, fps: 30, bitrate: 4_500_000 },
  '1080p60': { width: 1920, height: 1080, fps: 60, bitrate: 8_000_000 },
  '1440p60': { width: 2560, height: 1440, fps: 60, bitrate: 14_000_000 },
} as const;

export async function startStream(sourceId: string) {
  const e = engine;
  if (!e || !getV().allowed.includes('screen')) return;
  const prefs = usePrefs.getState();
  const q = STREAM_PRESETS[prefs.streamQuality];
  await window.mncord?.capture.selectSource(sourceId);
  const media = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.fps, max: q.fps } },
    audio: prefs.streamAudio && sourceId.startsWith('screen:'),
  });
  const video = media.getVideoTracks()[0];
  if (!video) return;
  video.contentHint = q.fps >= 60 ? 'motion' : 'detail';
  await e.publish(video, 'screen', { maxBitrate: q.bitrate, maxFramerate: q.fps, degradation: q.fps >= 60 ? 'maintain-framerate' : 'maintain-resolution' });
  const audio = media.getAudioTracks()[0];
  if (audio) await e.publish(audio, 'screen_audio', { maxBitrate: 256_000 });
  video.addEventListener('ended', () => void stopStream());
  setTile(getApp().me?.id ?? 'me', 'screen', video);
  setV({ streaming: true });
  playSound('stream_start');
  publishState();
}

export async function stopStream() {
  const e = engine;
  if (!e || !getV().streaming) return;
  await e.unpublish('screen');
  await e.unpublish('screen_audio');
  setTile(getApp().me?.id ?? 'me', 'screen', undefined);
  setV({ streaming: false });
  playSound('stream_stop');
  publishState();
}

/** Start/stop receiving someone's screen share (only while watching, to save bandwidth). */
export async function watchStream(userId: string) {
  const e = engine;
  if (!e) return;
  const avail = useMedia.getState().available[userId] ?? [];
  const want = (['screen', 'screen_audio'] as MediaSource[]).filter((s) => avail.includes(s)).map((source) => ({ userId, source }));
  if (want.length) await e.subscribe(want);
}
export async function stopWatching(userId: string) {
  const e = engine;
  if (!e) return;
  await e.unsubscribe(userId, 'screen');
  await e.unsubscribe(userId, 'screen_audio');
}

/** Live mic level for meters (dBFS), or null when not in voice. */
export const micLevel = () => (mic ? mic.levelDb() : null);
export const voiceUsers = (channelId: string) => Object.values(getApp().voice).filter((v) => v.channelId === channelId);
