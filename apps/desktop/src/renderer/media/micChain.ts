// mncord mic processing chain. Runs entirely on the user's PC (no server cost).
//   mic → high-pass → noise suppression (GTCRN AI | RNNoise | off) → noise gate
//       → 3-band EQ → compressor → makeup gain → limiter → output track
// Every stage can be bypassed live; settings are plain JSON so presets can be saved.
import { GtcrnWorkletNode, loadGtcrn, loadRnnoise, NoiseGateWorkletNode, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import gtcrnWorkletUrl from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import noiseGateWorkletUrl from '@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url';
import gtcrnWasmUrl from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

export type Suppression = 'off' | 'rnnoise' | 'gtcrn';

export interface MicSettings {
  suppression: Suppression;
  highpassHz: number; // 0 = off
  gate: { enabled: boolean; openDb: number; closeDb: number; holdMs: number };
  eq: { lowDb: number; midDb: number; highDb: number };
  compressor: { enabled: boolean; thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; makeupDb: number };
  limiter: { enabled: boolean; ceilingDb: number };
  inputGainDb: number;
}

export const DEFAULT_MIC: MicSettings = {
  suppression: 'gtcrn',
  highpassHz: 80,
  gate: { enabled: true, openDb: -50, closeDb: -56, holdMs: 200 },
  eq: { lowDb: 0, midDb: 0, highDb: 1.5 },
  compressor: { enabled: true, thresholdDb: -24, ratio: 3, attackMs: 5, releaseMs: 120, makeupDb: 4 },
  limiter: { enabled: true, ceilingDb: -1 },
  inputGainDb: 0,
};

const dbToGain = (db: number) => 10 ** (db / 20);
const wasmCache = new Map<string, Promise<ArrayBuffer>>();
const cached = (key: string, load: () => Promise<ArrayBuffer>) => {
  if (!wasmCache.has(key)) wasmCache.set(key, load());
  return wasmCache.get(key)!;
};

export interface MicChain {
  track: MediaStreamTrack;
  context: AudioContext;
  /** RMS level of the processed signal in dBFS (for meters) */
  levelDb(): number;
  /** RMS level before processing, for the sensitivity slider */
  inputLevelDb(): number;
  update(next: MicSettings): Promise<void>;
  setMonitoring(on: boolean): void;
  destroy(): void;
}

export async function createMicChain(input: MediaStream, initial: MicSettings = DEFAULT_MIC): Promise<MicChain> {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  await Promise.all([
    ctx.audioWorklet.addModule(gtcrnWorkletUrl),
    ctx.audioWorklet.addModule(rnnoiseWorkletUrl),
    ctx.audioWorklet.addModule(noiseGateWorkletUrl),
  ]);

  const src = ctx.createMediaStreamSource(input);
  const inGain = ctx.createGain();
  const inMeter = ctx.createAnalyser();
  inMeter.fftSize = 1024;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  const suppressIn = ctx.createGain(); // fixed anchor points so stages can be swapped
  const suppressOut = ctx.createGain();
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 200;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1500;
  mid.Q.value = 0.8;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 5000;
  const comp = ctx.createDynamicsCompressor();
  const makeup = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  const outMeter = ctx.createAnalyser();
  outMeter.fftSize = 1024;
  const dest = ctx.createMediaStreamDestination();
  const monitor = ctx.createGain();
  monitor.gain.value = 0;

  src.connect(inGain).connect(inMeter);
  inGain.connect(hp).connect(suppressIn);
  suppressOut.connect(low).connect(mid).connect(high);
  // compressor/limiter are wired in update() so they can be bypassed
  outMeter.connect(dest);
  outMeter.connect(monitor).connect(ctx.destination);

  let stage: AudioNode[] = [];
  let settings = initial;

  const rms = (a: AnalyserNode) => {
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9);
  };

  async function buildSuppression(s: MicSettings) {
    for (const n of stage) {
      n.disconnect();
      (n as { destroy?: () => void }).destroy?.();
    }
    suppressIn.disconnect();
    stage = [];
    if (s.suppression === 'gtcrn') {
      const wasmBinary = await cached('gtcrn', () => loadGtcrn({ url: gtcrnWasmUrl }));
      stage.push(new GtcrnWorkletNode(ctx, { wasmBinary, maxChannels: 1 }));
    } else if (s.suppression === 'rnnoise') {
      const wasmBinary = await cached('rnnoise', () => loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }));
      stage.push(new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 }));
    }
    if (s.gate.enabled) {
      stage.push(new NoiseGateWorkletNode(ctx, { openThreshold: s.gate.openDb, closeThreshold: s.gate.closeDb, holdMs: s.gate.holdMs, maxChannels: 1 }));
    }
    let prev: AudioNode = suppressIn;
    for (const n of stage) {
      prev.connect(n);
      prev = n;
    }
    prev.connect(suppressOut);
  }

  function wireDynamics(s: MicSettings) {
    high.disconnect();
    comp.disconnect();
    makeup.disconnect();
    limiter.disconnect();
    let prev: AudioNode = high;
    if (s.compressor.enabled) {
      prev.connect(comp);
      comp.connect(makeup);
      prev = makeup;
    }
    if (s.limiter.enabled) {
      prev.connect(limiter);
      prev = limiter;
    }
    prev.connect(outMeter);
  }

  function applyParams(s: MicSettings) {
    const t = ctx.currentTime;
    inGain.gain.setTargetAtTime(dbToGain(s.inputGainDb), t, 0.02);
    hp.frequency.setTargetAtTime(s.highpassHz > 0 ? s.highpassHz : 10, t, 0.02);
    low.gain.setTargetAtTime(s.eq.lowDb, t, 0.02);
    mid.gain.setTargetAtTime(s.eq.midDb, t, 0.02);
    high.gain.setTargetAtTime(s.eq.highDb, t, 0.02);
    comp.threshold.setTargetAtTime(s.compressor.thresholdDb, t, 0.02);
    comp.ratio.setTargetAtTime(s.compressor.ratio, t, 0.02);
    comp.attack.setTargetAtTime(s.compressor.attackMs / 1000, t, 0.02);
    comp.release.setTargetAtTime(s.compressor.releaseMs / 1000, t, 0.02);
    makeup.gain.setTargetAtTime(dbToGain(s.compressor.makeupDb), t, 0.02);
    limiter.threshold.setTargetAtTime(s.limiter.ceilingDb, t, 0.02);
  }

  async function update(next: MicSettings) {
    const rebuild =
      next.suppression !== settings.suppression ||
      next.gate.enabled !== settings.gate.enabled ||
      next.gate.openDb !== settings.gate.openDb ||
      next.gate.closeDb !== settings.gate.closeDb ||
      next.gate.holdMs !== settings.gate.holdMs;
    settings = next;
    applyParams(next);
    wireDynamics(next);
    if (rebuild) await buildSuppression(next);
  }

  applyParams(settings);
  wireDynamics(settings);
  await buildSuppression(settings);
  if (ctx.state === 'suspended') await ctx.resume();

  const track = dest.stream.getAudioTracks()[0]!;
  return {
    track,
    context: ctx,
    levelDb: () => rms(outMeter),
    inputLevelDb: () => rms(inMeter),
    update,
    setMonitoring: (on) => monitor.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02),
    destroy: () => {
      for (const n of stage) (n as { destroy?: () => void }).destroy?.();
      input.getTracks().forEach((t) => t.stop());
      track.stop();
      void ctx.close();
    },
  };
}

/**
 * Raw microphone: the track from the device goes out untouched (no suppression, gate, EQ, compressor,
 * limiter). A side analyser only reads the level for meters and the speaking ring.
 */
export async function createRawMic(input: MediaStream): Promise<MicChain> {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  const track = input.getAudioTracks()[0]!;
  const src = ctx.createMediaStreamSource(input);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const level = () => {
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9);
  };
  let monitoring = false;
  return {
    track,
    context: ctx,
    levelDb: level,
    inputLevelDb: level,
    update: async () => {},
    setMonitoring(on: boolean) {
      if (on === monitoring) return;
      monitoring = on;
      if (on) src.connect(ctx.destination);
      else src.disconnect(ctx.destination);
    },
    destroy() {
      input.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
