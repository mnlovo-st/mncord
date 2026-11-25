// 6-digit one-time codes for email verification and password reset.
// Stored hashed, 15-minute life, 5 attempts, one live code per purpose+user (a new one replaces the old).
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Queryable } from './db.ts';

export type CodePurpose = 'verify' | 'reset' | 'email_change';
const TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

const digest = (identifier: string, code: string) => createHash('sha256').update(`${identifier}|${code}`).digest();

export async function issueCode(db: Queryable, purpose: CodePurpose, subject: string): Promise<string> {
  const identifier = `${purpose}:${subject}`;
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await db.query(`delete from verifications where identifier = $1`, [identifier]);
  await db.query(`insert into verifications (identifier, value_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))`, [identifier, digest(identifier, code), TTL_MIN]);
  return code;
}

/** true once, then the code is gone. Wrong guesses count; the 5th kills the code. */
export async function consumeCode(db: Queryable, purpose: CodePurpose, subject: string, code: string): Promise<boolean> {
  const identifier = `${purpose}:${subject}`;
  if (!/^\d{6}$/.test(code)) return false;
  const { rows } = await db.query<{ id: string; valueHash: Uint8Array; attempts: number }>(
    `select id, value_hash as "valueHash", attempts from verifications where identifier = $1 and expires_at > now() order by created_at desc limit 1`,
    [identifier],
  );
  const row = rows[0];
  if (!row) return false;
  const want = Buffer.from(row.valueHash);
  const got = digest(identifier, code);
  if (want.length === got.length && timingSafeEqual(want, got)) {
    await db.query(`delete from verifications where identifier = $1`, [identifier]);
    return true;
  }
  if (row.attempts + 1 >= MAX_ATTEMPTS) await db.query(`delete from verifications where id = $1`, [row.id]);
  else await db.query(`update verifications set attempts = attempts + 1 where id = $1`, [row.id]);
  return false;
}
