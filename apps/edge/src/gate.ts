// Account gate: a new account must (1) verify its email and (2) be approved once by the owner before it can
// use anything. Owner = OWNER_EMAIL if set, otherwise the very first account. On in production
// (ACCOUNT_GATE=1); tests switch it on per database with /__dev/gate.
import { env } from './config.ts';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';

let gateDb: Db | null = null;
export const setGateDb = (db: Db) => void (gateDb = db);

export function gateOn(): boolean {
  if (env().ACCOUNT_GATE === '1') return true;
  return gateDb?.querySync<{ v: string }>(`select v from schema_meta where k = 'gate'`).at(0)?.v === '1';
}

export function isOwner(db: Db, userId: string): boolean {
  const owner = env().OWNER_EMAIL?.trim().toLowerCase();
  if (owner) return !!db.querySync(`select 1 from users where id = $1 and lower(email) = $2`, [userId, owner]).length;
  const first = db.querySync<{ id: string }>(`select id from users order by created_at, id limit 1`).at(0);
  return first?.id === userId;
}

export interface AccountState { verified: boolean; approved: boolean; owner: boolean }
export function accountState(db: Db, userId: string): AccountState {
  const u = db.querySync<{ verified: boolean; approvedAt: string | null }>(
    `select email_verified as verified, approved_at as "approvedAt" from users where id = $1`,
    [userId],
  )[0];
  const owner = isOwner(db, userId);
  if (!gateOn()) return { verified: !!u?.verified, approved: true, owner };
  return { verified: !!u?.verified, approved: owner || !!u?.approvedAt, owner };
}

// Routes a waiting account may still use: sign-in plumbing, its own profile, verifying, checking approval.
const OPEN = [
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/users\/@me$/,
  /^\/api\/v1\/users\/@me\/approval$/,
  /^\/api\/v1\/users\/@me\/email$/,
  /^\/api\/v1\/users\/@me\/sessions/,
];

/** Called after the token check: refuses everything else until the email is verified and the owner approved. */
export function enforceGate(userId: string, method: string, path: string) {
  if (!gateDb || !gateOn()) return;
  if (OPEN.some((re) => re.test(path)) && !(path === '/api/v1/users/@me' && method === 'DELETE')) return;
  const s = accountState(gateDb, userId);
  if (!s.verified) throw new HttpError(403, 'email_unverified');
  if (!s.approved) throw new HttpError(403, 'approval_pending');
}
