// Data layer over the Durable Object's built-in SQLite. The route code was written for Postgres, so queries
// are translated once (and cached): $n → ?n, casts dropped, now()/intervals, = any(array) → json_each, and
// array_agg/json_agg → json_group_array. Values: arrays/objects → JSON text, Date → ISO-8601, Buffer → bytes.
// Rows come back with JSON columns parsed and boolean columns as real booleans.
import { Buffer } from 'node:buffer';
import { env } from './config.ts';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** multi-statement script, no parameters (schema only) */
  exec(sql: string): Promise<void>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** synchronous form for the few places that need a value immediately (key material, counters) */
  querySync<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
}

export const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
// UUIDv7 in SQL: 48-bit ms timestamp + version 7 + random. 'now' is fixed within a statement, so both halves agree.
const TS = `printf('%012x', cast((julianday('now') - 2440587.5) * 86400000 as integer))`;
export const UUID = `(lower(substr(${TS},1,8) || '-' || substr(${TS},9,4) || '-7' || substr(hex(randomblob(2)),2,3) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)),2,3) || '-' || hex(randomblob(6))))`;
const nowShift = (n: string, unit: string, sign: string) => `(strftime('%Y-%m-%dT%H:%M:%fZ','now','${sign}${n} ${unit}'))`;

const cache = new Map<string, string>();
export function translate(sql: string): string {
  const hit = cache.get(sql);
  if (hit !== undefined) return hit;
  let s = sql;
  // now() ± interval 'N unit'
  s = s.replace(/now\(\)\s*([-+])\s*interval\s+'(\d+)\s+(\w+?)s?'/gi, (_m, sign: string, n: string, unit: string) => nowShift(n, `${unit}s`, sign));
  s = s.replace(/\buuidv7\(\)/gi, UUID);
  s = s.replace(/\bnow\(\)/gi, NOW);
  // casts: ::text ::int ::uuid[] ::citext ::bigint ::inet ::jsonb ...
  s = s.replace(/::[a-z_]+(\[\])?/gi, '');
  // = any($n) / <> all($n) over an array parameter
  s = s.replace(/=\s*any\(\s*\$(\d+)\s*\)/gi, (_m, n: string) => `in (select value from json_each(?${n}))`);
  s = s.replace(/<>\s*all\(\s*\$(\d+)\s*\)/gi, (_m, n: string) => `not in (select value from json_each(?${n}))`);
  s = s.replace(/\$(\d+)/g, '?$1');
  s = s.replace(/\bilike\b/gi, 'like');
  s = s.replace(/\bfor update(\s+of\s+\w+)?(\s+skip locked)?/gi, '');
  s = s.replace(/\bbool_or\(/gi, 'max(').replace(/\bbool_and\(/gi, 'min(');
  s = s.replace(/\bgreatest\(/gi, 'max(').replace(/\bleast\(/gi, 'min(');
  s = s.replace(/\barray_agg\(/gi, 'json_group_array(').replace(/\bjson_agg\(/gi, 'json_group_array(').replace(/\bjson_build_object\(/gi, 'json_object(');
  s = s.replace(/,\s*'\{\}'\)/g, ", '[]')"); // coalesce(array_agg(...), '{}') → '[]'
  s = s.replace(/\bis distinct from\b/gi, 'is not').replace(/\bis not distinct from\b/gi, 'is');
  cache.set(sql, s);
  return s;
}

// Columns/aliases that hold JSON (arrays or objects) and must be parsed on the way out.
const JSON_KEYS = new Set([
  'roleIds', 'role_ids', 'embeds', 'customStatus', 'custom_status', 'changes', 'profileTheme', 'profile_theme',
  'forwardedFrom', 'forwarded_from', 'mentionRoles', 'mention_roles', 'appliedTags', 'applied_tags', 'keywords',
  'guildFolders', 'guild_folders', 'keybinds', 'streamerMode', 'streamer_mode', 'onboarding', 'triggerMeta',
  'trigger_meta', 'actions', 'exemptRoles', 'exempt_roles', 'exemptChannels', 'exempt_channels', 'recipients',
  'backupCodesHash', 'backup_codes_hash', 'backup', 'userIds', 'ids', 'emojis', 'reactions', 'attachments', 'mentions', 'style', 'authorStyle',
]);
// Boolean columns/aliases (SQLite stores 0/1).
const BOOL_KEYS = new Set([
  'email_verified', 'emailVerified', 'hide_badges', 'hideBadges', 'two_factor_enabled', 'twoFactorEnabled', 'mfaEnabled',
  'reduced_motion', 'reducedMotion', 'is_discoverable', 'isDiscoverable', 'community_enabled', 'communityEnabled',
  'hoist', 'mentionable', 'is_everyone', 'isEveryone', 'onboarding_done', 'onboardingDone', 'server_mute', 'serverMute',
  'server_deaf', 'serverDeaf', 'nsfw', 'archived', 'locked', 'closed', 'moderated', 'mention_everyone', 'mentionEveryone',
  'pinned', 'spoiler', 'animated', 'burst', 'suppress_everyone', 'suppressEveryone', 'suppress_roles', 'suppressRoles',
  'temporary', 'enabled', 'attached', 'adult', 'me', 'ok', 'exists', 'blocked', 'verified', 'isOwner', 'mutual',
  'expired', 'isPublic', 'on', 'mfa', 'disabled', 'revoked', 'current',
]);

// Columns the permission engine compares as Date objects.
const DATE_KEYS = new Set(['timeoutUntil', 'timeout_until']);

function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (v === null || typeof v === 'string' || typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
  if (v instanceof ArrayBuffer) return v;
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => (x instanceof Uint8Array ? Buffer.from(x).toString('hex') : x)));
  return JSON.stringify(v);
}

function fromRow(row: Record<string, unknown>): Record<string, unknown> {
  for (const k in row) {
    const v = row[k];
    if (v instanceof ArrayBuffer) row[k] = Buffer.from(v);
    else if (typeof v === 'string' && JSON_KEYS.has(k) && (v.startsWith('[') || v.startsWith('{'))) {
      try {
        row[k] = JSON.parse(v);
      } catch {
        /* keep text */
      }
    } else if (typeof v === 'number' && BOOL_KEYS.has(k)) row[k] = v !== 0;
    else if (typeof v === 'string' && DATE_KEYS.has(k)) row[k] = new Date(v);
  }
  return row;
}

/** SQLite constraint failures look like Postgres ones to the route code (code 23505 = unique violation). */
function mapError(e: unknown): never {
  const msg = String((e as Error)?.message ?? e);
  if (/UNIQUE constraint failed/i.test(msg)) throw Object.assign(new Error(msg), { code: '23505' });
  if (/CHECK constraint failed/i.test(msg)) throw Object.assign(new Error(msg), { code: '23514' });
  if (/FOREIGN KEY constraint failed/i.test(msg)) throw Object.assign(new Error(msg), { code: '23503' });
  throw e;
}

export function sqliteDb(storage: DurableObjectStorage): Db {
  const sql = storage.sql;
  const run = <T>(text: string, params: unknown[] = []): T[] => {
    try {
      return [...sql.exec(translate(text), ...params.map(toParam))].map((r) => fromRow(r as Record<string, unknown>)) as T[];
    } catch (e) {
      if (env().DEV_TOOLS === '1') console.error('[sql]', String((e as Error)?.message), '::', translate(text).replace(/\s+/g, ' ').slice(0, 400));
      mapError(e);
    }
  };
  const q: Db = {
    query: async (text, params) => ({ rows: run(text, params) }),
    querySync: (text, params) => run(text, params),
    exec: async (script) => {
      try {
        sql.exec(script);
      } catch (e) {
        mapError(e);
      }
    },
    // storage.transaction() wraps the async callback: SQL run inside it commits together or rolls back when the
    // callback throws (verified by the "tx rolls back" check in test/edge.test.ts).
    tx: (fn) => storage.transaction(() => fn(q)),
  };
  return q;
}
