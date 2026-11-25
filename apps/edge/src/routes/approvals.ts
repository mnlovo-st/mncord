// Owner approval of new accounts (one time per account).
import { env } from '../config.ts';
import type { Db } from '../db.ts';
import type { Hub } from '../gateway.ts';
import { accountState, gateOn, isOwner } from '../gate.ts';
import { forbidden, HttpError, requireAuth } from '../http.ts';
import { esc, sendMail } from '../mail.ts';
import type { App } from '../shim.ts';

export function ownerId(db: Db): string | null {
  const email = env().OWNER_EMAIL?.trim().toLowerCase();
  const row = email
    ? db.querySync<{ id: string }>(`select id from users where lower(email) = $1`, [email])[0]
    : db.querySync<{ id: string }>(`select id from users order by created_at, id limit 1`)[0];
  return row?.id ?? null;
}

/** after a successful email verification: tell the owner someone is waiting */
export async function announcePending(db: Db, hub: Hub, userId: string) {
  if (!gateOn() || isOwner(db, userId)) return;
  const s = accountState(db, userId);
  if (s.approved) return;
  const owner = ownerId(db);
  if (!owner) return;
  const u = db.querySync<{ id: string; username: string; displayName: string | null; email: string; createdAt: string }>(
    `select id, username, display_name as "displayName", email, created_at as "createdAt" from users where id = $1`,
    [userId],
  )[0];
  if (!u) return;
  hub.dispatchToUser(owner, { t: 'APPROVAL_REQUEST', d: { id: u.id, username: u.username, displayName: u.displayName, createdAt: u.createdAt } } as never);
  const o = db.querySync<{ email: string; locale: string }>(`select email, locale from users where id = $1`, [owner])[0];
  if (o) {
    const ar = o.locale === 'ar';
    const who = esc(u.displayName ? `${u.displayName} (@${u.username})` : `@${u.username}`);
    void sendMail({
      to: o.email,
      subject: ar ? `حساب جديد ينتظر موافقتك في mncord: ${u.username}` : `New mncord account waiting for approval: ${u.username}`,
      text: ar ? `${u.username} أكّد بريده وينتظر موافقتك. افتح mncord ← الإعدادات ← الموافقات.` : `${u.username} verified their email and is waiting for you. Open mncord → Settings → Approvals.`,
      html: ar
        ? `<div dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif"><p><b>${who}</b> أكّد بريده الإلكتروني وينتظر موافقتك.</p><p>افتح mncord ← الإعدادات ← الموافقات.</p></div>`
        : `<div style="font-family:Segoe UI,Tahoma,sans-serif"><p><b>${who}</b> verified their email and is waiting for your approval.</p><p>Open mncord → Settings → Approvals.</p></div>`,
    }).catch(() => {});
  }
}

export function approvalRoutes(app: App, db: Db, hub: Hub) {
  app.addHook('preHandler', requireAuth);

  // the waiting screen polls this ("Check again")
  app.get('/users/@me/approval', async (req) => {
    const s = accountState(db, req.userId);
    return { verified: s.verified, approved: s.approved, owner: s.owner, gate: gateOn() };
  });

  const ownerOnly = (userId: string) => {
    if (!isOwner(db, userId)) throw forbidden('owner_only');
  };

  app.get('/admin/pending', async (req) => {
    ownerOnly(req.userId);
    const { rows } = await db.query<{ id: string; username: string; displayName: string | null; email: string; createdAt: string; verified: boolean }>(
      `select id, username, display_name as "displayName", email, created_at as "createdAt", email_verified as verified
         from users where approved_at is null and disabled_at is null order by created_at`,
    );
    return rows.filter((r) => !isOwner(db, r.id));
  });

  app.post('/admin/users/:uid/approve', async (req, reply) => {
    ownerOnly(req.userId);
    const r = await db.query(`update users set approved_at = now() where id = $1 and approved_at is null and disabled_at is null returning id`, [req.params.uid]);
    if (!r.rows.length) throw new HttpError(404, 'not_found');
    return reply.status(204).send();
  });

  app.post('/admin/users/:uid/decline', async (req, reply) => {
    ownerOnly(req.userId);
    if (req.params.uid === req.userId) throw new HttpError(400, 'cannot_decline_self');
    const r = await db.query(`update users set disabled_at = now() where id = $1 and approved_at is null and disabled_at is null returning id`, [req.params.uid]);
    if (!r.rows.length) throw new HttpError(404, 'not_found');
    await db.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [req.params.uid]);
    hub.kickSessions(req.params.uid);
    return reply.status(204).send();
  });
}
