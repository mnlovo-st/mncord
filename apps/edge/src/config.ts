// Runtime settings. On Cloudflare every setting arrives as a binding on `env`; the Hub calls setEnv() once
// at start-up so the rest of the code can keep reading plain values.
export interface Env {
  HUB: DurableObjectNamespace;
  FILES: R2Bucket;
  // secrets (wrangler secret put / .dev.vars)
  JWT_PRIVATE_JWK?: string;
  SECRETS_KEY?: string;
  FILES_SIGNING_KEY?: string;
  CF_REALTIME_APP_ID?: string;
  CF_REALTIME_APP_SECRET?: string;
  CF_TURN_KEY_ID?: string;
  CF_TURN_KEY_TOKEN?: string;
  SMTP_URL?: string;
  MAIL_FROM?: string;
  // plain vars
  PUBLIC_URL?: string;
  CF_RTC_BASE?: string;
  MEDIA_TTL_DAYS?: string;
  MAX_UPLOAD_MB?: string;
  STORAGE_CAP_GB?: string;
  /** "1" only in local development and tests: enables /__dev/* and per-test database instances */
  DEV_TOOLS?: string;
  RATE_LIMIT_SCALE?: string;
  /** "1": new accounts need a verified email and the owner's approval */
  ACCOUNT_GATE?: string;
  /** owner's email (approves new accounts); unset = the first account */
  OWNER_EMAIL?: string;
}

let current: Env | null = null;
export function setEnv(env: Env) {
  current = env;
  // a few modules still read process.env (shared code paths); mirror the string settings there
  const pe = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
  if (pe) for (const [k, v] of Object.entries(env)) if (typeof v === 'string') pe[k] = v;
}
export function env(): Env {
  if (!current) throw new Error('env not set');
  return current;
}

export const config = {
  get isProd() {
    return current?.DEV_TOOLS !== '1';
  },
  get jwtPrivateJwk() {
    return current?.JWT_PRIVATE_JWK;
  },
  accessTtlSeconds: 15 * 60,
  refreshTtlDays: 30,
  get maxUploadBytes() {
    return Number(current?.MAX_UPLOAD_MB ?? 200) * 1024 * 1024;
  },
  get mediaTtlDays() {
    return Number(current?.MEDIA_TTL_DAYS ?? 14);
  },
  get storageCapBytes() {
    return Number(current?.STORAGE_CAP_GB ?? 9) * 1024 ** 3;
  },
  get rateLimitScale() {
    return this.isProd ? 1 : Math.max(1, Number(current?.RATE_LIMIT_SCALE ?? 1));
  },
};
