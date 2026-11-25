// Uploads: up to 200 MB per file, stored in R2 for 14 days (attachments), then deleted automatically.
// 1) POST /uploads {filename,size,contentType,kind,width?,height?} → upload id + part URLs
// 2) PUT each part to the Worker (/upload/:id/:n?t=…) → {partNumber, etag}
// 3) POST /uploads/:id/complete {parts} → the file (sniffed by magic bytes, never trusted by name)
// Images are resized/re-encoded on the client before upload (that also drops EXIF/GPS).
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { config, env } from '../config.ts';
import type { Db } from '../db.ts';
import { objectKey, PART_SIZE, PUBLIC_BASE, signedUrl, uploadToken } from '../files.ts';
import { HttpError, notFound, parse, requireAuth } from '../http.ts';
import type { App } from '../shim.ts';

const IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const INLINE = new Set([...IMAGE, 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4']);
const PUBLIC_KINDS = new Set(['avatar', 'icon', 'emoji', 'banner']);
const PUBLIC_MAX = 10 * 1024 * 1024;

const safeName = (n: string) =>
  (n.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*‪-‮⁦-⁩]/g, '_').replace(/^\.+/, '').trim() || 'file').slice(0, 200);
const looksLikeText = (name: string) => /\.(txt|md|log|csv|json|js|ts|py|c|cpp|cs|java|go|rs|lua|sql|yml|yaml|ini|toml)$/i.test(name);

const StartInput = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string().max(100).default('application/octet-stream'),
  kind: z.enum(['attachment', 'avatar', 'icon', 'emoji', 'banner']).default('attachment'),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
});
const CompleteInput = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10), etag: z.string().max(200) })).min(1).max(10) });

export function uploadRoutes(app: App, db: Db) {
  app.addHook('preHandler', requireAuth);

  app.post('/uploads', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const input = parse(StartInput, req.body);
    const isPublic = PUBLIC_KINDS.has(input.kind);
    if (input.size > (isPublic ? PUBLIC_MAX : config.maxUploadBytes)) throw new HttpError(413, 'file_too_large');
    if (isPublic && !IMAGE.has(input.contentType)) throw new HttpError(400, 'not_an_image');
    // never pass the free 10 GB of R2: refuse uploads above the cap (old media is deleted after 14 days)
    const used = await db.query<{ n: number }>(`select coalesce(sum(size_bytes), 0) as n from files where status in ('pending','ready')`);
    if (Number(used.rows[0]?.n ?? 0) + input.size > config.storageCapBytes) throw new HttpError(507, 'storage_full');

    const id = crypto.randomUUID();
    const key = objectKey(id, input.kind);
    const name = safeName(input.filename);
    const ct = INLINE.has(input.contentType) ? input.contentType : looksLikeText(name) ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    const disposition = `${INLINE.has(ct) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`;
    const mp = await env().FILES.createMultipartUpload(key, { httpMetadata: { contentType: ct, contentDisposition: disposition } });
    const parts = Math.max(1, Math.ceil(input.size / PART_SIZE));
    await db.query(
      `insert into files (id, owner_id, key, kind, content_type, size_bytes, width, height, duration_ms, status, original_name, upload_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)`,
      [id, req.userId, key, input.kind, ct, input.size, input.width ?? null, input.height ?? null, input.durationMs ?? null, name, mp.uploadId],
    );
    const t = uploadToken({ fileId: id, key, uploadId: mp.uploadId, parts });
    return reply.status(201).send({
      id,
      partSize: PART_SIZE,
      parts: Array.from({ length: parts }, (_, i) => ({ partNumber: i + 1, url: `${PUBLIC_BASE()}/upload/${id}/${i + 1}?t=${t}` })),
    });
  });

  app.post('/uploads/:id/complete', async (req) => {
    const input = parse(CompleteInput, req.body);
    const { rows } = await db.query<{ key: string; kind: string; contentType: string; size: number; uploadId: string; name: string; width: number | null; height: number | null }>(
      `select key, kind, content_type as "contentType", size_bytes as size, upload_id as "uploadId", original_name as name, width, height
         from files where id = $1 and owner_id = $2 and status = 'pending'`,
      [req.params.id, req.userId],
    );
    const f = rows[0];
    if (!f) throw notFound();
    const bucket = env().FILES;
    const mp = bucket.resumeMultipartUpload(f.key, f.uploadId);
    let size = 0;
    try {
      const obj = await mp.complete(input.parts.sort((a, b) => a.partNumber - b.partNumber));
      size = obj.size;
    } catch {
      throw new HttpError(400, 'upload_incomplete');
    }
    const fail = async (code: string) => {
      await bucket.delete(f.key);
      await db.query(`delete from files where id = $1`, [req.params.id]);
      throw new HttpError(400, code);
    };
    if (size <= 0 || size > (PUBLIC_KINDS.has(f.kind) ? PUBLIC_MAX : config.maxUploadBytes) || size > f.size + 1024) return fail('file_too_large');
    // magic-byte check: an "image" or "video" must really be one
    const head = await bucket.get(f.key, { range: { offset: 0, length: 4100 } });
    const sniffed = head ? await fileTypeFromBuffer(new Uint8Array(await head.arrayBuffer())) : undefined;
    const family = (m: string) => m.split('/')[0];
    if (INLINE.has(f.contentType) && (!sniffed || family(sniffed.mime) !== family(f.contentType))) return fail('type_mismatch');
    await db.query(`update files set status = 'ready', size_bytes = $2, upload_id = null where id = $1`, [req.params.id, size]);
    const base = PUBLIC_BASE();
    return {
      id: req.params.id,
      filename: f.name,
      size,
      contentType: f.contentType,
      width: f.width,
      height: f.height,
      url: PUBLIC_KINDS.has(f.kind) ? `${base}/avatars/${req.params.id}` : signedUrl(base, req.params.id),
    };
  });

  app.post('/uploads/:id/abort', async (req, reply) => {
    const { rows } = await db.query<{ key: string; uploadId: string | null }>(
      `select key, upload_id as "uploadId" from files where id = $1 and owner_id = $2 and status = 'pending'`,
      [req.params.id, req.userId],
    );
    const f = rows[0];
    if (f?.uploadId) await env().FILES.resumeMultipartUpload(f.key, f.uploadId).abort().catch(() => {});
    if (f) await db.query(`delete from files where id = $1`, [req.params.id]);
    return reply.status(204).send();
  });
}

/** Daily: delete every image/video older than MEDIA_TTL_DAYS, and abandoned uploads. Messages keep a placeholder. */
export async function cleanupMedia(db: Db) {
  const bucket = env().FILES;
  const days = config.mediaTtlDays;
  const old = await db.query<{ id: string; key: string }>(
    `select id, key from files where kind = 'attachment' and status = 'ready' and created_at < (strftime('%Y-%m-%dT%H:%M:%fZ','now','-${Math.max(1, Math.floor(days))} days')) limit 5000`,
  );
  for (let i = 0; i < old.rows.length; i += 1000) {
    const chunk = old.rows.slice(i, i + 1000);
    await bucket.delete(chunk.map((r) => r.key));
    await db.query(`update files set status = 'expired' where id in (select value from json_each($1))`, [chunk.map((r) => r.id)]);
  }
  const stale = await db.query<{ id: string; key: string; uploadId: string | null }>(
    `select id, key, upload_id as "uploadId" from files where status = 'pending' and created_at < now() - interval '1 day'`,
  );
  for (const f of stale.rows) {
    if (f.uploadId) await bucket.resumeMultipartUpload(f.key, f.uploadId).abort().catch(() => {});
    await db.query(`delete from files where id = $1`, [f.id]);
  }
  return { expired: old.rows.length, abandoned: stale.rows.length };
}
