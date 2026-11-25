// Access tokens: short-lived EdDSA JWTs. Refresh tokens: opaque, hashed at rest, rotated every use.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { importJWK, jwtVerify, SignJWT, type CryptoKey, type JWK } from 'jose';
import { config } from '../config.ts';

const ISSUER = 'mncord';
let keys: Promise<{ priv: CryptoKey; pub: CryptoKey }> | null = null;

function loadKeys() {
  keys ??= (async () => {
    // the signing key always comes from the environment (production: a Worker secret; dev/tests: .dev.vars)
    if (!config.jwtPrivateJwk) throw new Error('JWT_PRIVATE_JWK not set');
    const jwk = JSON.parse(config.jwtPrivateJwk) as JWK;
    const priv = (await importJWK(jwk, 'EdDSA')) as CryptoKey;
    const { d: _d, ...pubJwk } = jwk;
    const pub = (await importJWK(pubJwk, 'EdDSA')) as CryptoKey;
    return { priv, pub };
  })();
  return keys;
}

export async function signAccessToken(userId: string, sessionId: string) {
  const { priv } = await loadKeys();
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTtlSeconds}s`)
    .sign(priv);
}

export async function verifyAccessToken(token: string): Promise<{ sub: string; sid: string }> {
  const { pub } = await loadKeys();
  const { payload } = await jwtVerify(token, pub, { issuer: ISSUER, algorithms: ['EdDSA'] });
  if (payload.aud !== undefined) throw new Error('not an access token'); // e.g. an MFA ticket
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('bad claims');
  return { sub: payload.sub, sid: payload.sid };
}

/** 5-minute ticket between "password OK" and "2FA code OK". Can't be used as an access token (different audience). */
export async function signMfaTicket(userId: string) {
  const { priv } = await loadKeys();
  return new SignJWT({}).setProtectedHeader({ alg: 'EdDSA' }).setSubject(userId).setIssuer(ISSUER).setAudience('mfa').setIssuedAt().setExpirationTime('5m').sign(priv);
}
export async function verifyMfaTicket(ticket: string): Promise<string> {
  const { pub } = await loadKeys();
  const { payload } = await jwtVerify(ticket, pub, { issuer: ISSUER, audience: 'mfa', algorithms: ['EdDSA'] });
  if (typeof payload.sub !== 'string') throw new Error('bad ticket');
  return payload.sub;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** refresh token = "<sessionId>.<secret>"; only sha256(secret) is stored. */
export function newRefreshSecret() {
  return randomBytes(32).toString('base64url');
}
export function splitRefresh(token: string): { sessionId: string; secret: string } | null {
  const i = token.indexOf('.');
  if (i < 0) return null;
  const sessionId = token.slice(0, i);
  const secret = token.slice(i + 1);
  if (!/^[0-9a-f-]{36}$/.test(sessionId) || secret.length < 20) return null;
  return { sessionId, secret };
}
export function hashMatches(secret: string, stored: Uint8Array) {
  const h = sha256(secret);
  return stored.length === h.length && timingSafeEqual(h, Buffer.from(stored));
}
