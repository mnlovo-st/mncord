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

// ── passwords never leave the device: every request that carries one gets the Argon2id key instead
let mySalt: { login: string; salt: string } | null = null;
async function saltFor(login: string) {
  if (mySalt && mySalt.login === login.toLowerCase()) return mySalt.salt;
  const r = await rawApi<{ salt: string }>('POST', '/auth/prelogin', { login });
  return r.salt;
}
async function myLogin() {
  const { get } = await import('./store');
  const me = get().me;
  if (!me) throw new ApiError(401, 'unauthorized');
  return me.username;
}
async function securePasswords(path: string, body: unknown): Promise<unknown> {
  if (!body || typeof body !== 'object') return body;
  const b = { ...(body as Record<string, unknown>) };
  const { deriveKey, isBreached, newSalt } = await import('./secure');
  const fresh = async (pw: string) => {
    if (pw.length < 8) throw new ApiError(400, 'password_short', 'password');
    if (await isBreached(pw)) throw new ApiError(400, 'password_breached', 'password');
    const salt = newSalt();
    return { key: await deriveKey(pw, salt), salt };
  };
  if (path === '/auth/register' || path === '/auth/reset') {
    if (typeof b.password === 'string') {
      const f = await fresh(b.password);
      b.password = f.key;
      b.salt = f.salt;
      mySalt = { login: String(b.username ?? b.email ?? '').toLowerCase(), salt: f.salt };
    }
    return b;
  }
  if (path === '/auth/login') {
    if (typeof b.password === 'string' && typeof b.login === 'string') {
      const salt = await saltFor(b.login);
      b.password = await deriveKey(b.password, salt);
    }
    return b;
  }
  if (path === '/users/@me/password') {
    const login = await myLogin();
    const salt = await saltFor(login);
    if (typeof b.currentPassword === 'string') b.currentPassword = await deriveKey(b.currentPassword, salt);
    if (typeof b.newPassword === 'string') {
      const f = await fresh(b.newPassword);
      b.newPassword = f.key;
      b.newSalt = f.salt;
      mySalt = { login: login.toLowerCase(), salt: f.salt };
    }
    return b;
  }
  if (typeof b.password === 'string' && b.password) b.password = await deriveKey(b.password, await saltFor(await myLogin()));
  return b;
}

export async function api<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  return rawApi<T>(method, path, path === '/auth/prelogin' ? body : await securePasswords(path, body), retry);
}

async function rawApi<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
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
    if (await refresh()) return rawApi<T>(method, path, body, false);
    onSignedOut();
    throw new ApiError(401, 'unauthorized');
  }
  if (r.status === 204) return undefined as T;
  const data = (await r.json().catch(() => ({}))) as { error?: string; field?: string };
  if (!r.ok) throw new ApiError(r.status, data.error ?? 'unknown', data.field);
  return data as T;
}

export const MAX_UPLOAD = 200 * 1024 * 1024;
export type UploadKind = 'attachment' | 'avatar' | 'icon' | 'emoji' | 'banner';

/** PUT one part with progress (XHR: fetch can't report upload progress). */
function putPart(url: string, blob: Blob, onBytes: (n: number) => void, signal?: AbortSignal) {
  return new Promise<{ partNumber: number; etag: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new ApiError(xhr.status, 'upload_failed'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(blob);
  });
}

/**
 * Upload straight into storage: images are resized/re-encoded on the device first (drops EXIF/GPS),
 * then sent in 50 MB parts with live progress. Up to 200 MB; attachments are kept for 14 days.
 */
export async function uploadFile(input: File, onProgress: (pct: number) => void, signal?: AbortSignal, kind: UploadKind = 'attachment'): Promise<import('@mncord/shared').Attachment> {
  const { prepareImage } = await import('./secure');
  const { file, width, height } = await prepareImage(input, kind);
  if (file.size > MAX_UPLOAD) throw new ApiError(413, 'file_too_large');
  const start = await api<{ id: string; partSize: number; parts: { partNumber: number; url: string }[] }>('POST', '/uploads', {
    filename: file.name, size: file.size, contentType: file.type || 'application/octet-stream', kind, width, height,
  });
  const done: { partNumber: number; etag: string }[] = [];
  let sent = 0;
  try {
    for (const p of start.parts) {
      const blob = file.slice((p.partNumber - 1) * start.partSize, p.partNumber * start.partSize);
      done.push(await putPart(p.url, blob, (n) => onProgress(Math.min(99, Math.round(((sent + n) / file.size) * 100))), signal));
      sent += blob.size;
    }
    const a = await api<import('@mncord/shared').Attachment>('POST', `/uploads/${start.id}/complete`, { parts: done });
    onProgress(100);
    return a;
  } catch (e) {
    void api('POST', `/uploads/${start.id}/abort`, {}).catch(() => {});
    throw e;
  }
}

/** Public URL of a user avatar / server icon (only served once it really is one). */
export const avatarUrl = (key?: string | null) => (key && /^[0-9a-f-]{36}$/.test(key) ? `${API_BASE}/avatars/${key}` : undefined);
