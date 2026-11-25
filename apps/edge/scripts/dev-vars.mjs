// Writes apps/edge/.dev.vars (git-ignored) for local development: fresh random keys + DEV_TOOLS.
// Optional: copies the Cloudflare Realtime keys from ~/mncord-files/backup/cloudflare-server.env so voice works locally too.
//   node scripts/dev-vars.mjs [--out path] [--rtc-base url --rtc-id x --rtc-secret y]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = arg('--out') ?? join(here, '..', '.dev.vars');

const vars = {};
const legacy = join(homedir(), 'mncord-files', 'backup', 'cloudflare-server.env');
if (existsSync(legacy)) {
  for (const line of readFileSync(legacy, 'utf8').split(/\r?\n/)) {
    const m = /^(CF_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && m[2]) vars[m[1]] = m[2];
  }
}
if (arg('--rtc-base')) vars.CF_RTC_BASE = arg('--rtc-base');
if (arg('--rtc-id')) vars.CF_REALTIME_APP_ID = arg('--rtc-id');
if (arg('--rtc-secret')) vars.CF_REALTIME_APP_SECRET = arg('--rtc-secret');

const { privateKey } = generateKeyPairSync('ed25519');
Object.assign(vars, {
  DEV_TOOLS: '1',
  PUBLIC_URL: arg('--public-url') ?? 'http://127.0.0.1:8787',
  JWT_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: 'jwk' })),
  SECRETS_KEY: randomBytes(32).toString('base64'),
  FILES_SIGNING_KEY: randomBytes(32).toString('base64'),
  RATE_LIMIT_SCALE: arg('--rate-scale') ?? '1',
});
// .env syntax: single-quote values so JSON and base64 survive untouched
writeFileSync(out, Object.entries(vars).map(([k, v]) => `${k}='${v}'`).join('\n') + '\n', { mode: 0o600 });
console.log(`wrote ${out}`);
