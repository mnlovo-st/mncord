// On-device password hardening. The server only ever sees Argon2id(password, per-account salt), never the
// password itself, and checks breached passwords here with k-anonymity (5 hex chars of SHA-1 leave the device).
import { argon2id } from 'hash-wasm';

export interface Kdf { memoryKiB: number; iterations: number; parallelism: number; hashLength: number }
const DEFAULT_KDF: Kdf = { memoryKiB: 65536, iterations: 3, parallelism: 1, hashLength: 32 };

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const newSalt = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveKey(password: string, salt: string, kdf: Kdf = DEFAULT_KDF): Promise<string> {
  const out = await argon2id({
    password: password.normalize('NFKC'),
    salt: new TextEncoder().encode(salt),
    iterations: kdf.iterations,
    memorySize: kdf.memoryKiB,
    parallelism: kdf.parallelism,
    hashLength: kdf.hashLength,
    outputType: 'binary',
  });
  return b64url(out);
}

/** true if the password appears in known breaches. Fails open (offline / slow) so sign-up is never blocked. */
export async function isBreached(password: string): Promise<boolean> {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password)));
    const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return false;
    const suffix = hex.slice(5);
    return (await r.text()).split('\n').some((line) => {
      const [s, n] = line.trim().split(':');
      return s === suffix && Number(n) > 0;
    });
  } catch {
    return false;
  }
}

// ── image preparation before upload: resize + re-encode (this also drops EXIF/GPS)
const MAX_EDGE: Record<string, number> = { attachment: 2560, avatar: 512, banner: 1600, icon: 512, emoji: 128 };

export async function prepareImage(file: File, kind: string): Promise<{ file: File; width?: number; height?: number }> {
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) {
    // GIFs keep their animation; just read the size
    if (file.type === 'image/gif') {
      try {
        const bmp = await createImageBitmap(file);
        const r = { file, width: bmp.width, height: bmp.height };
        bmp.close();
        return r;
      } catch {
        return { file };
      }
    }
    return { file };
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const max = MAX_EDGE[kind] ?? 2560;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: kind === 'attachment' ? 0.9 : 0.92 });
    // keep the original when re-encoding would not help (already small and same size)
    if (blob.size >= file.size && scale === 1 && file.type === 'image/webp') return { file, width: w, height: h };
    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return { file: new File([blob], name, { type: 'image/webp' }), width: w, height: h };
  } catch {
    return { file };
  }
}
