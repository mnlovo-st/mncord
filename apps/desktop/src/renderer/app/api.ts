// REST client: bearer access token in memory, refresh token in the OS vault. Single-flight refresh.
import type { AuthTokens } from '@mncord/shared';

export const API_BASE = (import.meta.env.VITE_MNCORD_API as string | undefined) ?? 'http://127.0.0.1:8787';

export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;
  constructor(status: number, code: string, field?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

// In Electron the refresh token goes to DPAPI via preload. In a plain browser (design/dev preview only) it
// stays in sessionStorage so the tab can be reloaded; production never runs there.
const vault = {
  load: async () => (window.mncord ? window.mncord.auth.load() : sessionStorage.getItem('mncord.rt')),
  save: async (t: string) => (window.mncord ? window.mncord.auth.save(t) : sessionStorage.setItem('mncord.rt', t)),
  clear: async () => (window.mncord ? window.mncord.auth.clear() : sessionStorage.removeItem('mncord.rt')),
};

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: () => void = () => {};

export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}
export const getAccessToken = () => accessToken;

export async function storeTokens(t: AuthTokens) {
  accessToken = t.accessToken;
  await vault.save(t.refreshToken);
}

/** Uses the stored refresh token to get a fresh pair. false = signed out. */
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const rt = await vault.load();
      if (!rt) return false;
      const r = await fetch(`${API_BASE}/api/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
      if (r.status === 401) {
        await vault.clear();
        accessToken = null;
        return false;
      }
      if (!r.ok) throw new ApiError(r.status, 'network');
      await storeTokens((await r.json()) as AuthTokens);
      return true;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function signOut() {
  try {
    if (accessToken) await api('POST', '/auth/logout');
  } catch {
    /* already invalid */
  }
  accessToken = null;
  await vault.clear();
  onSignedOut();
}

export async function api<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        'x-mncord-version': '0.0.1',
        'x-mncord-os': window.mncord?.platform ?? 'web',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (r.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(method, path, body, false);
    onSignedOut();
    throw new ApiError(401, 'unauthorized');
  }
  if (r.status === 204) return undefined as T;
  const data = (await r.json().catch(() => ({}))) as { error?: string; field?: string };
  if (!r.ok) throw new ApiError(r.status, data.error ?? 'unknown', data.field);
  return data as T;
}

/** Multipart upload with progress (XHR: fetch can't report upload progress). */
export function uploadFile(file: File, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<import('@mncord/shared').Attachment> {
  const attempt = (retry: boolean): Promise<import('@mncord/shared').Attachment> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/v1/uploads`);
      if (accessToken) xhr.setRequestHeader('authorization', `Bearer ${accessToken}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = async () => {
        if (xhr.status === 401 && retry && (await refresh())) return resolve(attempt(false));
        let body: { error?: string } = {};
        try {
          body = JSON.parse(xhr.responseText) as { error?: string };
        } catch {
          /* empty */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as import('@mncord/shared').Attachment);
        else reject(new ApiError(xhr.status, body.error ?? (xhr.status === 413 ? 'file_too_large' : 'unknown')));
      };
      xhr.onerror = () => reject(new ApiError(0, 'network'));
      xhr.onabort = () => reject(new ApiError(0, 'aborted'));
      signal?.addEventListener('abort', () => xhr.abort());
      const fd = new FormData();
      fd.append('file', file, file.name);
      xhr.send(fd);
    });
  return attempt(true);
}

/** Public URL of a user avatar / server icon (only served once it really is one). */
export const avatarUrl = (key?: string | null) => (key && /^[0-9a-f-]{36}$/.test(key) ? `${API_BASE}/avatars/${key}` : undefined);
