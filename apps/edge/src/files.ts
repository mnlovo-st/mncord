// Files live in R2: attachments at "f/<id>" (private, signed expiring links), profile pictures / server icons /
// emoji at "a/<id>" (public). Uploads are R2 multipart uploads whose parts go straight to the Worker with a
// short-lived signed token, so big videos never pass through the Hub.
import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './config.ts';

export const PART_SIZE = 50 * 1024 * 1024; // R2 needs ≥ 5 MB parts (except the last); the Worker body cap is 100 MB
const URL_TTL_S = 7 * 24 * 3600;
const UPLOAD_TTL_S = 2 * 3600;

function key() {
  const k = env().FILES_SIGNING_KEY;
  if (!k) throw new Error('FILES_SIGNING_KEY not set');
  return Buffer.from(k, 'base64');
}
const mac = (data: string) => createHmac('sha256', key()).update(data).digest('base64url');
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const objectKey = (id: string, kind: string) => (kind === 'attachment' ? `f/${id}` : `a/${id}`);

/** URL the client can load directly (no auth header needed for <img>/<video>). */
export function signedUrl(base: string, id: string, ttl = URL_TTL_S) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return `${base}/files/${id}?exp=${exp}&sig=${mac(`file.${id}.${exp}`)}`;
}
export function verifySig(id: string, exp: string, s: string) {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
  try {
    return same(mac(`file.${id}.${e}`), String(s));
  } catch {
    return false;
  }
}

export interface UploadToken { fileId: string; key: string; uploadId: string; parts: number; exp: number }
export function uploadToken(t: Omit<UploadToken, 'exp'>) {
  const body = Buffer.from(JSON.stringify({ ...t, exp: Math.floor(Date.now() / 1000) + UPLOAD_TTL_S })).toString('base64url');
  return `${body}.${mac(`up.${body}`)}`;
}
export function verifyUploadToken(tok: string): UploadToken | null {
  const i = tok.lastIndexOf('.');
  if (i < 0) return null;
  const body = tok.slice(0, i);
  try {
    if (!same(mac(`up.${body}`), tok.slice(i + 1))) return null;
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UploadToken;
    return t.exp > Date.now() / 1000 ? t : null;
  } catch {
    return null;
  }
}

export const PUBLIC_BASE = () => env().PUBLIC_URL ?? 'http://127.0.0.1:8787';
