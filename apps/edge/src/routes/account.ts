// S24 user settings: profile, username/email/password, 2FA, devices, account deletion.
import {
  ChangeEmailInput,
  ChangePasswordInput,
  ChangeUsernameInput,
  DeleteAccountInput,
  DisableTotpInput,
  EnableTotpInput,
  RegenerateBackupInput,
  UpdateProfileInput,
  NotificationSettingInput,
  type SessionInfo,
} from '@mncord/shared';
import type { App } from '../shim.ts';
import type { Db } from '../db.ts';
import { HttpError, notFound, parse, requireAuth } from '../http.ts';
import { getSelf } from '../repo.ts';
import { backupCodesLeft, checkTotp, hashBackup, newBackupCodes, newTotpSecret, removeTotp, saveTotp, verifySecondFactor } from '../auth/mfa.ts';
import { checkPassword, hashPassword } from '../auth/passwords.ts';
import { sendMail, templates } from '../mail.ts';
import type { Hub } from '../gateway.ts';
import { sendVerifyCode } from './auth.ts';

export function accountRoutes(app: App, db: Db, hub: Hub) {
  app.addHook('preHandler', requireAuth);
  const sensitive = { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } };

  const mfaEnabled = async (userId: string) =>
    (await db.query<{ on: boolean }>(`select two_factor_enabled as "on" from users where id = $1`, [userId])).rows[0]?.on ?? false;

  /** Sensitive changes need the password, plus a 2FA code when 2FA is on. */
  async function stepUp(userId: string, password: string, code?: string) {
    await checkPassword(db, userId, password);
    if (await mfaEnabled(userId)) {
      if (!code) throw new HttpError(403, 'mfa_required', 'code');
      if (!(await db.tx((q) => verifySecondFactor(q, userId, code)))) throw new HttpError(403, 'mfa_invalid', 'code');
    }
  }

  // ── profile
  app.patch('/users/@me', async (req) => {
    const p = parse(UpdateProfileInput, req.body);
    const sets: string[] = [];
    const vals: unknown[] = [req.userId];
    if (p.avatarFileId) {
      // animated GIF/WebP avatars are allowed for everyone
      const f = await db.query(`update files set attached = true where id = $1 and owner_id = $2 and status = 'ready' and kind in ('avatar','banner') and content_type like 'image/%' and size_bytes <= 10485760 returning id`, [p.avatarFileId, req.userId]);
      if (!f.rows.length) throw new HttpError(400, 'attachment_invalid');
    }
    if (p.avatarFileId !== undefined) {
      vals.push(p.avatarFileId);
      sets.push(`avatar_key = $${vals.length}`);
    }
    if (p.bannerFileId) {
      const f = await db.query(`update files set attached = true where id = $1 and owner_id = $2 and status = 'ready' and kind in ('avatar','banner') and content_type like 'image/%' and size_bytes <= 10485760 returning id`, [p.bannerFileId, req.userId]);
      if (!f.rows.length) throw new HttpError(400, 'attachment_invalid');
    }
    if (p.bannerFileId !== undefined) {
      vals.push(p.bannerFileId);
      sets.push(`banner_key = $${vals.length}`);
    }
    if (p.customStatus !== undefined) {
      vals.push(p.customStatus ? JSON.stringify(p.customStatus) : null);
      sets.push(`custom_status = $${vals.length}`);
    }
    const col = { displayName: 'display_name', bio: 'bio', pronouns: 'pronouns', locale: 'locale', status: 'status', accentColor: 'accent_color' } as const;
    for (const [k, c] of Object.entries(col)) {
      const v = p[k as keyof typeof p];
      if (v !== undefined) {
        vals.push(v);
        sets.push(`${c} = $${vals.length}`);
      }
    }
    if (sets.length) await db.query(`update users set ${sets.join(', ')} where id = $1`, vals);
    if (p.status) await hub.setStatus(req.userId, p.status);
    return getSelf(db, req.userId);
  });

  app.patch('/users/@me/username', sensitive, async (req) => {
    const input = parse(ChangeUsernameInput, req.body);
    await checkPassword(db, req.userId, input.password);
    const taken = await db.query(`select 1 from users where username = $1::citext and id <> $2`, [input.username, req.userId]);
    if (taken.rows.length) throw new HttpError(409, 'username_taken', 'username');
    await db.query(`update users set username = $2 where id = $1`, [req.userId, input.username]);
    return getSelf(db, req.userId);
  });

  app.patch('/users/@me/email', sensitive, async (req) => {
    const input = parse(ChangeEmailInput, req.body);
    await checkPassword(db, req.userId, input.password);
    const taken = await db.query(`select 1 from users where email = $1::citext and id <> $2`, [input.email, req.userId]);
    if (taken.rows.length) throw new HttpError(409, 'email_taken', 'email');
    await db.query(`update users set email = $2, email_verified = false where id = $1`, [req.userId, input.email]);
    await sendVerifyCode(db, req.userId);
    return getSelf(db, req.userId);
  });

  app.patch('/users/@me/password', sensitive, async (req, reply) => {
    const input = parse(ChangePasswordInput, req.body);
    await checkPassword(db, req.userId, input.currentPassword);
    const h = await hashPassword(input.newPassword);
    await db.query(`update accounts set password_hash = $2, password_salt = coalesce($3, password_salt), updated_at = now() where user_id = $1 and provider_id = 'credential'`, [req.userId, h, input.newSalt ?? null]);
    // everyone else is signed out; this device stays in
    const others = await db.query<{ id: string }>(`update sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null returning id`, [req.userId, req.sessionId]);
    for (const s of others.rows) hub.closeSession(s.id);
    const me = await getSelf(db, req.userId);
    if (me) void sendMail({ to: me.email, ...templates.passwordChanged(me.locale) }).catch(() => {});
    return reply.status(204).send();
  });

  // ── 2FA (TOTP)
  app.post('/users/@me/mfa/totp/setup', sensitive, async (req) => {
    if (await mfaEnabled(req.userId)) throw new HttpError(400, 'mfa_already_enabled');
    const me = await getSelf(db, req.userId);
    return newTotpSecret(me?.username ?? 'mncord');
  });

  app.post('/users/@me/mfa/totp/enable', sensitive, async (req) => {
    const input = parse(EnableTotpInput, req.body);
    if (await mfaEnabled(req.userId)) throw new HttpError(400, 'mfa_already_enabled');
    await checkPassword(db, req.userId, input.password);
    const step = checkTotp(input.secret, input.code);
    if (step === null) throw new HttpError(400, 'mfa_invalid', 'code');
    const codes = newBackupCodes();
    await db.tx(async (q) => {
      await saveTotp(q, req.userId, input.secret, codes);
      await q.query(`update two_factors set last_used_step = $2 where user_id = $1`, [req.userId, step]);
    });
    return { backupCodes: codes }; // shown once, never retrievable again
  });

  app.post('/users/@me/mfa/totp/disable', sensitive, async (req, reply) => {
    const input = parse(DisableTotpInput, req.body);
    await stepUp(req.userId, input.password, input.code);
    await removeTotp(db, req.userId);
    return reply.status(204).send();
  });

  app.post('/users/@me/mfa/backup-codes', sensitive, async (req) => {
    const input = parse(RegenerateBackupInput, req.body);
    await stepUp(req.userId, input.password, input.code);
    const codes = newBackupCodes();
    await db.query(`update two_factors set backup_codes_hash = $2 where user_id = $1`, [req.userId, codes.map(hashBackup)]);
    return { backupCodes: codes };
  });

  app.get('/users/@me/mfa', async (req) => ({ enabled: await mfaEnabled(req.userId), backupCodesLeft: await backupCodesLeft(db, req.userId) }));

  // ── notification settings (per server / per channel)
  app.get('/users/@me/notification-settings', async (req) => {
    const { rows } = await db.query(
      `select guild_id as "guildId", channel_id as "channelId", level, muted_until as "mutedUntil", suppress_everyone as "suppressEveryone"
         from notification_settings where user_id = $1`,
      [req.userId],
    );
    return rows;
  });

  app.put('/users/@me/notification-settings', async (req) => {
    const input = parse(NotificationSettingInput, req.body);
    const scopeCol = input.channelId ? 'channel_id' : 'guild_id';
    const scopeVal = input.channelId ?? input.guildId;
    await db.query(`delete from notification_settings where user_id = $1 and ${scopeCol} = $2 and ${input.channelId ? 'true' : 'channel_id is null'}`, [req.userId, scopeVal]);
    await db.query(
      `insert into notification_settings (user_id, guild_id, channel_id, level, muted_until, suppress_everyone) values ($1, $2, $3, $4, $5, $6)`,
      [req.userId, input.channelId ? null : input.guildId, input.channelId ?? null, input.level, input.mutedUntil ?? null, input.suppressEveryone ?? false],
    );
    return { ok: true };
  });

  // ── devices
  app.get('/users/@me/sessions', async (req): Promise<SessionInfo[]> => {
    const { rows } = await db.query<Omit<SessionInfo, 'current'> & { createdAt: Date; lastSeenAt: Date }>(
      `select id, device_name as "deviceName", os, client_version as "clientVersion", created_at as "createdAt", last_seen_at as "lastSeenAt"
         from sessions where user_id = $1 and revoked_at is null and expires_at > now() order by last_seen_at desc`,
      [req.userId],
    );
    return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString(), lastSeenAt: new Date(r.lastSeenAt).toISOString(), current: r.id === req.sessionId }));
  });

  app.delete('/users/@me/sessions/:id', async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound();
    const r = await db.query(`update sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null returning id`, [req.params.id, req.userId]);
    if (!r.rows.length) throw notFound();
    hub.closeSession(req.params.id);
    return reply.status(204).send();
  });

  app.delete('/users/@me/sessions', async (req, reply) => {
    const r = await db.query<{ id: string }>(`update sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null returning id`, [req.userId, req.sessionId]);
    for (const s of r.rows) hub.closeSession(s.id);
    return reply.status(204).send();
  });

  // ── deletion: 14-day grace, signing in again cancels it
  app.delete('/users/@me', sensitive, async (req, reply) => {
    const input = parse(DeleteAccountInput, req.body);
    await stepUp(req.userId, input.password, input.code);
    const owns = await db.query(`select 1 from guilds where owner_id = $1 limit 1`, [req.userId]);
    if (owns.rows.length) throw new HttpError(400, 'transfer_guilds_first');
    await db.query(`update users set deletion_requested_at = now() where id = $1`, [req.userId]);
    await db.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [req.userId]);
    hub.kickSessions(req.userId);
    return reply.status(204).send();
  });
}
