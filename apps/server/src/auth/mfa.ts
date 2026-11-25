// TOTP (RFC 6238 via the `otpauth` library) + one-time backup codes.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import type { Queryable } from '../db.ts';
import { open, seal } from '../secrets.ts';

const totp = (secretB32: string, label = 'mncord') =>
  new OTPAuth.TOTP({ issuer: 'mncord', label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretB32) });

export function newTotpSecret(username: string) {
  const secret = new OTPAuth.Secret({ buffer: randomBytes(20).buffer as ArrayBuffer }).base32; // 32 chars
  return { secret, uri: totp(secret, username).toString() };
}

/** Returns the matched 30-second step, or null. ±1 step tolerance for clock drift. */
export function checkTotp(secretB32: string, code: string): number | null {
  const delta = totp(secretB32).validate({ token: code, window: 1 });
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / 30) + delta;
}

const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes
export function newBackupCodes(n = 10) {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    let c = '';
    for (let j = 0; j < 8; j++) c += BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)];
    codes.push(`${c.slice(0, 4)}-${c.slice(4)}`);
  }
  return codes;
}
export const hashBackup = (code: string) => createHash('sha256').update(code.replace('-', '').toLowerCase()).digest();

export async function saveTotp(db: Queryable, userId: string, secret: string, backupCodes: string[]) {
  await db.query(
    `insert into two_factors (user_id, secret_enc, backup_codes_hash, last_used_step) values ($1, $2, $3, 0)
     on conflict (user_id) do update set secret_enc = excluded.secret_enc, backup_codes_hash = excluded.backup_codes_hash, last_used_step = 0`,
    [userId, seal(secret), backupCodes.map(hashBackup)],
  );
  await db.query(`update users set two_factor_enabled = true where id = $1`, [userId]);
}

/**
 * Verifies a TOTP code (once per 30-second step: replays are refused) or consumes a backup code.
 * The row is locked so two parallel requests can't use the same code.
 */
export async function verifySecondFactor(db: Queryable, userId: string, code: string): Promise<'totp' | 'backup' | null> {
  const { rows } = await db.query<{ secretEnc: Uint8Array; backup: Uint8Array[]; lastStep: string | number }>(
    `select secret_enc as "secretEnc", backup_codes_hash as backup, last_used_step as "lastStep" from two_factors where user_id = $1 for update`,
    [userId],
  );
  const tf = rows[0];
  if (!tf) return null;
  const clean = code.trim().toLowerCase();
  if (/^\d{6}$/.test(clean)) {
    const step = checkTotp(open(tf.secretEnc), clean);
    if (step === null || step <= Number(tf.lastStep)) return null;
    await db.query(`update two_factors set last_used_step = $2 where user_id = $1`, [userId, step]);
    return 'totp';
  }
  const h = hashBackup(clean);
  const left = tf.backup.filter((b) => !Buffer.from(b).equals(h));
  if (left.length === tf.backup.length) return null;
  await db.query(`update two_factors set backup_codes_hash = $2 where user_id = $1`, [userId, left]);
  return 'backup';
}

export async function removeTotp(db: Queryable, userId: string) {
  await db.query(`delete from two_factors where user_id = $1`, [userId]);
  await db.query(`update users set two_factor_enabled = false where id = $1`, [userId]);
}

export async function backupCodesLeft(db: Queryable, userId: string) {
  const { rows } = await db.query<{ n: number }>(`select coalesce(array_length(backup_codes_hash, 1), 0)::int as n from two_factors where user_id = $1`, [userId]);
  return rows[0]?.n ?? 0;
}
