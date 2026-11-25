// The one Durable Object that is the whole mncord server: SQLite database + all live gateway connections.
import { DurableObject } from 'cloudflare:workers';
import { setEnv, type Env } from './config.ts';
import { sqliteDb, type Db } from './db.ts';
import { Hub } from './gateway.ts';
import { requireAuth } from './http.ts';
import { accountRoutes } from './routes/account.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { cleanupMedia, uploadRoutes } from './routes/files.ts';
import { guildRoutes } from './routes/guilds.ts';
import { messageRoutes } from './routes/messages.ts';
import { socialRoutes } from './routes/social.ts';
import { voiceRoutes } from './routes/voice.ts';
import { SCHEMA, SCHEMA_VERSION } from './schema.ts';
import { App, json } from './shim.ts';
import { devRoutes } from './dev.ts';
import { setMailDb } from './mail.ts';

/** Makes a Workers WebSocket look like the `ws` package socket the gateway was written for. */
function wrap(ws: WebSocket) {
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  ws.addEventListener('message', (e) => {
    const isBinary = typeof e.data !== 'string';
    for (const f of listeners.message ?? []) f(isBinary ? new Uint8Array(e.data as ArrayBuffer) : e.data, isBinary);
  });
  ws.addEventListener('close', () => {
    for (const f of listeners.close ?? []) f();
  });
  ws.addEventListener('error', () => {
    for (const f of listeners.error ?? []) f();
  });
  return {
    OPEN: 1,
    get readyState() {
      return ws.readyState;
    },
    on(ev: string, f: (...a: unknown[]) => void) {
      (listeners[ev] ??= []).push(f);
    },
    send(s: string) {
      try {
        ws.send(s);
      } catch {
        /* closing */
      }
    },
    close(code?: number, reason?: string) {
      try {
        ws.close(code, reason);
      } catch {
        /* already closed */
      }
    },
    terminate() {
      try {
        ws.close(1011, 'terminated');
      } catch {
        /* already closed */
      }
    },
  };
}
export type WsLike = ReturnType<typeof wrap>;

export class MncordHub extends DurableObject<Env> {
  private db: Db;
  private hub!: Hub;
  private app!: App;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    setEnv(env);
    this.db = sqliteDb(ctx.storage);
    void ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('pragma foreign_keys = on');
      ctx.storage.sql.exec('create table if not exists schema_meta (k text primary key, v text not null)');
      const v =this.db.querySync<{ v: string }>(`select v from schema_meta where k = 'version'`).at(0)?.v;
      if (v !== String(SCHEMA_VERSION)) {
        ctx.storage.sql.exec(SCHEMA);
        ctx.storage.sql.exec(`insert into schema_meta (k, v) values ('version', ?) on conflict (k) do update set v = excluded.v`, String(SCHEMA_VERSION));
      }
      setMailDb(this.db);
      this.hub = new Hub(this.db);
      const root = new App();
      const api = root.scope('/api/v1');
      authRoutes(api, this.db, this.hub);
      accountRoutes(api.scope(), this.db, this.hub);
      guildRoutes(api.scope(), this.db, this.hub);
      adminRoutes(api.scope(), this.db, this.hub);
      messageRoutes(api.scope(), this.db, this.hub);
      socialRoutes(api.scope(), this.db, this.hub);
      voiceRoutes(api.scope(), this.db, this.hub);
      uploadRoutes(api.scope(), this.db);
      if (env.DEV_TOOLS === '1') devRoutes(root.scope('/__dev'), this.db);
      this.app = root;
      void requireAuth; // keep import (used by route modules)
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/gateway') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json(426, { error: 'upgrade_required' });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      server.accept();
      this.hub.handle(wrap(server) as never);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/__cron' && request.headers.get('x-mncord-cron') === '1') {
      const r = await cleanupMedia(this.db);
      await this.db.query(`delete from verifications where expires_at < now()`);
      await this.db.query(`delete from sessions where expires_at < now() or (revoked_at is not null and revoked_at < now() - interval '30 days')`);
      return json(200, r);
    }
    return (await this.app.handle(request)) ?? json(404, { error: 'not_found' });
  }
}
