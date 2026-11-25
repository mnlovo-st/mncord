// UI sounds. Drop mnlovo's files into src/renderer/assets/sounds/<name>.(ogg|wav|mp3) and they are used
// automatically; until then each sound has a short synthesized placeholder so nothing is silent.
import { usePrefs } from './prefs';

export type SoundName =
  | 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen'
  | 'message' | 'mention' | 'ring_in' | 'ring_out' | 'call_end'
  | 'stream_start' | 'stream_stop' | 'ptt_on' | 'ptt_off'
  | 'disconnect' | 'reconnect' | 'startup';

const files = import.meta.glob('../assets/sounds/*.{ogg,wav,mp3}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urlFor = (name: SoundName) => Object.entries(files).find(([path]) => path.split('/').pop()!.replace(/\.\w+$/, '') === name)?.[1];

// [frequency Hz, duration ms] steps, gentle sine. Placeholders only.
const SYNTH: Record<SoundName, [number, number][]> = {
  join: [[660, 70], [880, 110]],
  leave: [[880, 70], [587, 120]],
  mute: [[440, 60], [330, 80]],
  unmute: [[330, 60], [440, 80]],
  deafen: [[392, 60], [262, 120]],
  undeafen: [[262, 60], [392, 120]],
  message: [[988, 60], [1319, 90]],
  mention: [[1047, 70], [1319, 70], [1568, 110]],
  ring_in: [[740, 180], [0, 60], [740, 180], [0, 600]],
  ring_out: [[440, 400], [0, 900]],
  call_end: [[523, 90], [392, 90], [262, 160]],
  stream_start: [[523, 70], [659, 70], [784, 120]],
  stream_stop: [[784, 70], [659, 70], [523, 120]],
  ptt_on: [[1200, 30]],
  ptt_off: [[900, 30]],
  disconnect: [[330, 120], [220, 200]],
  reconnect: [[220, 80], [330, 80], [440, 120]],
  startup: [[392, 90], [523, 90], [659, 90], [784, 180]],
};

let ctx: AudioContext | null = null;
const volume = () => 0.5;

function synth(name: SoundName) {
  ctx ??= new AudioContext();
  const c = ctx;
  let t = c.currentTime + 0.01;
  for (const [hz, ms] of SYNTH[name]) {
    if (hz > 0) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18 * volume(), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + ms / 1000 + 0.02);
    }
    t += ms / 1000;
  }
  return (t - c.currentTime) * 1000;
}

function sinkAudio(url: string) {
  const a = new Audio(url);
  a.volume = volume();
  const out = usePrefs.getState().outputDeviceId;
  if (out !== 'default') void (a as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId?.(out).catch(() => {});
  return a;
}

export function playSound(name: SoundName) {
  try {
    const url = urlFor(name);
    if (url) void sinkAudio(url).play().catch(() => {});
    else synth(name);
  } catch {
    /* audio unavailable: never break the app for a sound */
  }
}

/** Loops a sound (ringtones) until the returned stop() is called. */
export function loopSound(name: SoundName): () => void {
  const url = urlFor(name);
  if (url) {
    const a = sinkAudio(url);
    a.loop = true;
    void a.play().catch(() => {});
    return () => a.pause();
  }
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const ms = synth(name);
    setTimeout(tick, ms);
  };
  tick();
  return () => {
    stopped = true;
  };
}
