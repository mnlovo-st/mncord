// Crop + zoom before saving an avatar or banner (like Discord). Drag to move, slider or wheel to zoom.
// Animated GIFs stay animated: every frame is decoded (WebCodecs ImageDecoder), cropped and re-encoded.
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { ImageIcon, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { cn } from './cn';

export interface CropLabels { title: string; apply: string; cancel: string; zoom: string; working: string; hint: string; close: string }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type Decoder = {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(o: { frameIndex: number }): Promise<{ image: VideoFrame & { duration: number | null } }>;
  close(): void;
};
declare const ImageDecoder: { new (o: { data: ArrayBuffer; type: string }): Decoder } | undefined;

export function ImageCropper({ file, shape, labels, onDone, onCancel }: {
  file: File;
  shape: 'circle' | 'banner';
  labels: CropLabels;
  onDone: (f: File) => void;
  onCancel: () => void;
}) {
  const frameW = shape === 'circle' ? 300 : 480;
  const frameH = shape === 'circle' ? 300 : 192;
  const [url] = useState(() => URL.createObjectURL(file));
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const base = img ? Math.max(frameW / img.w, frameH / img.h) : 1;
  const scale = base * zoom;
  const dispW = img ? img.w * scale : 0;
  const dispH = img ? img.h * scale : 0;
  const fit = (x: number, y: number) => ({ x: clamp(x, frameW - dispW, 0), y: clamp(y, frameH - dispH, 0) });

  // keep the picture centred when it loads and covering the frame while zooming
  useEffect(() => {
    if (img) setPos({ x: (frameW - img.w * base) / 2, y: (frameH - img.h * base) / 2 });
  }, [img]); // eslint-disable-line react-hooks/exhaustive-deps
  const setZoomAround = (z: number) => {
    const nz = clamp(z, 1, 5);
    if (!img) return setZoom(nz);
    const cx = frameW / 2, cy = frameH / 2;
    const k = nz / zoom;
    const nx = cx - (cx - pos.x) * k;
    const ny = cy - (cy - pos.y) * k;
    setZoom(nz);
    const w = img.w * base * nz, h = img.h * base * nz;
    setPos({ x: clamp(nx, frameW - w, 0), y: clamp(ny, frameH - h, 0) });
  };

  const crop = () => ({ sx: -pos.x / scale, sy: -pos.y / scale, sw: frameW / scale, sh: frameH / scale });

  const apply = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const c = crop();
      const isGif = file.type === 'image/gif';
      if (isGif && typeof ImageDecoder !== 'undefined') {
        const out = await cropGif(file, c, shape === 'circle' ? [256, 256] : [600, 240]);
        if (out) return onDone(out);
      }
      if (isGif) return onDone(file); // no decoder: keep the animation, skip the crop
      const [ow, oh] = shape === 'circle' ? [512, 512] : [1200, 480];
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = new OffscreenCanvas(ow, oh);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, c.sx, c.sy, c.sw, c.sh, 0, 0, ow, oh);
      bmp.close();
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });
      onDone(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onCancel()} title={labels.title} closeLabel={labels.close} size="md"
      footer={<><Button variant="ghost" onClick={onCancel} disabled={busy}>{labels.cancel}</Button><Button loading={busy} onClick={() => void apply()}>{busy ? labels.working : labels.apply}</Button></>}>
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative cursor-grab touch-none select-none overflow-hidden rounded-md bg-black active:cursor-grabbing"
          style={{ width: frameW, height: frameH }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
          }}
          onPointerMove={(e) => drag.current && setPos(fit(drag.current.px + e.clientX - drag.current.x, drag.current.py + e.clientY - drag.current.y))}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => setZoomAround(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        >
          <img src={url} alt="" draggable={false} onLoad={(e) => setImg({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="pointer-events-none absolute max-w-none" style={{ left: pos.x, top: pos.y, width: dispW || undefined, height: dispH || undefined }} />
          {/* everything outside the final shape is dimmed */}
          <div aria-hidden className={cn('pointer-events-none absolute inset-0', shape === 'circle' ? 'rounded-full' : 'rounded-md')} style={{ boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)', inset: shape === 'circle' ? 0 : 0 }} />
          <div aria-hidden className={cn('pointer-events-none absolute inset-0 border-2 border-white/80', shape === 'circle' ? 'rounded-full' : 'rounded-md')} />
          {!img && <ImageIcon className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white/40" />}
        </div>
        <div className="flex w-full max-w-[360px] items-center gap-3">
          <button type="button" aria-label={labels.zoom} onClick={() => setZoomAround(zoom / 1.2)} className="text-muted hover:text-text"><ZoomOut className="size-5" /></button>
          <input type="range" min={1} max={5} step={0.01} value={zoom} aria-label={labels.zoom} onChange={(e) => setZoomAround(Number(e.target.value))} className="flex-1 accent-[var(--c-accent)]" />
          <button type="button" aria-label={labels.zoom} onClick={() => setZoomAround(zoom * 1.2)} className="text-muted hover:text-text"><ZoomIn className="size-5" /></button>
        </div>
        <p className="text-xs text-faint">{labels.hint}</p>
      </div>
    </Modal>
  );
}

/** crop every frame of an animated GIF and encode a new GIF (kept under the 10 MB picture limit) */
async function cropGif(file: File, c: { sx: number; sy: number; sw: number; sh: number }, [ow, oh]: [number, number]): Promise<File | null> {
  try {
    const dec = new ImageDecoder!({ data: await file.arrayBuffer(), type: 'image/gif' });
    await dec.tracks.ready;
    const count = Math.min(dec.tracks.selectedTrack?.frameCount ?? 1, 400);
    const canvas = new OffscreenCanvas(ow, oh);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const gif = GIFEncoder();
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      ctx.clearRect(0, 0, ow, oh);
      ctx.drawImage(image as unknown as CanvasImageSource, c.sx, c.sy, c.sw, c.sh, 0, 0, ow, oh);
      const delay = Math.max(20, Math.round((image.duration ?? 100_000) / 1000));
      image.close();
      const { data } = ctx.getImageData(0, 0, ow, oh);
      const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(data, palette, 'rgba4444');
      gif.writeFrame(index, ow, oh, { palette, delay, transparent: true, dispose: 2 });
    }
    dec.close();
    gif.finish();
    const bytes = gif.bytes();
    if (bytes.byteLength > 10 * 1024 * 1024) return null;
    return new File([bytes as Uint8Array<ArrayBuffer>], file.name.replace(/\.[^.]+$/, '') + '.gif', { type: 'image/gif' });
  } catch (e) {
    console.warn('[crop] gif failed', e);
    return null;
  }
}
