import { createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { config } from '../config.ts';
import type { Queryable } from '../db.ts';
import { HttpError } from '../http.ts';

export const hashPassword = (p: string) => hash(p, config.argon2);

export async function checkPassword(db: Queryable, userId: string, password: string) {
  const { rows } = await db.query<{ h: string | null }>(`select password_hash as h from accounts where user_id = $1 and provider_id = 'credential'`, [userId]);
  const h = rows[0]?.h;
  if (!h || !(await verify(h, password).catch(() => false))) throw new HttpError(403, 'wrong_password', 'password');
}

/**
 * Have I Been Pwned range check (k-anonymity: only the first 5 hex chars of the SHA-1 leave the server).
 * Fails open after 2 s so an outage never blocks sign-ups. On in production, off in dev/tests unless HIBP=1.
 */
export async function rejectBreached(password: string) {
  const enabled = process.env.HIBP ? process.env.HIBP === '1' : config.isProd;
  if (!enabled) return;
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  try {
    const r = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'mncord-server' },
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return;
    const suffix = sha1.slice(5);
    for (const line of (await r.text()).split('\n')) {
      const [s, count] = line.trim().split(':');
      if (s === suffix && Number(count) > 0) throw new HttpError(400, 'password_breached', 'password');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
}
