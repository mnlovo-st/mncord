// Voice + video + Go Live over Cloudflare Realtime SFU (through our server). The mic goes through the
// mncord processing chain; remote audio plays through Web Audio so per-user volume can reach 400%.
import type { MediaSource, RtcJoin } from '@mncord/shared';
import { create } from 'zustand';
import { createMicChain, createRawMic, withDefaults, type MicChain, type MicSettings, type Suppression } from '../media/micChain';
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
export const useMedia = create<{ tiles: Record<string, MediaTiles>; available: Record<string, MediaSource[]>; gens: Record<string, Partial<Record<MediaSource, string>>> }>(() => ({ tiles: {}, available: {}, gens: {} }));
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
let master: DynamicsCompressorNode | null = null;
let outGain: GainNode | null = null;
const remoteAudio = new Map<string, { el: HTMLAudioElement; src: MediaStreamAudioSourceNode; gain: GainNode; meter: AnalyserNode; userId: string }>();
function audioCtx() {
  if (!actx) {
    actx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    // gentle leveller on everything you hear: a loud friend and a quiet one end up at a comfortable level,
    // and sudden peaks (laughs, shouts) are rounded off instead of clipping
    master = actx.createDynamicsCompressor();
    master.threshold.value = -26;
    master.knee.value = 18;
    master.ratio.value = 3;
    master.attack.value = 0.006;
    master.release.value = 0.22;
    outGain = actx.createGain();
    outGain.gain.value = usePrefs.getState().outputVolume / 100;
    master.connect(outGain).connect(actx.destination);
    const out = usePrefs.getState().outputDeviceId;
    if (out !== 'default') void (actx as AudioContext & { setSinkId?(id: string): Promise<void> }).setSinkId?.(out).catch(() => {});
  }
  return actx;
}
function playRemote(key: string, userId: string, track: MediaStreamTrack) {
  stopRemote(key);
  const ctx = audioCtx();
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
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
  src.connect(gain).connect(master ?? ctx.destination);
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
  const p = usePrefs.getState();
  const vol = getV().deafened || getV().serverDeafened || p.localMutes[userId] ? 0 : (p.userVolumes[userId] ?? 1);
  for (const r of remoteAudio.values()) if (r.userId === userId) r.gain.gain.setTargetAtTime(vol, audioCtx().currentTime, 0.02);
}
export function setLocalMute(userId: string, muted: boolean) {
  const m = { ...usePrefs.getState().localMutes };
  if (muted) m[userId] = true;
  else delete m[userId];
  setPrefs({ localMutes: m });
  applyUserVolume(userId);
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

const micSettings = (): MicSettings => withDefaults(usePrefs.getState().mic, getV().suppression);

/** Opens the microphone: either the full mncord chain, or raw (exactly what the device gives, untouched). */
async function openMic(): Promise<MicChain> {
  const p = usePrefs.getState();
  const device = p.inputDeviceId !== 'default' ? { ideal: p.inputDeviceId } : undefined;
  if (p.rawMic) {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: device, echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 } });
    return createRawMic(s);
  }
  const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: device, echoCancellation: p.echoCancellation, noiseSuppression: false, autoGainControl: p.autoGain, channelCount: 1, sampleRate: 48000 } });
  return createMicChain(s, micSettings());
}
let lastBitrate = 96_000;
/** raw mic: no DTX (every moment is sent as it is) and at least 128 kbps */
function micPublishOpts(channelBitrate: number) {
  lastBitrate = channelBitrate;
  const raw = usePrefs.getState().rawMic;
  const maxBitrate = Math.min(raw ? Math.max(channelBitrate, 128_000) : channelBitrate, 510_000);
  return { maxBitrate, opus: { usedtx: 0, maxaveragebitrate: maxBitrate } };
}
/** switching raw on/off during a call: reopen the mic and republish it */
async function reopenMic() {
  const e = engine;
  if (!e || !mic) return;
  const old = mic;
  try {
    const next = await openMic();
    mic = next;
    syncMic();
    // swap in place: no renegotiation, so nobody loses your voice; publish only if we weren't sending yet
    if (!(await e.replaceTrack('mic', next.track))) await e.publish(next.track, 'mic', micPublishOpts(lastBitrate));
    old.destroy();
  } catch (err) {
    console.warn('[voice] could not switch the microphone', err);
  }
}

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
  if (s.outputVolume !== prev.outputVolume && outGain && actx) outGain.gain.setTargetAtTime(s.outputVolume / 100, actx.currentTime, 0.03);
  if (s.outputDeviceId !== prev.outputDeviceId && actx) void (actx as AudioContext & { setSinkId?(id: string): Promise<void> }).setSinkId?.(s.outputDeviceId === 'default' ? '' : s.outputDeviceId).catch(() => {});
  if (s.inputDeviceId !== prev.inputDeviceId && mic) void reopenMic();
  if ((s.rawMic !== prev.rawMic || (!s.rawMic && (s.echoCancellation !== prev.echoCancellation || s.autoGain !== prev.autoGain))) && mic) void reopenMic();
});

/** Auto-subscribe: everyone's mic and camera. Screen shares only when you press "Watch". */
const AUTO: MediaSource[] = ['mic', 'camera'];
async function syncSubscriptions(userId: string, sources: MediaSource[], mids?: Partial<Record<MediaSource, string>>) {
  const e = engine;
  if (!e || userId === getApp().me?.id) return;
  const wasWatching = !!useMedia.getState().tiles[userId]?.screen;
  useMedia.setState((s) => ({ available: { ...s.available, [userId]: sources }, gens: { ...s.gens, [userId]: mids ?? {} } }));
  e.forgetUser(userId, sources); // tracks they stopped
  e.dropStale(userId, mids); // tracks they republished
  const want: { userId: string; source: MediaSource; gen?: string }[] = sources.filter((s) => AUTO.includes(s) && !(s === 'camera' && !getV().videoAllowed)).map((source) => ({ userId, source, gen: mids?.[source] }));
  // you were watching their stream and they restarted it: keep watching
  if (wasWatching && !useMedia.getState().tiles[userId]?.screen) for (const s of ['screen', 'screen_audio'] as MediaSource[]) if (sources.includes(s)) want.push({ userId, source: s, gen: mids?.[s] });
  if (want.length && !getV().serverDeafened) await e.subscribe(want).catch((err) => console.warn('[voice] subscribe failed', err));
}

let joinSeq = 0;
let rejoinTries = 0;
/** batch: one negotiation for everyone already in the room instead of one per person */
async function subscribeAll(e: RtcEngine, participants: { userId: string; sources: MediaSource[]; mids?: Partial<Record<MediaSource, string>> }[]) {
  const me = getApp().me?.id;
  const want: { userId: string; source: MediaSource; gen?: string }[] = [];
  const available = { ...useMedia.getState().available };
  for (const p of participants) {
    if (p.userId === me) continue;
    available[p.userId] = p.sources;
    for (const s of p.sources) if (AUTO.includes(s) && !(s === 'camera' && !getV().videoAllowed)) want.push({ userId: p.userId, source: s, gen: p.mids?.[s] });
  }
  useMedia.setState((st) => ({ available, gens: { ...st.gens, ...Object.fromEntries(participants.map((p) => [p.userId, p.mids ?? {}])) } }));
  if (want.length && !getV().serverDeafened) await e.subscribe(want).catch((err) => console.warn('[voice] subscribe failed', err));
}

export async function joinVoice(guildId: string | null, channelId: string) {
  const cur = getV();
  if (cur.channelId === channelId && cur.status !== 'error') return; // already here / already joining (double click)
  const seq = ++joinSeq;
  void audioCtx().resume().catch(() => {}); // start audio inside the click, so incoming voices are never held back by autoplay rules
  const stale = () => seq !== joinSeq;
  const switching = !!cur.channelId;
  // the UI moves right away; the old call is torn down in the background
  setV({ channelId, guildId, status: 'connecting', error: null, camera: false, streaming: false, pttActive: false });
  if (switching) await teardown(false);
  if (stale()) return;
  // open the mic while the server sets up the session (both take a moment; do them together)
  const micP: Promise<MicChain | Error> = openMic().catch((err: Error) => err);
  try {
    const join = await api<RtcJoin>('POST', `/voice/${channelId}/join`);
    if (stale()) {
      void micP.then((m) => !(m instanceof Error) && m.destroy());
      return;
    }
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
      if (s === 'connected') rejoinTries = 0;
      if (s === 'failed' && engine === e) {
        // rejoin cleanly (new session, everything renegotiated), a few times with a pause, then give up
        const { guildId: g, channelId: c } = getV();
        if (!c) return;
        if (rejoinTries >= 3) {
          rejoinTries = 0;
          playSound('disconnect');
          void teardown(true).then(() => setV({ channelId: null, guildId: null, status: 'error', error: 'rtc_unavailable' }));
          return;
        }
        rejoinTries++;
        void teardown(false).then(() => setTimeout(() => {
          if (getV().channelId !== c) return; // you left meanwhile
          setV({ channelId: null });
          void joinVoice(g, c);
        }, 800 * rejoinTries));
      }
    };
    publishState(); // you're in the channel now (others see you; the server lets you pull)
    setV({ status: 'connected' });
    if (!rejoinTries) playSound('join'); // quiet when we're just reconnecting
    setupPtt();
    startSpeakingMeter();

    const pubMic = (async () => {
      const m = await micP;
      if (stale() || engine !== e) {
        if (!(m instanceof Error)) m.destroy();
        return;
      }
      if (!join.allowed.includes('mic')) {
        if (!(m instanceof Error)) m.destroy();
        return;
      }
      if (m instanceof Error) {
        console.warn('[voice] mic unavailable', m);
        setV({ error: m.name === 'NotAllowedError' ? 'mic_denied' : null, muted: true });
        return;
      }
      mic = m;
      syncMic();
      await e.publish(m.track, 'mic', micPublishOpts(join.bitrate));
    })();
    await Promise.all([pubMic, subscribeAll(e, join.participants)]);
    if (!stale()) publishState();
  } catch (err) {
    if (stale()) return;
    console.error('[voice] join failed', err);
    void micP.then((m) => !(m instanceof Error) && m !== mic && m.destroy());
    setV({ status: 'error', error: (err as { code?: string }).code ?? 'unknown' });
    const e = engine;
    engine = null;
    await e?.close();
  }
}

/** stops everything local; `announce` tells the server you left (not needed when switching rooms) */
async function teardown(announce: boolean) {
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
  useMedia.setState({ tiles: {}, available: {}, gens: {} });
  setApp({ speaking: {} });
  if (announce) {
    const v = getV();
    send({ op: 'voice_state', guildId: v.guildId, channelId: null, selfMute: v.muted, selfDeaf: v.deafened });
  }
  await e?.close().catch(() => {});
}

export async function leaveVoice() {
  const had = getV().channelId;
  joinSeq++; // cancels a join that is still in progress
  if (!had) return;
  // instant: sound + UI first, network cleanup after
  playSound('leave');
  const closing = teardown(true);
  setV({ channelId: null, guildId: null, status: 'idle', camera: false, streaming: false, pttActive: false, serverMuted: false, serverDeafened: false });
  await closing;
}

/** Gateway: a moderator moved you to another voice channel. */
export function onVoiceMove(d: { guildId: string | null; channelId: string }) {
  if (!getV().channelId || getV().channelId === d.channelId) return;
  if (d.guildId) setApp((s) => ({ selectedChannel: { ...s.selectedChannel, [d.guildId!]: d.channelId } }));
  void joinVoice(d.guildId, d.channelId);
}

/** Gateway: someone in your call started/stopped publishing. */
export function onRtcTracks(d: { channelId: string; userId: string; sources: MediaSource[]; mids?: Partial<Record<MediaSource, string>> }) {
  if (d.channelId !== getV().channelId) return;
  const before = useMedia.getState().available[d.userId] ?? [];
  if (d.sources.includes('screen') && !before.includes('screen')) playSound('stream_start');
  if (!d.sources.includes('screen') && before.includes('screen')) playSound('stream_stop');
  void syncSubscriptions(d.userId, d.sources, d.mids);
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

// ── Go Live. The picker chooses resolution and frame rate; the server's daily cap can lower them.
const BITRATE: Record<number, Record<number, number>> = {
  720: { 15: 1_500_000, 30: 2_500_000, 60: 4_000_000, 100: 5_500_000 },
  1080: { 15: 2_500_000, 30: 4_500_000, 60: 8_000_000, 100: 10_000_000 },
  1440: { 15: 4_000_000, 30: 7_000_000, 60: 12_000_000, 100: 16_000_000 },
};
const CAPS: Record<string, { h: number; fps: number }> = {
  '1440p100': { h: 1440, fps: 100 }, '1440p60': { h: 1440, fps: 60 }, '1080p60': { h: 1080, fps: 60 }, '1080p30': { h: 1080, fps: 30 }, '720p30': { h: 720, fps: 30 },
};
export function streamQuality(cap?: string) {
  const p = usePrefs.getState();
  const c = (cap && CAPS[cap]) || { h: 1440, fps: 100 };
  const h = Math.min(p.streamRes, c.h) as 720 | 1080 | 1440;
  const fps = Math.min(p.streamFps, c.fps);
  return { width: Math.round((h * 16) / 9), height: h, fps, bitrate: BITRATE[h]![fps] ?? BITRATE[h]![30]! };
}

export async function startStream(sourceId: string) {
  const e = engine;
  if (!e || !getV().allowed.includes('screen')) return;
  const prefs = usePrefs.getState();
  // the server steps quality down when today's share of the free allowance is filling up
  const cap = await api<{ streamCap: string }>('GET', '/voice/stream-cap').then((r) => r.streamCap).catch(() => '1080p60');
  const q = streamQuality(cap);
  await window.mncord?.capture.selectSource(sourceId);
  const media = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.fps, max: q.fps } },
    audio: prefs.streamAudio && sourceId.startsWith('screen:'),
  });
  const video = media.getVideoTracks()[0];
  if (!video) return;
  video.contentHint = q.fps >= 60 || prefs.streamMode === 'gaming' ? 'motion' : 'detail';
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
  const gen = useMedia.getState().gens[userId] ?? {};
  const want = (['screen', 'screen_audio'] as MediaSource[]).filter((s) => avail.includes(s)).map((source) => ({ userId, source, gen: gen[source] }));
  if (want.length) await e.subscribe(want);
}
export async function stopWatching(userId: string) {
  const e = engine;
  if (!e) return;
  await e.unsubscribe(userId, 'screen');
  await e.unsubscribe(userId, 'screen_audio');
}

/**
 * Self-healing: every 8 s, if someone in your call has a mic/stream we aren't receiving (a missed update,
 * a republished track, a network blip), ask the server what they publish and subscribe again. Costs no
 * requests while everything is fine.
 */
let healStrikes = 0;
setInterval(() => {
  const e = engine;
  const v = getV();
  if (!e || v.status !== 'connected' || !v.channelId || v.serverDeafened) return;
  const me = getApp().me?.id;
  const inCall = Object.values(getApp().voice).filter((x) => x.channelId === v.channelId && x.userId !== me);
  const media = useMedia.getState();
  const missing = inCall.some((x) => {
    const avail = media.available[x.userId];
    if (!avail) return true; // never heard what they publish
    if (avail.includes('mic') && !e.isSubscribed(x.userId, 'mic')) return true;
    if (avail.includes('mic') && ![...remoteAudio.values()].some((r) => r.userId === x.userId)) return true; // subscribed but no audio arrived
    return false;
  });
  // only act when it's still wrong on the next check (a fresh subscription needs a moment to deliver audio)
  healStrikes = missing ? healStrikes + 1 : 0;
  if (healStrikes < 2) return;
  healStrikes = 0;
  void api<{ userId: string; sources: MediaSource[]; mids?: Partial<Record<MediaSource, string>> }[]>('GET', `/voice/${v.channelId}/participants`)
    .then((list) => {
      for (const p of list) {
        if (p.sources.includes('mic') && e.isSubscribed(p.userId, 'mic') && ![...remoteAudio.values()].some((r) => r.userId === p.userId)) void e.unsubscribe(p.userId, 'mic'); // dead copy: drop it on the server too, then pull fresh
        void syncSubscriptions(p.userId, p.sources, p.mids);
      }
    })
    .catch(() => {});
}, 8000);

/** ping to the voice server, refreshed every 3 s while in a call */
export const usePing = create<{ ms: number | null }>(() => ({ ms: null }));
setInterval(() => {
  const e = engine;
  if (!e || getV().status !== 'connected') {
    if (usePing.getState().ms !== null) usePing.setState({ ms: null });
    return;
  }
  void e.rtt().then((ms) => usePing.setState({ ms }));
}, 3000);

/** Live mic level for meters (dBFS), or null when not in voice. */
export const micLevel = () => (mic ? mic.levelDb() : null);
export const voiceUsers = (channelId: string) => Object.values(getApp().voice).filter((v) => v.channelId === channelId);
