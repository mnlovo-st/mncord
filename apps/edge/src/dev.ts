// Local development and tests only (DEV_TOOLS=1; the Worker refuses /__ paths otherwise).
import type { Db } from './db.ts';
import { _setUsage } from './rtc.ts';
import { cleanupMedia } from './routes/files.ts';
import type { App } from './shim.ts';

export function devRoutes(app: App, db: Db) {
  app.post('/sql', async (req) => {
    const { sql, params } = req.body as { sql: string; params?: unknown[] };
    return (await db.query(sql, params ?? [])).rows;
  });
  app.get('/outbox', async () =>
    (await db.query(`select recipient as "to", subject, body as text, html from dev_outbox order by created_at, rowid`)).rows,
  );
  app.post('/usage', async (req) => {
    const b = req.body as { bytes: number; dayBytes?: number };
    _setUsage(Number(b.bytes), Number(b.dayBytes ?? 0));
    return { ok: true };
  });
  app.post('/cron', async () => cleanupMedia(db));
  // proves tx() rolls back: insert inside a transaction, then fail
  app.post('/tx-check', async () => {
    const marker = `tx-${Date.now()}`;
    await db.tx(async (q) => {
      await q.query(`insert into schema_meta (k, v) values ($1, 'x')`, [marker]);
      throw new Error('boom');
    }).catch(() => {});
    const left = await db.query(`select 1 from schema_meta where k = $1`, [marker]);
    return { rolledBack: left.rows.length === 0 };
  });
}
