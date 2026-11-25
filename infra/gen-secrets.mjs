// Prints fresh production secrets for infra/.env. Run once on the server: node gen-secrets.mjs >> .env
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ed25519');
const jwk = privateKey.export({ format: 'jwk' });
const b64 = (n) => randomBytes(n).toString('base64');
const hex = (n) => randomBytes(n).toString('hex');

console.log(`POSTGRES_PASSWORD=${hex(24)}`);
console.log(`JWT_PRIVATE_JWK=${JSON.stringify(jwk)}`);
console.log(`SECRETS_KEY=${b64(32)}`);
console.log(`FILES_SIGNING_KEY=${b64(32)}`);
