// Thin data layer: parameterised SQL only (never string-built queries). Works on embedded PGlite (dev/tests)
// and node-postgres (production) behind one interface.
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.ts';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** multi-statement script, no parameters (migrations only) */
  exec(sql: string): Promise<void>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const MIGRATIONS = resolve(import.meta.dirname, '../migrations');

export async function openDb(opts: { memory?: boolean } = {}): Promise<Db> {
  let db: Db;
  if (config.databaseUrl && !opts.memory) {
    const pg = await import('pg');
    // bigint (int8) as string; we never want lossy numbers for permission bitfields
    pg.default.types.setTypeParser(20, (v: string) => v);
    const pool = new pg.default.Pool({ connectionString: config.databaseUrl, max: 10 });
    db = {
      query: async (sql, params) => pool.query(sql, params as unknown[]) as never,
      exec: async (sql) => void (await pool.query(sql)),
      tx: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query('begin');
          const r = await fn({ query: async (s, p) => c.query(s, p as unknown[]) as never, exec: async (s) => void (await c.query(s)) });
          await c.query('commit');
          return r;
        } catch (e) {
          await c.query('rollback');
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { citext } = await import('@electric-sql/pglite/contrib/citext');
    const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
    let dataDir: string | undefined;
    if (!opts.memory) {
      mkdirSync(config.dataDir, { recursive: true });
      dataDir = join(config.dataDir, 'pglite');
    }
    const lite = await PGlite.create({ dataDir, extensions: { citext, pg_trgm } });
    db = {
      query: async (sql, params) => lite.query(sql, params) as never,
      exec: async (sql) => void (await lite.exec(sql)),
      tx: async (fn) => lite.transaction(async (t) => fn({ query: async (s, p) => t.query(s, p) as never, exec: async (s) => void (await t.exec(s)) })),
      close: () => lite.close(),
    };
  }
  await migrate(db);
  return db;
}

async function migrate(db: Db) {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query('insert into schema_migrations (name) values ($1)', [file]);
    });
  }
}
