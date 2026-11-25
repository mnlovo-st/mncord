// Worker entry: routes API + gateway to the Hub Durable Object, serves files straight from R2 (signed URLs),
// takes upload parts straight into R2 multipart uploads, and runs the daily media cleanup.
import { env as setRuntimeEnv, setEnv, type Env } from './config.ts';
import { verifySig, verifyUploadToken } from './files.ts';
export { MncordHub } from './hub.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-mncord-version, x-mncord-os, range',
  'access-control-expose-headers': 'content-length, content-range, content-disposition, accept-ranges, etag',
  'access-control-max-age': '86400',
};
const withCors = (r: Response) => {
  if (r.status === 101) return r; // websocket upgrade
  const res = new Response(r.body, r);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function hubStub(env: Env, instance = 'main') {
  return env.HUB.get(env.HUB.idFromName(instance), { locationHint: 'me' }); // Middle East, close to the UAE
}

async function serveObject(request: Request, env: Env, key: string, publicCache: boolean) {
  const obj = await env.FILES.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return json(404, { error: 'not_found' });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', publicCache ? 'public, max-age=86400' : 'private, max-age=604800, immutable');
  // never let an uploaded file run as a page
  headers.set('content-security-policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  if (!('body' in obj)) return new Response(null, { status: 304, headers });
  const body = (obj as R2ObjectBody).body;
  if (request.headers.has('range') && obj.range && 'offset' in obj.range) {
    const r = obj.range as { offset: number; length?: number };
    const end = r.offset + (r.length ?? obj.size - r.offset) - 1;
    headers.set('content-range', `bytes ${r.offset}-${end}/${obj.size}`);
    headers.set('content-length', String(end - r.offset + 1));
    return new Response(body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    setEnv(env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    let path = url.pathname;

    // dev/tests: /__i/<name>/... picks an isolated database instance
    let instance = 'main';
    if (env.DEV_TOOLS === '1') {
      const m = /^\/__i\/([\w-]{1,40})(\/.*)$/.exec(path);
      if (m) {
        instance = m[1]!;
        path = m[2]!;
      }
    }

    if (path === '/health') return withCors(json(200, { ok: true }));

    // GET /files/:id?exp&sig → private attachment (signed, expiring link)
    let m = /^\/files\/([0-9a-f-]{36})$/.exec(path);
    if (m && (request.method === 'GET' || request.method === 'HEAD')) {
      if (!verifySig(m[1]!, url.searchParams.get('exp') ?? '', url.searchParams.get('sig') ?? '')) return withCors(json(404, { error: 'not_found' })); // same answer as a missing file
      return withCors(await serveObject(request, env, `f/${m[1]}`, false));
    }
    // GET /avatars/:id → public profile pictures, server icons and emoji
    m = /^\/avatars\/([0-9a-f-]{36})$/.exec(path);
    if (m && (request.method === 'GET' || request.method === 'HEAD')) return withCors(await serveObject(request, env, `a/${m[1]}`, true));

    // PUT /upload/:fileId/:part?t=token → one part of a multipart upload, straight into R2 (≤ 95 MB per part)
    m = /^\/upload\/([0-9a-f-]{36})\/(\d{1,2})$/.exec(path);
    if (m && request.method === 'PUT') {
      const tok = verifyUploadToken(url.searchParams.get('t') ?? '');
      if (!tok || tok.fileId !== m[1]) return withCors(json(403, { error: 'bad_token' }));
      const part = Number(m[2]);
      const len = Number(request.headers.get('content-length') ?? 0);
      if (part < 1 || part > tok.parts || !request.body || len <= 0 || len > 95 * 1024 * 1024) return withCors(json(400, { error: 'bad_part' }));
      try {
        const up = env.FILES.resumeMultipartUpload(tok.key, tok.uploadId);
        const res = await up.uploadPart(part, request.body);
        return withCors(json(200, { partNumber: res.partNumber, etag: res.etag }));
      } catch {
        return withCors(json(400, { error: 'upload_failed' }));
      }
    }

    if (path.startsWith('/__') && !(env.DEV_TOOLS === '1' && path.startsWith('/__dev/'))) return withCors(json(404, { error: 'not_found' }));

    if (path === '/gateway' || path.startsWith('/api/') || path.startsWith('/__dev/')) {
      const fwd = new URL(request.url);
      fwd.pathname = path;
      const headers = new Headers(request.headers);
      headers.set('x-real-ip', request.headers.get('cf-connecting-ip') ?? '127.0.0.1');
      const res = await hubStub(env, instance).fetch(new Request(fwd, { method: request.method, headers, body: request.body }));
      return withCors(res);
    }
    return withCors(json(404, { error: 'not_found' }));
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    setEnv(env);
    void setRuntimeEnv;
    ctx.waitUntil(hubStub(env).fetch('https://hub/__cron', { method: 'POST', headers: { 'x-mncord-cron': '1' } }).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
