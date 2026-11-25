// Encryption at rest for small secrets (TOTP seeds). AES-256-GCM, random 12-byte IV, auth tag appended.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { env } from './config.ts';

let key: Buffer | null = null;
function getKey() {
  if (key) return key;
  const k = env().SECRETS_KEY; // 32 bytes, base64 (Worker secret / .dev.vars)
  if (!k) throw new Error('SECRETS_KEY not set');
  const b = Buffer.from(k, 'base64');
  if (b.length !== 32) throw new Error('SECRETS_KEY must be 32 bytes');
  key = b;
  return b;
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
