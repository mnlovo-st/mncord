// Per-test-file handle on the running Worker: an isolated database instance plus dev-only helpers.
import { inject } from 'vitest';

export interface CfCall { method: string; path: string; body: unknown; auth: string | undefined }
export interface Edge {
  base: string;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  outbox(): Promise<{ to: string; subject: string; text: string; html: string }[]>;
  setUsage(bytes: number): Promise<void>;
  cfCalls(): Promise<CfCall[]>;
  cron(): Promise<unknown>;
}

/** The app's 3-step upload: start → PUT parts to the Worker → complete. */
export async function upload(
  base: string,
  token: string,
  filename: string,
  data: Uint8Array,
  contentType = 'application/octet-stream',
  extra: { kind?: string; width?: number; height?: number; size?: number } = {},
): Promise<{ status: number; body: any }> {
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const s = await fetch(`${base}/api/v1/uploads`, { method: 'POST', headers: auth, body: JSON.stringify({ filename, size: extra.size ?? data.length, contentType, ...extra }) });
  const start = (await s.json()) as { id: string; partSize: number; parts: { partNumber: number; url: string }[]; error?: string };
  if (s.status !== 201) return { status: s.status, body: start };
  const parts: { partNumber: number; etag: string }[] = [];
  for (const p of start.parts) {
    const chunk = data.subarray((p.partNumber - 1) * start.partSize, p.partNumber * start.partSize);
    const r = await fetch(p.url, { method: 'PUT', body: chunk });
    if (!r.ok) return { status: r.status, body: await r.json() };
    parts.push((await r.json()) as { partNumber: number; etag: string });
  }
  const c = await fetch(`${base}/api/v1/uploads/${start.id}/complete`, { method: 'POST', headers: auth, body: JSON.stringify({ parts }) });
  return { status: c.status === 200 ? 201 : c.status, body: await c.json() };
}

export function open(name: string): Edge {
  const base = `${inject('edgeBase')}/__i/${name}-${Math.random().toString(36).slice(2, 8)}`;
  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw new Error(`${path} → ${r.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
  return {
    base,
    query: async (sql, params) => ({ rows: await post('/__dev/sql', { sql, params: params ?? [] }) }),
    outbox: async () => (await fetch(`${base}/__dev/outbox`)).json(),
    setUsage: async (bytes) => void (await post('/__dev/usage', { bytes })),
    cfCalls: async () => (await fetch(`${inject('cfBase')}/__calls`)).json(),
    cron: async () => post('/__dev/cron', {}),
  };
}
