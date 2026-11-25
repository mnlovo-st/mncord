import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { config } from './config.ts';
import type { Db } from './db.ts';
import { Hub } from './gateway.ts';
import { errorHandler } from './http.ts';
import { accountRoutes } from './routes/account.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { fileServeRoute, uploadRoutes } from './routes/files.ts';
import { guildRoutes } from './routes/guilds.ts';
import { messageRoutes } from './routes/messages.ts';
import { socialRoutes } from './routes/social.ts';
import { voiceRoutes } from './routes/voice.ts';

export async function buildApp(db: Db, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ? { level: 'info', redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'] } : false,
    bodyLimit: 64 * 1024,
    trustProxy: true, // behind Caddy in production
  });
  const hub = new Hub(db);

  // Bearer tokens only (no cookies), so any origin is safe; nothing is sent automatically by the browser.
  await app.register(cors, { origin: true, credentials: false });
  // RATE_LIMIT_SCALE lets the test suite run many sign-ins in a row; production always uses 1.
  const scale = config.isProd ? 1 : Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1));
  app.addHook('onRoute', (route) => {
    const rl = (route.config as { rateLimit?: { max?: number } } | undefined)?.rateLimit;
    if (rl?.max) rl.max *= scale;
  });
  await app.register(rateLimit, { global: true, max: 300 * scale, timeWindow: '1 minute', hook: 'preHandler' });
  await app.register(websocket, { options: { maxPayload: 8 * 1024 } });
  app.setErrorHandler(errorHandler);
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
  });

  app.get('/health', async () => ({ ok: true }));
  app.get('/gateway', { websocket: true }, (socket) => hub.handle(socket));
  fileServeRoute(app, db); // GET /files/:id (signed URLs, outside /api)

  await app.register(
    async (api) => {
      authRoutes(api, db, hub);
      await api.register(async (s) => accountRoutes(s, db, hub));
      await api.register(async (s) => guildRoutes(s, db, hub));
      await api.register(async (s) => adminRoutes(s, db, hub));
      await api.register(async (s) => messageRoutes(s, db, hub));
      await api.register(async (s) => socialRoutes(s, db, hub));
      await api.register(async (s) => voiceRoutes(s, db, hub));
      await api.register(async (s) => uploadRoutes(s, db));
    },
    { prefix: '/api/v1' },
  );

  app.addHook('onClose', async () => hub.close());
  return { app, hub };
}
