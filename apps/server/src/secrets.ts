// Encryption at rest for small secrets (TOTP seeds). AES-256-GCM, random 12-byte IV, auth tag appended.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

let key: Buffer | null = null;
function getKey() {
  if (key) return key;
  const env = process.env.SECRETS_KEY; // 32 bytes, base64
  if (env) key = Buffer.from(env, 'base64');
  else {
    if (config.isProd) throw new Error('SECRETS_KEY required in production');
    const file = join(config.dataDir, 'secrets.key');
    if (existsSync(file)) key = readFileSync(file);
    else {
      mkdirSync(config.dataDir, { recursive: true });
      key = randomBytes(32);
      writeFileSync(file, key, { mode: 0o600 });
    }
  }
  if (key.length !== 32) throw new Error('SECRETS_KEY must be 32 bytes');
  return key;
}

export function seal(plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', getKey(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]);
}

export function open(sealed: Uint8Array): string {
  const buf = Buffer.from(sealed);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const d = createDecipheriv('aes-256-gcm', getKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString('utf8');
}
