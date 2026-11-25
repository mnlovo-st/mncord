import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';
import { verifyAccessToken } from './auth/tokens.ts';

export class HttpError extends Error {
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

export const forbidden = (code = 'missing_permission') => new HttpError(403, code);
export const notFound = (code = 'not_found') => new HttpError(404, code);

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new HttpError(400, issue?.message && /^[a-z_]+$/.test(issue.message) ? issue.message : 'invalid_input', issue?.path.join('.'));
  }
  return r.data;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    sessionId: string;
  }
}

/** preHandler: requires a valid access token. */
export async function requireAuth(req: FastifyRequest) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
  const claims = await verifyAccessToken(h.slice(7)).catch(() => null);
  if (!claims) throw new HttpError(401, 'unauthorized');
  req.userId = claims.sub;
  req.sessionId = claims.sid;
}

export function errorHandler(err: unknown, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, field: err.field });
  if (err instanceof ZodError) return reply.status(400).send({ error: 'invalid_input' });
  const e = err as { statusCode?: number; code?: string; message?: string };
  if (e.statusCode === 429) return reply.status(429).send({ error: 'rate_limited' });
  if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: 'bad_request' });
  // unique violation from Postgres
  if (e.code === '23505') return reply.status(409).send({ error: 'conflict' });
  req.log.error(err);
  if (process.env.VITEST) console.error(err);
  return reply.status(500).send({ error: 'internal' });
}
