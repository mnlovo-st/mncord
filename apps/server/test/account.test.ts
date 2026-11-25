// M2: account security, end to end.
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthTokens, MfaChallenge, SelfUser, SessionInfo } from '@mncord/shared';
import { buildApp } from '../src/app.ts';
import { openDb, type Db } from '../src/db.ts';
import { outbox } from '../src/mail.ts';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let base = '';

async function api<T>(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const r = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: (text ? JSON.parse(text) : null) as T };
}
const lastCode = (to: string) => {
  const m = [...outbox].reverse().find((x) => x.to === to);
  return m?.text.match(/\d{6}/)?.[0] ?? '';
};
const totpAt = (secret: string, offsetSec = 0) =>
  new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offsetSec * 1000 });

beforeAll(async () => {
  db = await openDb({ memory: true });
  ({ app } = await buildApp(db));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
}, 60_000);
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('M2 account security', () => {
  const email = 'sara@example.test';
  let t: AuthTokens;
  let password = 'first password 123';

  it('register sends a verification code; 5 wrong tries burn the code', async () => {
    const r = await api<AuthTokens>('POST', '/auth/register', { email, username: 'sara', password, dateOfBirth: '1999-01-01', locale: 'ar', device: 'PC-A' });
    expect(r.status).toBe(201);
    t = r.body;
    await new Promise((res) => setTimeout(res, 50));
    const code = lastCode(email);
    expect(code).toMatch(/^\d{6}$/);
    expect(outbox.at(-1)?.subject).toContain('رمز'); // Arabic template for an Arabic user
    for (let i = 0; i < 5; i++) {
      const wrong = String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0');
      expect((await api('POST', '/auth/verify-email', { code: wrong }, t.accessToken)).status).toBe(400);
    }
    expect((await api('POST', '/auth/verify-email', { code }, t.accessToken)).status).toBe(400); // burned
  });

  it('resend + verify works', async () => {
    expect((await api('POST', '/auth/verify-email/resend', {}, t.accessToken)).status).toBe(204);
    await new Promise((res) => setTimeout(res, 50));
    expect((await api('POST', '/auth/verify-email', { code: lastCode(email) }, t.accessToken)).status).toBe(204);
    const me = await api<SelfUser>('GET', '/users/@me', undefined, t.accessToken);
    expect(me.body.emailVerified).toBe(true);
  });

  it('forgot password: no difference for unknown emails; reset signs out every device', async () => {
    const before = outbox.length;
    expect((await api('POST', '/auth/forgot', { email: 'nobody@example.test' })).status).toBe(204);
    expect(outbox.length).toBe(before);
    expect((await api('POST', '/auth/forgot', { email })).status).toBe(204);
    await new Promise((res) => setTimeout(res, 50));
    password = 'second password 456';
    const reset = await api<AuthTokens>('POST', '/auth/reset', { email, code: lastCode(email), password, device: 'PC-A' });
    expect(reset.status).toBe(200);
    expect((await api('POST', '/auth/refresh', { refreshToken: t.refreshToken })).status).toBe(401); // old session dead
    t = reset.body;
    expect((await api('POST', '/auth/login', { login: 'sara', password: 'first password 123' })).status).toBe(401);
  });

  let secret = '';
  let backup: string[] = [];

  it('enables TOTP 2FA with password + a valid code', async () => {
    const setup = await api<{ secret: string; uri: string }>('POST', '/users/@me/mfa/totp/setup', {}, t.accessToken);
    secret = setup.body.secret;
    expect(setup.body.uri).toContain('otpauth://totp/');
    expect((await api('POST', '/users/@me/mfa/totp/enable', { secret, code: '000000', password }, t.accessToken)).status).toBe(400);
    expect((await api('POST', '/users/@me/mfa/totp/enable', { secret, code: totpAt(secret), password: 'wrong' }, t.accessToken)).status).toBe(403);
    const ok = await api<{ backupCodes: string[] }>('POST', '/users/@me/mfa/totp/enable', { secret, code: totpAt(secret), password }, t.accessToken);
    expect(ok.status).toBe(200);
    backup = ok.body.backupCodes;
    expect(backup).toHaveLength(10);
  });

  it('login now needs the second factor; tickets are not access tokens; codes cannot be replayed', async () => {
    const step1 = await api<MfaChallenge>('POST', '/auth/login', { login: email, password, device: 'PC-A' });
    expect(step1.body.mfaRequired).toBe(true);
    expect((await api('GET', '/users/@me', undefined, step1.body.ticket)).status).toBe(401);
    expect((await api('POST', '/auth/mfa', { ticket: step1.body.ticket, code: '123456' })).status).toBe(401);
    const code = totpAt(secret, 30); // next step (the current one was used to enable)
    const ok = await api<AuthTokens>('POST', '/auth/mfa', { ticket: step1.body.ticket, code, device: 'PC-A' });
    expect(ok.status).toBe(200);
    const replay = await api('POST', '/auth/mfa', { ticket: step1.body.ticket, code });
    expect(replay.status).toBe(401);
    // backup code works exactly once
    const s2 = await api<MfaChallenge>('POST', '/auth/login', { login: email, password, device: 'PC-A' });
    expect((await api('POST', '/auth/mfa', { ticket: s2.body.ticket, code: backup[0] })).status).toBe(200);
    expect((await api('POST', '/auth/mfa', { ticket: s2.body.ticket, code: backup[0] })).status).toBe(401);
    const status = await api<{ backupCodesLeft: number }>('GET', '/users/@me/mfa', undefined, t.accessToken);
    expect(status.body.backupCodesLeft).toBe(9);
  });

  it('a reset still asks for 2FA (inbox access alone is not enough)', async () => {
    await api('POST', '/auth/forgot', { email });
    await new Promise((res) => setTimeout(res, 50));
    password = 'third password 789';
    const r = await api<MfaChallenge>('POST', '/auth/reset', { email, code: lastCode(email), password });
    expect(r.body.mfaRequired).toBe(true);
    const ok = await api<AuthTokens>('POST', '/auth/mfa', { ticket: r.body.ticket, code: backup[1], device: 'PC-A' });
    expect(ok.status).toBe(200);
    t = ok.body;
  });

  it('new-device sign-in sends an alert email', async () => {
    const before = outbox.length;
    const s = await api<MfaChallenge>('POST', '/auth/login', { login: email, password, device: 'Laptop <script>' });
    await api('POST', '/auth/mfa', { ticket: s.body.ticket, code: backup[2], device: 'Laptop <script>' });
    await new Promise((res) => setTimeout(res, 50));
    const alert = outbox.slice(before).find((m) => m.to === email);
    expect(alert?.subject).toContain('تسجيل دخول جديد');
    expect(alert?.html).not.toContain('<script>'); // device names are escaped
  });

  it('devices: list, revoke one, revoke all others', async () => {
    const list = await api<SessionInfo[]>('GET', '/users/@me/sessions', undefined, t.accessToken);
    expect(list.body.filter((s) => s.current)).toHaveLength(1);
    const other = list.body.find((s) => !s.current)!;
    expect((await api('DELETE', `/users/@me/sessions/${other.id}`, undefined, t.accessToken)).status).toBe(204);
    expect((await api('DELETE', '/users/@me/sessions', undefined, t.accessToken)).status).toBe(204);
    const after = await api<SessionInfo[]>('GET', '/users/@me/sessions', undefined, t.accessToken);
    expect(after.body).toHaveLength(1);
    expect(after.body[0]!.current).toBe(true);
  });

  it('profile, username, password change', async () => {
    const p = await api<SelfUser>('PATCH', '/users/@me', { displayName: 'سارة', bio: 'مرحبا', locale: 'ar' }, t.accessToken);
    expect(p.body.displayName).toBe('سارة');
    expect((await api('PATCH', '/users/@me/username', { username: 'sara2', password: 'nope' }, t.accessToken)).status).toBe(403);
    expect((await api<SelfUser>('PATCH', '/users/@me/username', { username: 'sara2', password }, t.accessToken)).body.username).toBe('sara2');
    expect((await api('PATCH', '/users/@me/password', { currentPassword: password, newPassword: 'short' }, t.accessToken)).status).toBe(400);
    expect((await api('PATCH', '/users/@me/password', { currentPassword: password, newPassword: 'fourth password 000' }, t.accessToken)).status).toBe(204);
    password = 'fourth password 000';
    expect((await api('GET', '/users/@me', undefined, t.accessToken)).status).toBe(200); // this device stays signed in
  });

  it('delete account needs password + 2FA, blocks owners, and signing in cancels it', async () => {
    expect((await api<{ error: string }>('DELETE', '/users/@me', { password }, t.accessToken)).body.error).toBe('mfa_required');
    const g = await api<{ id: string }>('POST', '/guilds', { name: 'mine' }, t.accessToken);
    expect((await api<{ error: string }>('DELETE', '/users/@me', { password, code: backup[3] }, t.accessToken)).body.error).toBe('transfer_guilds_first');
    await db.query(`delete from guilds where id = $1`, [g.body.id]);
    expect((await api('DELETE', '/users/@me', { password, code: backup[4] }, t.accessToken)).status).toBe(204);
    expect((await api('POST', '/auth/refresh', { refreshToken: t.refreshToken })).status).toBe(401);
    const s = await api<MfaChallenge>('POST', '/auth/login', { login: 'sara2', password });
    const back = await api<AuthTokens>('POST', '/auth/mfa', { ticket: s.body.ticket, code: backup[5] });
    const me = await api<SelfUser>('GET', '/users/@me', undefined, back.body.accessToken);
    expect(me.body.deletionRequestedAt).toBeNull();
  });

  it('disable 2FA', async () => {
    const s = await api<MfaChallenge>('POST', '/auth/login', { login: 'sara2', password });
    const tok = await api<AuthTokens>('POST', '/auth/mfa', { ticket: s.body.ticket, code: backup[6] });
    expect((await api('POST', '/users/@me/mfa/totp/disable', { password, code: backup[7] }, tok.body.accessToken)).status).toBe(204);
    const plain = await api<AuthTokens>('POST', '/auth/login', { login: 'sara2', password });
    expect(plain.body.accessToken).toBeTruthy();
  });
});
