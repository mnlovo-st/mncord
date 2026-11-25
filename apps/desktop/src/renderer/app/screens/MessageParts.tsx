// Attachments (images, video, audio, files), the image lightbox and the external-link guard.
import type { Attachment } from '@mncord/shared';
import { Clock, Download, ExternalLink, FileText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { cn } from '../../ui/cn';

const useLink = create<{ url: string | null }>(() => ({ url: null }));
const useLightbox = create<{ att: Attachment | null }>(() => ({ att: null }));

/** Every external link goes through a confirmation that shows the real address. */
export const askOpenLink = (url: string) => useLink.setState({ url });

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);

export function Attachments({ items }: { items: Attachment[] }) {
  const { t } = useTranslation();
  const expired = items.filter((a) => a.expired || !a.url);
  const live = items.filter((a) => !a.expired && a.url) as (Attachment & { url: string })[];
  const images = live.filter((a) => a.contentType.startsWith('image/'));
  const others = live.filter((a) => !a.contentType.startsWith('image/'));
  return (
    <div className="mt-1 flex flex-col gap-1">
      {expired.map((a) => (
        <div key={a.id} className="flex max-w-[420px] items-center gap-3 rounded-md border border-dashed border-border bg-surface-raised px-3 py-2 text-sm text-muted">
          <Clock aria-hidden className="size-4 shrink-0 text-faint" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-text" dir="auto">{a.filename}</span>
            <span className="text-xs text-faint">{t('msg.expired')}</span>
          </span>
        </div>
      ))}
      {images.length > 0 && (
        <div className={cn('grid max-w-[520px] gap-1', images.length === 1 ? 'grid-cols-1' : images.length === 2 || images.length === 4 ? 'grid-cols-2' : 'grid-cols-3')}>
          {images.map((a) => <ImageAtt key={a.id} a={a} single={images.length === 1} />)}
        </div>
      )}
      {others.map((a) =>
        a.contentType.startsWith('video/') ? (
          <video key={a.id} src={a.url} controls preload="metadata" className="max-h-[360px] max-w-[520px] rounded-md bg-black" />
        ) : a.contentType.startsWith('audio/') ? (
          <div key={a.id} className="flex max-w-[420px] flex-col gap-2 rounded-md border border-border bg-surface p-3">
            <span className="truncate text-sm font-medium text-link" dir="auto">{a.filename}</span>
            <audio src={a.url} controls preload="metadata" className="w-full" />
          </div>
        ) : (
          <div key={a.id} className="flex max-w-[420px] items-center gap-3 rounded-md border border-border bg-surface p-3">
            <FileText aria-hidden className="size-9 shrink-0 text-link" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-link" dir="auto" title={a.filename}>{a.filename}</p>
              <p className="text-xs text-faint">{fmtSize(a.size)}</p>
            </div>
            <a href={`${a.url}&download=1`} download={a.filename} aria-label={t('msg.download')} className="grid size-8 place-items-center rounded-sm text-muted hover:bg-surface-hover hover:text-text">
              <Download className="size-5" />
            </a>
          </div>
        ),
      )}
    </div>
  );
}

function ImageAtt({ a, single }: { a: Attachment; single: boolean }) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(!a.spoiler);
  const ratio = a.width && a.height ? a.width / a.height : 16 / 9;
  return (
    <button
      type="button"
      onClick={() => (revealed ? useLightbox.setState({ att: a }) : setRevealed(true))}
      aria-label={a.filename || t('msg.image')}
      className={cn('relative overflow-hidden rounded-md bg-surface-raised', single ? 'max-h-[350px] w-fit' : 'aspect-square')}
      style={single ? { aspectRatio: String(ratio), width: Math.min(400, (a.width ?? 400) as number), maxWidth: '100%' } : undefined}
    >
      <img src={a.url ?? undefined} alt={a.filename} loading="lazy" draggable={false} className={cn('size-full object-cover transition-[filter]', !revealed && 'blur-2xl')} />
      {!revealed && <span className="absolute inset-0 grid place-items-center"><span className="rounded-full bg-black/70 px-3 py-1 text-xs font-bold uppercase text-white">SPOILER</span></span>}
    </button>
  );
}

export function Lightbox() {
  const att = useLightbox((s) => s.att);
  useEffect(() => {
    if (!att) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && useLightbox.setState({ att: null });
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [att]);
  if (!att) return null;
  return (
    <div role="dialog" aria-label={att.filename} className="anim-fade fixed inset-0 z-50 grid place-items-center bg-black/85 p-10" onClick={() => useLightbox.setState({ att: null })}>
      <img src={att.url ?? undefined} alt={att.filename} className="anim-pop max-h-full max-w-full rounded-md object-contain" onClick={(e) => e.stopPropagation()} />
      <div className="absolute bottom-6 flex items-center gap-4 text-sm">
        <a href={`${att.url}&download=1`} download={att.filename} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-white/80 hover:text-white"><Download className="size-4" />{att.filename}</a>
      </div>
      <button type="button" aria-label="Close" className="absolute end-6 top-6 text-white/80 hover:text-white"><X className="size-7" /></button>
    </div>
  );
}

export function LinkGuard() {
  const { t } = useTranslation();
  const url = useLink((s) => s.url);
  if (!url) return null;
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }
  const go = () => {
    window.open(url, '_blank', 'noopener,noreferrer'); // main process opens https links in the system browser
    useLink.setState({ url: null });
  };
  return (
    <Modal open onOpenChange={(o) => !o && useLink.setState({ url: null })} title={t('msg.openLink')} description={t('msg.openLinkSub')} closeLabel={t('common.close')}
      footer={<><Button variant="ghost" onClick={() => useLink.setState({ url: null })}>{t('common.cancel')}</Button><Button icon={<ExternalLink className="size-4" />} onClick={go}>{t('msg.openLinkGo')}</Button></>}>
      <p className="break-all rounded-sm bg-surface-input p-3 font-mono text-sm" dir="ltr"><strong className="text-text">{host}</strong><span className="text-faint">{url.slice(url.indexOf(host) + host.length)}</span></p>
    </Modal>
  );
}
