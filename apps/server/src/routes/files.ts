// Uploads (S30) and file serving. Images are decoded and re-encoded (drops EXIF/GPS and anything hidden
// inside the file); everything else is sniffed by magic bytes, never trusted by extension.
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import type { Db } from '../db.ts';
import { filesRoot, MAX_FILE, newKey, pathFor, PUBLIC_BASE, readStream, signedUrl, USER_QUOTA, verifySig } from '../files.ts';
import { HttpError, notFound, requireAuth } from '../http.ts';

const IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
// shown inline; everything else downloads
const INLINE = new Set([...IMAGE, 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm']);

const safeName = (n: string) =>
  (n.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*‪-‮⁦-⁩]/g, '_').replace(/^\.+/, '').trim() || 'file').slice(0, 200);

export function uploadRoutes(app: FastifyInstance, db: Db) {
  app.register(async (s) => {
    s.addHook('preHandler', requireAuth);
    await s.register(import('@fastify/multipart'), { limits: { fileSize: MAX_FILE, files: 1, fields: 2, parts: 3 } });

    s.post('/uploads', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
      const used = await db.query<{ n: string | number }>(`select coalesce(sum(size_bytes), 0) as n from files where owner_id = $1`, [req.userId]);
      if (Number(used.rows[0]?.n ?? 0) >= USER_QUOTA) throw new HttpError(413, 'quota_exceeded');
      const part = await req.file();
      if (!part) throw new HttpError(400, 'no_file');

      const id = randomUUID();
      const tmpDir = join(filesRoot(), 'tmp');
      await mkdir(tmpDir, { recursive: true });
      const tmp = join(tmpDir, id);
      const hash = createHash('sha256');
      let size = 0;
      try {
        await pipeline(
          part.file,
          new Transform({
            transform(chunk: Buffer, _e, cb) {
              size += chunk.length;
              hash.update(chunk);
              cb(null, chunk);
            },
          }),
          createWriteStream(tmp, { mode: 0o640 }),
        );
        if (part.file.truncated) throw new HttpError(413, 'file_too_large');
        if (size === 0) throw new HttpError(400, 'no_file');

        const sniffed = await fileTypeFromFile(tmp);
        let contentType = sniffed?.mime ?? (looksLikeText(part.filename) ? 'text/plain' : 'application/octet-stream');
        let width: number | null = null;
        let height: number | null = null;
        const key = newKey(id);
        const dest = pathFor(key);
        await mkdir(join(dest, '..'), { recursive: true });

        if (IMAGE.has(contentType) && size <= 50 * 1024 * 1024) {
          const animated = contentType === 'image/gif' || contentType === 'image/webp';
          // read into memory first: on Windows sharp can hold the temp file open and block its deletion
          const img = sharp(await readFile(tmp), { animated, limitInputPixels: 100_000_000 }).rotate();
          const meta = await img.metadata();
          // re-encode in the same family; animation is kept, metadata is dropped (sharp's default)
          const out = contentType === 'image/png' ? img.png({ compressionLevel: 8 }) : contentType === 'image/gif' ? img.gif() : contentType === 'image/webp' ? img.webp({ quality: 90 }) : contentType === 'image/avif' ? img.avif({ quality: 60 }) : img.jpeg({ quality: 88, mozjpeg: true });
          const info = await out.toFile(dest);
          width = meta.width ?? info.width;
          height = meta.pageHeight ?? meta.height ?? info.height;
          size = (await stat(dest)).size;
          await rm(tmp, { force: true });
        } else {
          if (IMAGE.has(contentType)) contentType = 'application/octet-stream'; // huge image: store, don't decode
          await rename(tmp, dest);
        }

        await db.query(
          `insert into files (id, owner_id, key, content_type, size_bytes, sha256, width, height, status, original_name)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'ready', $9)`,
          [id, req.userId, key, contentType, size, hash.digest(), width, height, safeName(part.filename)],
        );
        return reply.status(201).send({ id, filename: safeName(part.filename), size, contentType, width, height, url: signedUrl(PUBLIC_BASE(), id) });
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
    });
  });
}

export function fileServeRoute(app: FastifyInstance, db: Db) {
  app.get<{ Params: { id: string } }>('/avatars/:id', async (req, reply) => {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
    const { rows } = await db.query<{ key: string; contentType: string; size: string | number }>(
      `select f.key, f.content_type as "contentType", f.size_bytes as size from files f
        where f.id = $1 and f.status = 'ready' and f.content_type like 'image/%'
          and (exists (select 1 from users u where u.avatar_key = $1::text) or exists (select 1 from guilds g where g.icon_key = $1::text))`,
      [id],
    );
    const f = rows[0];
    if (!f) throw notFound();
    reply
      .header('content-type', f.contentType)
      .header('content-length', String(f.size))
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cross-origin-resource-policy', 'cross-origin')
      .header('cache-control', 'public, max-age=604800, immutable');
    return reply.send(readStream(f.key));
  });

  // Signed URL, no auth header (so <img src> works). Strict headers: nothing here can run as a page.
  app.get<{ Params: { id: string }; Querystring: { exp?: string; sig?: string; download?: string } }>('/files/:id', async (req, reply) => {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id) || !verifySig(id, req.query.exp ?? '', req.query.sig ?? '')) throw notFound();
    const { rows } = await db.query<{ key: string; contentType: string; size: string | number; name: string | null }>(
      `select key, content_type as "contentType", size_bytes as size, original_name as name from files where id = $1 and status = 'ready'`,
      [id],
    );
    const f = rows[0];
    if (!f) throw notFound();
    const inline = INLINE.has(f.contentType) && req.query.download !== '1';
    const name = encodeURIComponent(f.name ?? 'file');
    reply
      .header('content-type', f.contentType)
      .header('content-length', String(f.size))
      .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`)
      .header('content-security-policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox")
      .header('cross-origin-resource-policy', 'cross-origin')
      .header('cache-control', 'private, max-age=86400, immutable');
    return reply.send(readStream(f.key));
  });
}

const looksLikeText = (name: string) => /\.(txt|md|log|csv|json|js|ts|py|c|cpp|cs|java|go|rs|lua|sql|yml|yaml|ini|toml)$/i.test(name);
