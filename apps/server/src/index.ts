// mncord server entry. (c) mnlovo
import { buildApp } from './app.ts';
import { config } from './config.ts';
import { openDb } from './db.ts';

const db = await openDb();
const { app } = await buildApp(db, { logger: true });
await app.listen({ host: config.host, port: config.port });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}
