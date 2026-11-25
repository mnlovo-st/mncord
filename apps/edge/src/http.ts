import { type ZodType } from 'zod';
import { verifyAccessToken } from './auth/tokens.ts';
import type { Req } from './shim.ts';

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

/** preHandler: requires a valid access token. */
export async function requireAuth(req: Req) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
  const claims = await verifyAccessToken(h.slice(7)).catch(() => null);
  if (!claims) throw new HttpError(401, 'unauthorized');
  req.userId = claims.sub;
  req.sessionId = claims.sid;
}
