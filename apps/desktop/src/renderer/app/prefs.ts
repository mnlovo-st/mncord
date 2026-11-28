// Per-device appearance and audio preferences (localStorage, wrapped: storage may be unavailable).
import { create } from 'zustand';
import type { MicSettings, Suppression } from '../media/micChain';

export interface Prefs {
  /** bumped when defaults change in a way old saved settings should pick up */
  v: number;
  theme: 'midnight' | 'light' | 'amoled';
  density: 'cozy' | 'compact';
  fontScale: number; // percent
  reducedMotion: boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  suppression: Suppression;
  inputMode: 'vad' | 'ptt';
  ptt: { kind: 'key'; code: string } | { kind: 'mouse'; button: number } | null;
  pttReleaseMs: number;
  userVolumes: Record<string, number>; // userId → 0..4 (400%)
  /** people you muted for yourself only */
  localMutes: Record<string, boolean>;
  mic: Partial<Omit<MicSettings, 'suppression'>>;
  /** Go Live: picked resolution + frame rate (the server's daily cap can lower them) */
  streamRes: 720 | 1080 | 1440;
  streamFps: 15 | 30 | 60 | 100;
  streamMode: 'gaming' | 'screenshare' | 'custom';
  streamAudio: boolean;
  echoCancellation: boolean;
  /** send the microphone exactly as it is: no processing at all */
  rawMic: boolean;
  autoGain: boolean;
  /** everything you hear in calls, 0..200 % */
  outputVolume: number;
  /** app sounds (join, mute, messages…), 0..100 % */
  soundVolume: number;
  mutedSounds: string[];
  closeToTray: boolean;
  notifications: boolean;
  /** show "Playing X" to others */
  shareActivity: boolean;
  /** games you added yourself: exe name → shown name */
  customGames: Record<string, string>;
  /** detected games you hid */
  hiddenGames: string[];
  hideMutedChannels: boolean;
  collapsed: Record<string, boolean>; // category id → collapsed
  showNonVideo: boolean;
  showOwnCamera: boolean;
  /** the last version whose "What's new" you've seen */
  seenVersion: string;
  /** layout: hide the server rail / channel sidebar / member list */
  hideRail: boolean;
  hideSidebar: boolean;
  hideMembers: boolean;
}

const DEFAULTS: Prefs = {
  v: 2,
  theme: 'midnight', density: 'cozy', fontScale: 100, reducedMotion: false, inputDeviceId: 'default', outputDeviceId: 'default', suppression: 'rnnoise',
  inputMode: 'vad', ptt: { kind: 'key', code: 'Backquote' }, pttReleaseMs: 200, userVolumes: {}, localMutes: {}, mic: {},
  streamRes: 1080, streamFps: 30, streamMode: 'custom', streamAudio: true,
  echoCancellation: true, rawMic: false, autoGain: false, outputVolume: 100, soundVolume: 70, mutedSounds: [], closeToTray: true, notifications: true,
  shareActivity: true, customGames: {}, hiddenGames: [], hideMutedChannels: false, collapsed: {}, showNonVideo: true, showOwnCamera: true, seenVersion: '', hideRail: false, hideSidebar: false, hideMembers: false,
};
const KEY = 'mncord.prefs';

function load(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs> & { streamQuality?: string };
    const p: Prefs = { ...DEFAULTS, ...saved };
    if ((saved.v ?? 1) < 2) {
      // v2: the old defaults made voices robotic or cut out on long vowels / loud moments
      if (saved.suppression === 'gtcrn' || !saved.suppression) p.suppression = 'rnnoise';
      const { gate: _g, compressor: _c, limiter: _l, ...rest } = p.mic;
      p.mic = rest;
      // sharing starts at 1080p 30 fps; raise it yourself in the Go Live picker
      p.streamRes = 1080;
      p.streamFps = 30;
      p.v = 2;
      delete (p as { streamQuality?: string }).streamQuality;
    }
    return p;
  } catch {
    return DEFAULTS;
  }
}

export const usePrefs = create<Prefs>(load);

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(usePrefs.getState()));
  } catch {
    /* ignore */
  }
}

export function setPrefs(patch: Partial<Prefs>) {
  usePrefs.setState(patch);
  save();
  apply();
}

void window.mncord?.window.setCloseToTray(usePrefs.getState().closeToTray);
usePrefs.subscribe((s, prev) => {
  if (s.closeToTray !== prev.closeToTray) void window.mncord?.window.setCloseToTray(s.closeToTray);
});
save(); // persist the migration

export function apply() {
  const p = usePrefs.getState();
  const el = document.documentElement;
  el.dataset.theme = p.theme;
  // Windows title bar strip + its native buttons in the theme's colours
  if (window.mncord?.platform === 'win32') {
    el.dataset.titlebar = 'true';
    requestAnimationFrame(() => {
      const cs = getComputedStyle(el);
      const hex = (v: string) => (/^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : null);
      const color = hex(cs.getPropertyValue('--c-bg-deep')) ?? '#0a0e16';
      const symbolColor = hex(cs.getPropertyValue('--c-text-muted')) ?? '#a3aec4';
      void window.mncord?.window.setTitleBar?.({ color, symbolColor });
    });
  }
  el.dataset.reducedMotion = String(p.reducedMotion);
  el.dataset.density = p.density;
  // UI size = the browser's own zoom (a CSS zoom on <body> threw every tooltip and menu off its anchor)
  const z = p.fontScale / 100;
  if (window.mncord?.window.setZoom) {
    window.mncord.window.setZoom(z);
    (document.body?.style as CSSStyleDeclaration & { zoom: string }).zoom = '';
    // the native window buttons stay 32 px tall whatever the zoom: keep our title bar the same height
    el.style.setProperty('--titlebar-h', el.dataset.titlebar === 'true' ? `${32 / z}px` : '0px');
  } else (document.body?.style as CSSStyleDeclaration & { zoom: string }).zoom = String(z);
}
apply();
