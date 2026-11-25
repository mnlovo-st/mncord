// Runs the M0 media spike scenarios headlessly-ish (two real Electron windows) and prints a table.
// Needs: infra/dev-bin/livekit-server.exe --dev running, and the dev token server (npm run dev:token -w @mncord/server).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const outDir = resolve(app, '../../replica/spike');
mkdirSync(outDir, { recursive: true });
const electron = createRequire(import.meta.url)('electron'); // path to electron.exe

const scenarios = (process.argv[2] ?? 'canvas4k:120:h264,canvas4k:120:av1,screen:120:h264,screen:144:av1')
  .split(',')
  .map((s) => {
    const [mode, fps, codec, secs] = s.split(':');
    return { mode, fps: Number(fps), codec, secs: secs ?? '25' };
  });

const build = spawnSync('npx', ['electron-vite', 'build'], { cwd: app, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

const rows = [];
for (const sc of scenarios) {
  const file = join(outDir, `m0-${sc.mode}-${sc.fps}-${sc.codec}.json`);
  if (existsSync(file)) rmSync(file);
  console.log(`\n▶ ${sc.mode} ${sc.fps}fps ${sc.codec}`);
  spawnSync(electron, ['.'], {
    cwd: app,
    stdio: 'inherit',
    env: { ...process.env, MNCORD_SPIKE: sc.mode, MNCORD_SPIKE_FPS: String(sc.fps), MNCORD_SPIKE_CODEC: sc.codec, MNCORD_SPIKE_SECONDS: sc.secs, MNCORD_SPIKE_OUT: file },
    timeout: 180_000,
  });
  if (!existsSync(file)) {
    rows.push({ scenario: `${sc.mode} ${sc.fps} ${sc.codec}`, result: 'NO REPORT' });
    continue;
  }
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const pub = r.publisher?.summary ?? {};
  const view = r.viewer?.summary ?? {};
  rows.push({
    scenario: `${sc.mode} ${sc.fps} ${sc.codec}`,
    error: r.publisher?.error ?? r.viewer?.error ?? '',
    res: pub.width ? `${pub.width.median}x${pub.height.median}` : '-',
    capFps: pub.captureFps?.median ?? '-',
    sendFps: pub.fps?.median ?? '-',
    sendMinFps: pub.fps?.min ?? '-',
    recvFps: view.fps?.median ?? '-',
    recvMinFps: view.fps?.min ?? '-',
    mbps: pub.kbps ? +(pub.kbps.median / 1000).toFixed(1) : '-',
    encoder: pub.encoder ?? '-',
    decoder: view.decoder ?? '-',
    codec: pub.codec ?? '-',
    limited: JSON.stringify(pub.limitationCounts ?? {}),
    freezes: view.freezeCount ?? '-',
    mic: r.publisher?.micChain ? 'yes' : 'no',
  });
}
console.log('\nM0 results');
console.table(rows);
