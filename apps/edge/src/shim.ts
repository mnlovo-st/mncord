// A small Fastify-shaped router for the Durable Object, so the route modules keep their exact logic:
//   app.get(path, { preHandler, config: { rateLimit } }?, async (req, reply) => …)
//   app.addHook('preHandler', fn) applies to routes added after it in the same scope; app.scope(prefix) nests.
import { ZodError } from 'zod';
import { config } from './config.ts';
import { HttpError } from './http.ts';

type ParamKey = 'id' | 'uid' | 'mid' | 'target' | 'code' | 'rid' | 'emoji' | 'eid';
export interface Req {
  method: string;
  url: string;
  /** path parameters; a route only reads the ones its path declares */
  params: Record<ParamKey, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  ip: string;
  userId: string;
  sessionId: string;
  raw: Request;
  log: { error: (e: unknown) => void; warn: (e: unknown) => void };
}
export interface Reply {
  statusCode: number;
  sent: boolean;
  status(n: number): Reply;
  code(n: number): Reply;
  header(k: string, v: string): Reply;
  hasHeader(k: string): boolean;
  type(ct: string): Reply;
  send(body?: unknown): Reply;
}
type Hook = (req: Req, reply: Reply) => unknown;
type Handler = (req: Req, reply: Reply) => unknown;
interface RouteOpts {
  preHandler?: Hook | Hook[];
  config?: { rateLimit?: { max: number; timeWindow: string } };
  bodyLimit?: number;
}
interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  hooks: Hook[];
  opts: RouteOpts;
  handler: Handler;
  path: string;
}

const windowMs = (w: string) => {
  const m = /^(\d+)\s*(second|minute|hour|day)s?$/.exec(w.trim());
  if (!m) return 60_000;
  return Number(m[1]) * { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 }[m[2] as 'second'];
};

class Limiter {
  private hits = new Map<string, number[]>();
  /** true = allowed */
  take(key: string, max: number, ms: number) {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < ms);
    if (arr.length >= max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 20_000) for (const k of [...this.hits.keys()].slice(0, 5000)) this.hits.delete(k);
    return true;
  }
}

export class App {
  private routes: Route[];
  private prefix: string;
  private hooks: Hook[];
  private limiter: Limiter;
  constructor(routes: Route[] = [], prefix = '', hooks: Hook[] = [], limiter = new Limiter()) {
    this.routes = routes;
    this.prefix = prefix;
    this.hooks = hooks;
    this.limiter = limiter;
  }
  /** nested scope: same route table, extra prefix, its own copy of hooks */
  scope(prefix = '') {
    return new App(this.routes, this.prefix + prefix, [...this.hooks], this.limiter);
  }
  addHook(name: string, fn: Hook) {
    if (name === 'preHandler') this.hooks.push(fn);
    // 'onClose' and others: the Durable Object has no shutdown hook; ignored on purpose
  }
  private add(method: string, path: string, a: RouteOpts | Handler, b?: Handler) {
    const opts = typeof a === 'function' ? {} : a;
    const handler = (typeof a === 'function' ? a : b)!;
    const full = this.prefix + path;
    const keys: string[] = [];
    const re = new RegExp(
      '^' + full.replace(/[.+?^${}()|[\]\\]/g, (c) => (c === ':' ? c : '\\' + c)).replace(/:(\w+)/g, (_m, k: string) => (keys.push(k), '([^/]+)')) + '/?$',
    );
    const extra = opts.preHandler ? (Array.isArray(opts.preHandler) ? opts.preHandler : [opts.preHandler]) : [];
    this.routes.push({ method, re, keys, hooks: [...this.hooks, ...extra], opts, handler, path: full });
  }
  get(p: string, a: RouteOpts | Handler, b?: Handler) { this.add('GET', p, a, b); }
  post(p: string, a: RouteOpts | Handler, b?: Handler) { this.add('POST', p, a, b); }
  put(p: string, a: RouteOpts | Handler, b?: Handler) { this.add('PUT', p, a, b); }
  patch(p: string, a: RouteOpts | Handler, b?: Handler) { this.add('PATCH', p, a, b); }
  delete(p: string, a: RouteOpts | Handler, b?: Handler) { this.add('DELETE', p, a, b); }

  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname;
    let route: Route | undefined;
    let m: RegExpExecArray | null = null;
    let pathMatched = false;
    // like Fastify: a static segment beats a parameter (/users/@me before /users/:id), whatever the order
    for (const r of this.routes) {
      const mm = r.re.exec(path);
      if (!mm) continue;
      pathMatched = true;
      if (r.method !== request.method && !(request.method === 'HEAD' && r.method === 'GET')) continue;
      if (!route || r.keys.length < route.keys.length) {
        route = r;
        m = mm;
      }
    }
    if (!route || !m) return pathMatched ? json(405, { error: 'method_not_allowed' }) : null;

    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const ip = headers['x-real-ip'] || headers['cf-connecting-ip'] || '127.0.0.1';
    const params = {} as Record<ParamKey, string>;
    route.keys.forEach((k, i) => (params[k as ParamKey] = decodeURIComponent(m![i + 1]!)));
    const query: Record<string, string | undefined> = {};
    url.searchParams.forEach((v, k) => (query[k] = v));

    const out = { status: 200, headers: new Headers(), body: undefined as unknown, sent: false };
    const reply: Reply = {
      get statusCode() { return out.status; },
      get sent() { return out.sent; },
      status(n) { out.status = n; return reply; },
      code(n) { out.status = n; return reply; },
      header(k, v) { out.headers.set(k, v); return reply; },
      hasHeader(k) { return out.headers.has(k); },
      type(ct) { out.headers.set('content-type', ct); return reply; },
      send(body) { out.body = body; out.sent = true; return reply; },
    };
    const req: Req = {
      method: request.method, url: path + url.search, params, query, body: undefined, headers, ip,
      userId: '', sessionId: '', raw: request,
      log: { error: (e) => console.error('[route]', route!.path, e), warn: (e) => console.warn('[route]', route!.path, e) },
    };
    try {
      // rate limits: global 300/min per IP, plus the route's own
      const scale = config.rateLimitScale;
      if (!this.limiter.take(`g:${ip}`, 300 * scale, 60_000)) throw Object.assign(new Error('rate'), { statusCode: 429 });
      const rl = route.opts.config?.rateLimit;
      if (rl && !this.limiter.take(`r:${route.method}:${route.path}:${ip}`, rl.max * scale, windowMs(rl.timeWindow))) throw Object.assign(new Error('rate'), { statusCode: 429 });
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE') {
        const text = await request.text();
        if (text.length > (route.opts.bodyLimit ?? 64 * 1024)) throw new HttpError(413, 'body_too_large');
        if (text) {
          try {
            req.body = JSON.parse(text);
          } catch {
            throw new HttpError(400, 'invalid_json');
          }
        }
      } else if (request.method === 'DELETE') {
        const text = await request.text().catch(() => '');
        if (text) req.body = JSON.parse(text);
      }
      for (const h of route.hooks) {
        await h(req, reply);
        if (out.sent) break;
      }
      if (!out.sent) {
        const r = await route.handler(req, reply);
        if (!out.sent && r !== undefined) reply.send(r);
      }
    } catch (e) {
      errorToReply(e, req, reply);
    }
    return toResponse(out.status, out.headers, out.body);
  }
}

function errorToReply(err: unknown, req: Req, reply: Reply) {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, field: err.field });
  if (err instanceof ZodError) return reply.status(400).send({ error: 'invalid_input' });
  const e = err as { statusCode?: number; code?: string };
  if (e.statusCode === 429) return reply.status(429).send({ error: 'rate_limited' });
  if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: 'bad_request' });
  if (e.code === '23505') return reply.status(409).send({ error: 'conflict' });
  req.log.error(err);
  return reply.status(500).send({ error: 'internal' });
}

export function json(status: number, body: unknown, headers?: HeadersInit) {
  return toResponse(status, new Headers(headers), body);
}

function toResponse(status: number, headers: Headers, body: unknown): Response {
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  if (status === 204 || body === undefined || body === null) return new Response(status === 204 ? null : '', { status, headers });
  if (body instanceof Response) return body;
  if (typeof body === 'string' || body instanceof ArrayBuffer || body instanceof Uint8Array || body instanceof ReadableStream) {
    return new Response(body as BodyInit, { status, headers });
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}
