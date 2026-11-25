import {
  ForgotInput,
  LoginInput,
  MfaLoginInput,
  oldEnough,
  RefreshInput,
  PreloginInput,
  RegisterInput,
  ResetInput,
  VerifyEmailInput,
  type AuthTokens,
  type MfaChallenge,
} from '@mncord/shared';
import type { App, Req } from '../shim.ts';
import { config } from '../config.ts';
import type { Db, Queryable } from '../db.ts';
import { HttpError, parse, requireAuth } from '../http.ts';
import { getSelf } from '../repo.ts';
import { fakeSalt, hashPassword, KDF, passwordMatches } from '../auth/passwords.ts';
import { verifySecondFactor } from '../auth/mfa.ts';
import { hashMatches, newRefreshSecret, sha256, signAccessToken, signMfaTicket, splitRefresh, verifyMfaTicket } from '../auth/tokens.ts';
import { consumeCode, issueCode } from '../codes.ts';
import { esc, sendMail, templates } from '../mail.ts';
import type { Hub } from '../gateway.ts';
import { accountState } from '../gate.ts';
import { announcePending } from './approvals.ts';


function ipPrefix(ip: string): string | null {
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return `${v4.split('.').slice(0, 3).join('.')}.0/24`;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::/48`;
  return null;
}

const header = (req: Req, name: string) => String(req.headers[name] ?? '').slice(0, 32) || null;

export async function createSession(q: Queryable, userId: string, req: Req, device?: string, familyId?: string): Promise<AuthTokens> {
  const secret = newRefreshSecret();
  const expires = new Date(Date.now() + config.refreshTtlDays * 86400_000);
  const { rows } = await q.query<{ id: string }>(
    `insert into sessions (user_id, token_hash, family_id, device_name, os, client_version, ip_prefix, expires_at)
     values ($1, $2, coalesce($3::uuid, uuidv7()), $4, $5, $6, $7::inet, $8) returning id`,
    [userId, sha256(secret), familyId ?? null, device ?? null, header(req, 'x-mncord-os'), header(req, 'x-mncord-version'), ipPrefix(req.ip), expires],
  );
  const sessionId = rows[0]!.id;
  return { accessToken: await signAccessToken(userId, sessionId), refreshToken: `${sessionId}.${secret}`, expiresIn: config.accessTtlSeconds };
}

async function userMailInfo(db: Queryable, userId: string) {
  const { rows } = await db.query<{ email: string; locale: 'en' | 'ar'; verified: boolean }>(
    `select email::text as email, locale, email_verified as verified from users where id = $1`,
    [userId],
  );
  return rows[0];
}

export async function sendVerifyCode(db: Queryable, userId: string) {
  const u = await userMailInfo(db, userId);
  if (!u || u.verified) return;
  const code = await issueCode(db, 'verify', userId);
  await sendMail({ to: u.email, ...templates.verify(u.locale, code) });
}

/** Sign-in finished (password + 2FA if any): cancel a pending deletion, alert on new devices, open a session. */
async function finishLogin(db: Db, userId: string, req: Req, device?: string) {
  await db.query(`update users set deletion_requested_at = null where id = $1 and deletion_requested_at is not null`, [userId]);
  const os = header(req, 'x-mncord-os');
  const seen = await db.query(
    `select 1 from sessions where user_id = $1 and coalesce(device_name, '') = coalesce($2, '') and coalesce(os, '') = coalesce($3, '')
       and created_at > now() - interval '90 days' limit 1`,
    [userId, device ?? null, os],
  );
  const hadAny = await db.query(`select 1 from sessions where user_id = $1 limit 1`, [userId]);
  const tokens = await createSession(db, userId, req, device);
  if (!seen.rows.length && hadAny.rows.length) {
    const u = await userMailInfo(db, userId);
    if (u) void sendMail({ to: u.email, ...templates.newDevice(u.locale, esc(`${device ?? 'Unknown device'} · ${os ?? ''}`)) }).catch(() => {});
  }
  return tokens;
}

export function authRoutes(app: App, db: Db, hub: Hub) {
  const strict = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

  app.post('/auth/register', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const input = parse(RegisterInput, req.body);
    if (!oldEnough(input.dateOfBirth)) throw new HttpError(400, 'too_young', 'dateOfBirth');
    const passwordHash = await hashPassword(input.password);
    const { tokens, userId } = await db.tx(async (q) => {
      const taken = await q.query<{ email: boolean; username: boolean }>(
        `select max(email = $1::citext) as email, max(username = $2::citext) as username from users where email = $1::citext or username = $2::citext`,
        [input.email, input.username],
      );
      if (taken.rows[0]?.email) throw new HttpError(409, 'email_taken', 'email');
      if (taken.rows[0]?.username) throw new HttpError(409, 'username_taken', 'username');
      const u = await q.query<{ id: string }>(
        `insert into users (email, username, display_name, date_of_birth, locale) values ($1, $2, $3, $4, $5) returning id`,
        [input.email, input.username, input.displayName ?? null, input.dateOfBirth, input.locale],
      );
      const id = u.rows[0]!.id;
      await q.query(`insert into accounts (user_id, provider_id, account_id, password_hash, password_salt) values ($1, 'credential', $2, $3, $4)`, [id, id, passwordHash, input.salt ?? null]);
      await q.query(`insert into user_settings (user_id) values ($1)`, [id]);
      return { tokens: await createSession(q, id, req, input.device), userId: id };
    });
    void sendVerifyCode(db, userId).catch((e) => req.log.error(e));
    return reply.status(201).send(tokens);
  });

  // Step 0 of sign-in: the salt for the on-device Argon2id. Unknown logins get a stable fake salt.
  app.post('/auth/prelogin', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const input = parse(PreloginInput, req.body);
    const { rows } = await db.query<{ salt: string | null }>(
      `select a.password_salt as salt from users u join accounts a on a.user_id = u.id and a.provider_id = 'credential'
        where u.email = $1::citext or u.username = $1::citext limit 1`,
      [input.login],
    );
    return { salt: rows[0]?.salt ?? fakeSalt(input.login), kdf: KDF };
  });

  app.post('/auth/login', strict, async (req): Promise<AuthTokens | MfaChallenge> => {
    const input = parse(LoginInput, req.body);
    const { rows } = await db.query<{ id: string; passwordHash: string | null; disabled: boolean; mfa: boolean }>(
      `select u.id, a.password_hash as "passwordHash", u.disabled_at is not null as disabled, u.two_factor_enabled as mfa
         from users u join accounts a on a.user_id = u.id and a.provider_id = 'credential'
        where u.email = $1::citext or u.username = $1::citext limit 1`,
      [input.login],
    );
    const row = rows[0];
    const ok = await passwordMatches(row?.passwordHash, input.password);
    if (!row || !ok || !row.passwordHash) throw new HttpError(401, 'invalid_login');
    if (row.disabled) throw new HttpError(403, 'account_disabled');
    if (row.mfa) return { mfaRequired: true, ticket: await signMfaTicket(row.id) };
    return finishLogin(db, row.id, req, input.device);
  });

  app.post('/auth/mfa', strict, async (req) => {
    const input = parse(MfaLoginInput, req.body);
    const userId = await verifyMfaTicket(input.ticket).catch(() => null);
    if (!userId) throw new HttpError(401, 'mfa_ticket_expired');
    const ok = await db.tx((q) => verifySecondFactor(q, userId, input.code));
    if (!ok) throw new HttpError(401, 'mfa_invalid', 'code');
    return finishLogin(db, userId, req, input.device);
  });

  app.post('/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { refreshToken } = parse(RefreshInput, req.body);
    const parts = splitRefresh(refreshToken);
    if (!parts) throw new HttpError(401, 'invalid_refresh');
    const result = await db.tx(async (q): Promise<AuthTokens | { reusedFamily: string; userId: string }> => {
      const { rows } = await q.query<{ userId: string; tokenHash: Uint8Array; familyId: string; revoked: boolean; expired: boolean; disabled: boolean }>(
        `select s.user_id as "userId", s.token_hash as "tokenHash", s.family_id as "familyId",
                s.revoked_at is not null as revoked, s.expires_at < now() as expired, u.disabled_at is not null as disabled
           from sessions s join users u on u.id = s.user_id where s.id = $1 for update of s`,
        [parts.sessionId],
      );
      const s = rows[0];
      if (!s || s.revoked || s.expired || s.disabled) throw new HttpError(401, 'invalid_refresh');
      // an old refresh token was replayed → someone copied it. Handled after this transaction commits
      // (throwing here would roll the revocation back).
      if (!hashMatches(parts.secret, s.tokenHash)) return { reusedFamily: s.familyId, userId: s.userId };
      const secret = newRefreshSecret();
      await q.query(`update sessions set token_hash = $2, last_seen_at = now(), expires_at = $3 where id = $1`, [
        parts.sessionId, sha256(secret), new Date(Date.now() + config.refreshTtlDays * 86400_000),
      ]);
      return { accessToken: await signAccessToken(s.userId, parts.sessionId), refreshToken: `${parts.sessionId}.${secret}`, expiresIn: config.accessTtlSeconds };
    });
    if ('reusedFamily' in result) {
      await db.query(`update sessions set revoked_at = now() where family_id = $1 and revoked_at is null`, [result.reusedFamily]);
      hub.kickSessions(result.userId);
      throw new HttpError(401, 'refresh_reused');
    }
    return result;
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    await db.query(`update sessions set revoked_at = now() where id = $1 and user_id = $2`, [req.sessionId, req.userId]);
    hub.closeSession(req.sessionId);
    return reply.status(204).send();
  });

  // ── email verification (S06)
  app.post('/auth/verify-email', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const { code } = parse(VerifyEmailInput, req.body);
    if (!(await consumeCode(db, 'verify', req.userId, code))) throw new HttpError(400, 'code_invalid', 'code');
    await db.query(`update users set email_verified = true where id = $1`, [req.userId]);
    void announcePending(db, hub, req.userId);
    return reply.status(204).send();
  });

  app.post('/auth/verify-email/resend', { preHandler: requireAuth, config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req, reply) => {
    await sendVerifyCode(db, req.userId);
    return reply.status(204).send();
  });

  // ── password reset (S05). Same answer whether or not the email exists.
  app.post('/auth/forgot', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const { email } = parse(ForgotInput, req.body);
    const { rows } = await db.query<{ id: string; locale: 'en' | 'ar' }>(`select id, locale from users where email = $1::citext and disabled_at is null`, [email]);
    const u = rows[0];
    if (u) {
      const code = await issueCode(db, 'reset', u.id);
      void sendMail({ to: email, ...templates.reset(u.locale, code) }).catch((e) => req.log.error(e));
    }
    return reply.status(204).send();
  });

  app.post('/auth/reset', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const input = parse(ResetInput, req.body);
    const { rows } = await db.query<{ id: string; locale: 'en' | 'ar'; mfa: boolean }>(
      `select id, locale, two_factor_enabled as mfa from users where email = $1::citext and disabled_at is null`,
      [input.email],
    );
    const u = rows[0];
    if (!u || !(await consumeCode(db, 'reset', u.id, input.code))) throw new HttpError(400, 'code_invalid', 'code');
    const h = await hashPassword(input.password);
    await db.tx(async (q) => {
      await q.query(`update accounts set password_hash = $2, password_salt = coalesce($3, password_salt), updated_at = now() where user_id = $1 and provider_id = 'credential'`, [u.id, h, input.salt ?? null]);
      await q.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [u.id]);
      // the reset code proves the inbox, so the email counts as verified
      await q.query(`update users set email_verified = true where id = $1`, [u.id]);
    });
    hub.kickSessions(u.id);
    void sendMail({ to: input.email, ...templates.passwordChanged(u.locale) }).catch(() => {});
    // 2FA still applies after a reset: the inbox alone must not be enough to take over the account
    if (u.mfa) return { mfaRequired: true, ticket: await signMfaTicket(u.id) } satisfies MfaChallenge;
    return createSession(db, u.id, req, input.device);
  });

  app.get('/users/@me', { preHandler: requireAuth }, async (req) => {
    const me = await getSelf(db, req.userId);
    if (!me) throw new HttpError(401, 'unauthorized');
    const s = accountState(db, req.userId);
    return { ...me, approved: s.approved, isOwner: s.owner };
  });
}

/** Used by the gateway: a valid JWT whose session hasn't been revoked. */
export async function sessionActive(db: Queryable, sessionId: string, userId: string) {
  const { rows } = await db.query(`select 1 from sessions where id = $1 and user_id = $2 and revoked_at is null and expires_at > now()`, [sessionId, userId]);
  return rows.length > 0;
}
