// Per-device appearance and audio preferences (localStorage, wrapped: storage may be unavailable).
import { create } from 'zustand';
import type { MicSettings, Suppression } from '../media/micChain';

export interface Prefs {
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
  mic: Partial<Omit<MicSettings, 'suppression'>>;
  streamQuality: '720p30' | '1080p30' | '1080p60' | '1440p60' | '1440p100';
  streamAudio: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
  closeToTray: boolean;
  notifications: boolean;
}

const DEFAULTS: Prefs = {
  theme: 'midnight', density: 'cozy', fontScale: 100, reducedMotion: false, inputDeviceId: 'default', outputDeviceId: 'default', suppression: 'gtcrn',
  inputMode: 'vad', ptt: { kind: 'key', code: 'Backquote' }, pttReleaseMs: 200, userVolumes: {}, mic: {}, streamQuality: '1440p100', streamAudio: true,
  echoCancellation: true, autoGain: false, closeToTray: true, notifications: true,
};
const KEY = 'mncord.prefs';

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

export const usePrefs = create<Prefs>(load);

export function setPrefs(patch: Partial<Prefs>) {
  usePrefs.setState(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(usePrefs.getState()));
  } catch {
    /* ignore */
  }
  apply();
void window.mncord?.window.setCloseToTray(usePrefs.getState().closeToTray);
usePrefs.subscribe((s, prev) => {
  if (s.closeToTray !== prev.closeToTray) void window.mncord?.window.setCloseToTray(s.closeToTray);
});
}

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
  // tokens are px-based, so scale the whole UI the way browser zoom does
  (document.body?.style as CSSStyleDeclaration & { zoom: string }).zoom = String(p.fontScale / 100);
}
apply();
