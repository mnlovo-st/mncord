// Passwords, Cloudflare edition. Workers Free gives 10 ms of CPU per request, too little for Argon2id, so the
// slow part runs on the user's device (the same design Bitwarden uses):
//   device:  key = Argon2id(password, salt, m=64 MiB, t=3, p=1)  → sent as "password"
//   server:  stores "v2$" + HMAC-SHA256(pepper, key)              → fast, constant-time compare
// A stolen database still costs an attacker one Argon2id per guess per account (salts are per account), and
// the pepper (from SECRETS_KEY) is not in the database at all. The breached-password check also runs on the
// device (k-anonymity range query), so the server never sees the real password.
import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config.ts';
import type { Queryable } from '../db.ts';
import { HttpError } from '../http.ts';

export const KDF = { alg: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 1, hashLength: 32 } as const;

const pepper = () => {
  const k = env().SECRETS_KEY;
  if (!k) throw new Error('SECRETS_KEY not set');
  return Buffer.from(k, 'base64');
};

export const hashPassword = async (clientKey: string) => `v2$${createHmac('sha256', pepper()).update(`pw:${clientKey}`).digest('base64url')}`;

export async function passwordMatches(stored: string | null | undefined, given: string) {
  const want = await hashPassword(given);
  const a = Buffer.from(stored ?? 'v2$' + 'x'.repeat(43));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b) && !!stored;
}

export async function checkPassword(db: Queryable, userId: string, password: string) {
  const { rows } = await db.query<{ h: string | null }>(`select password_hash as h from accounts where user_id = $1 and provider_id = 'credential'`, [userId]);
  if (!(await passwordMatches(rows[0]?.h, password))) throw new HttpError(403, 'wrong_password', 'password');
}

/** Same answer shape for real and unknown logins, so prelogin can't be used to discover accounts. */
export function fakeSalt(login: string) {
  return createHmac('sha256', pepper()).update(`salt:${login.trim().toLowerCase()}`).digest('base64url').slice(0, 22);
}

/** The breached-password check moved to the client; kept so older call sites stay valid. */
export async function rejectBreached(_password: string) {}
