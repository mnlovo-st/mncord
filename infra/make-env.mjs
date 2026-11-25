// Builds the production infra/.env from the owner's keys file, generating the server's own secrets ONCE.
//   node infra/make-env.mjs <keys.txt> <apps/server/.env (Cloudflare)> <output .env>
// If the output already exists its generated secrets are kept (changing them would sign everyone out and
// make stored 2FA secrets unreadable); only the owner-provided values are refreshed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const [keysPath, cfPath, outPath] = process.argv.slice(2);
if (!keysPath || !cfPath || !outPath) {
  console.error('usage: node infra/make-env.mjs <keys.txt> <apps/server/.env> <output .env>');
  process.exit(2);
}
const parse = (p) =>
  existsSync(p)
    ? Object.fromEntries(
        readFileSync(p, 'utf8')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#') && l.includes('='))
          .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
      )
    : {};
const keys = parse(keysPath);
const cf = parse(cfPath);
const old = parse(outPath);

const need = (obj, k, from) => {
  const v = obj[k];
  if (!v) {
    console.error(`missing ${k} in ${from}`);
    process.exitCode = 1;
  }
  return v ?? '';
};
const gmail = need(keys, 'GMAIL_ADDRESS', keysPath);
const appPass = need(keys, 'GMAIL_APP_PASSWORD', keysPath).replace(/\s+/g, '');
const duck = need(keys, 'DUCKDNS_TOKEN', keysPath);
const appId = need(cf, 'CF_REALTIME_APP_ID', cfPath);
const appSecret = need(cf, 'CF_REALTIME_APP_SECRET', cfPath);
if (process.exitCode) process.exit(1);

const { privateKey } = generateKeyPairSync('ed25519');
const gen = {
  POSTGRES_PASSWORD: old.POSTGRES_PASSWORD || randomBytes(24).toString('hex'),
  JWT_PRIVATE_JWK: old.JWT_PRIVATE_JWK || JSON.stringify(privateKey.export({ format: 'jwk' })),
  SECRETS_KEY: old.SECRETS_KEY || randomBytes(32).toString('base64'),
  FILES_SIGNING_KEY: old.FILES_SIGNING_KEY || randomBytes(32).toString('base64'),
};
const subdomain = keys.DUCKDNS_SUBDOMAIN || 'mncord';
const lines = [
  '# mncord production settings. SECRET: never commit, never share. Built by infra/make-env.mjs',
  `DOMAIN=${keys.DOMAIN || `${subdomain}.duckdns.org`}`,
  '',
  `POSTGRES_PASSWORD=${gen.POSTGRES_PASSWORD}`,
  `JWT_PRIVATE_JWK=${gen.JWT_PRIVATE_JWK}`,
  `SECRETS_KEY=${gen.SECRETS_KEY}`,
  `FILES_SIGNING_KEY=${gen.FILES_SIGNING_KEY}`,
  '',
  `CF_REALTIME_APP_ID=${appId}`,
  `CF_REALTIME_APP_SECRET=${appSecret}`,
  `CF_TURN_KEY_ID=${keys.CF_TURN_KEY_ID || ''}`,
  `CF_TURN_KEY_TOKEN=${keys.CF_TURN_KEY_TOKEN || ''}`,
  '',
  `SMTP_URL=smtps://${encodeURIComponent(gmail)}:${encodeURIComponent(appPass)}@smtp.gmail.com:465`,
  `MAIL_FROM=mncord <${gmail}>`,
  '',
  `DUCKDNS_TOKEN=${duck}`,
  `DUCKDNS_SUBDOMAIN=${subdomain}`,
  '',
];
writeFileSync(outPath, lines.join('\n'), { mode: 0o600 });
console.log(`wrote ${outPath} (${Object.keys(old).length ? 'kept existing generated secrets' : 'new secrets generated'})`);
