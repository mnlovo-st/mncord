// Starts, once for the whole test run: a fake Cloudflare Realtime API and the real Worker in `wrangler dev`
// (workerd, Durable Object SQLite, local R2). Each test file then uses its own database instance.
import { spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

interface CfCall { method: string; path: string; body: unknown; auth: string | undefined }
let fake: Server;
let wrangler: ChildProcess;
let dir: string;

function startFakeCf() {
  const calls: CfCall[] = [];
  let sessions = 0;
  let mids = 0;
  fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const path = req.url ?? '';
      res.setHeader('content-type', 'application/json');
      if (path === '/__calls') return res.end(JSON.stringify(calls));
      const body = raw ? JSON.parse(raw) : undefined;
      calls.push({ method: req.method ?? '', path, body, auth: req.headers.authorization });
      if (req.headers.authorization !== 'Bearer test-secret') return res.writeHead(401).end(JSON.stringify({ errorCode: 'unauthorized' }));
      if (path.endsWith('/sessions/new')) return res.end(JSON.stringify({ sessionId: `sess-${++sessions}` }));
      if (path.endsWith('/tracks/new')) {
        const b = body as { sessionDescription?: unknown; tracks: { location: string; trackName: string; mid?: string }[] };
        if (b.sessionDescription) return res.end(JSON.stringify({ sessionDescription: { type: 'answer', sdp: 'v=0 fake-answer' }, tracks: b.tracks.map((t) => ({ mid: t.mid, trackName: t.trackName })) }));
        return res.end(JSON.stringify({ sessionDescription: { type: 'offer', sdp: 'v=0 fake-offer' }, requiresImmediateRenegotiation: true, tracks: b.tracks.map((t) => ({ mid: String(100 + ++mids), trackName: t.trackName })) }));
      }
      if (path.endsWith('/renegotiate')) return res.end('{}');
      if (path.endsWith('/tracks/close')) {
        const b = body as { sessionDescription?: unknown };
        return res.end(JSON.stringify(b.sessionDescription ? { sessionDescription: { type: 'answer', sdp: 'v=0 fake-close' } } : {}));
      }
      res.writeHead(404).end('{}');
    });
  });
  return new Promise<number>((r) => fake.listen(0, '127.0.0.1', () => r((fake.address() as { port: number }).port)));
}

export default async function setup(project: TestProject) {
  const cfPort = await startFakeCf();
  const port = 8790 + Math.floor(Math.random() * 100);
  dir = mkdtempSync(join(tmpdir(), 'mncord-edge-'));
  const { privateKey } = generateKeyPairSync('ed25519');
  const envFile = join(dir, 'test.env');
  const vars: Record<string, string> = {
    DEV_TOOLS: '1',
    RATE_LIMIT_SCALE: '100',
    PUBLIC_URL: `http://127.0.0.1:${port}`,
    CF_RTC_BASE: `http://127.0.0.1:${cfPort}`,
    CF_REALTIME_APP_ID: 'test-app',
    CF_REALTIME_APP_SECRET: 'test-secret',
    JWT_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: 'jwk' })),
    SECRETS_KEY: randomBytes(32).toString('base64'),
    FILES_SIGNING_KEY: randomBytes(32).toString('base64'),
  };
  writeFileSync(envFile, Object.entries(vars).map(([k, v]) => `${k}='${v}'`).join('\n'));
  const cwd = resolve(import.meta.dirname, '..');
  wrangler = spawn(
    process.execPath,
    [resolve(cwd, '../../node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--port', String(port), '--ip', '127.0.0.1',
      '--env-file', envFile, '--persist-to', join(dir, 'state'), '--show-interactive-dev-session=false', '--log-level', 'warn'],
    { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  wrangler.stdout!.on('data', (d) => (log += d));
  wrangler.stderr!.on('data', (d) => {
    log += d;
    if (process.env.EDGE_LOG) process.stderr.write(d);
  });
  const base = `http://127.0.0.1:${port}`;
  const until = Date.now() + 90_000;
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error(`wrangler dev did not start:\n${log}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  project.provide('edgeBase', base);
  project.provide('cfBase', `http://127.0.0.1:${cfPort}`);
  return async () => {
    wrangler.kill();
    fake.close();
    await new Promise((r) => setTimeout(r, 300));
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may keep the sqlite files a moment longer */
    }
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    edgeBase: string;
    cfBase: string;
  }
}
