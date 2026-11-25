import { resolve } from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name: string, devDefault: string): string {
  const v = env[name];
  if (v) return v;
  if (isProd) throw new Error(`missing env ${name}`);
  return devDefault;
}

export const config = {
  isProd,
  host: env.HOST ?? '127.0.0.1',
  port: Number(env.PORT ?? 8787),
  dataDir: resolve(env.DATA_DIR ?? '.data'),
  /** unset → embedded PGlite in dataDir (dev). Production: postgres://… */
  databaseUrl: env.DATABASE_URL,
  /** Ed25519 private key as JWK JSON. Dev: generated once into dataDir. */
  jwtPrivateJwk: env.JWT_PRIVATE_JWK,
  accessTtlSeconds: 15 * 60,
  refreshTtlDays: 30,
  argon2: { memoryCost: 65536, timeCost: 3, parallelism: 1 },
};
