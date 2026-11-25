// S12 Go Live picker · S13 stream viewer (focus, fullscreen, zoom/pan) · per-user volume popover · video grid.
import { Maximize2, Minimize2, MicOff, MonitorUp, RotateCcw, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { Tag } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Switch';
import { cn } from '../../ui/cn';
import { setPrefs, usePrefs } from '../prefs';
import { useStore } from '../store';
import { setUserVolume, startStream, stopWatching, STREAM_PRESETS, useMedia, watchStream } from '../voice';

interface Source { id: string; name: string; thumbnail: string; icon: string | null }

export function GoLivePicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [sources, setSources] = useState<Source[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = usePrefs();
  useEffect(() => {
    let live = true;
    const load = () => window.mncord?.capture.listSources().then((s) => live && setSources(s));
    void load();
    const id = setInterval(load, 3000); // thumbnails refresh
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  const shown = sources.filter((s) => s.id.startsWith(tab));
  const go = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      await startStream(sel);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('live.goLive')} closeLabel={t('common.close')} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!sel} icon={<MonitorUp className="size-4" />} onClick={() => void go()}>{t('live.goLive')}</Button></>}>
      <div className="mb-3 flex gap-2" role="tablist">
        {(['screen', 'window'] as const).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={cn('rounded-xs px-3 py-1 font-medium', tab === x ? 'bg-surface-selected text-text' : 'text-muted hover:text-text')}>{x === 'screen' ? t('live.screens') : t('live.windows')}</button>
        ))}
      </div>
      <div className="grid max-h-[40vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {shown.map((s) => (
          <button key={s.id} type="button" aria-pressed={sel === s.id} onClick={() => setSel(s.id)} onDoubleClick={() => { setSel(s.id); void go(); }}
            className={cn('flex flex-col gap-1 rounded-md border-2 p-1.5 text-start', sel === s.id ? 'border-accent bg-mention' : 'border-transparent bg-surface hover:bg-surface-hover')}>
            <img src={s.thumbnail} alt="" className="aspect-video w-full rounded-sm bg-black object-contain" />
            <span className="flex items-center gap-1.5 truncate text-xs">{s.icon && <img src={s.icon} alt="" className="size-4" />}<span className="truncate" dir="auto">{s.name}</span></span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-2xs font-bold uppercase tracking-wide text-muted">{t('live.quality')}</span>
          <select value={p.streamQuality} onChange={(e) => setPrefs({ streamQuality: e.target.value as keyof typeof STREAM_PRESETS })} className="h-10 rounded-sm border border-border-input bg-surface-input px-3 text-text">
            {Object.entries(STREAM_PRESETS).map(([k, v]) => <option key={k} value={k}>{`${v.height}p · ${v.fps} fps`}</option>)}
          </select>
        </label>
        <div className="flex items-end pb-2"><Switch label={t('live.audio')} checked={p.streamAudio} onCheckedChange={(v) => setPrefs({ streamAudio: v })} /></div>
      </div>
      <p className="mt-3 text-xs text-faint">{t('live.hq')}</p>
    </Modal>
  );
}

function Video({ track, mirror, contain }: { track: MediaStreamTrack; mirror?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = new MediaStream([track]);
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={cn('size-full bg-black', contain ? 'object-contain' : 'object-cover', mirror && '-scale-x-100')} />;
}

/** Fullscreen-capable stream view with wheel zoom and drag pan. */
function StreamView({ track, name, onClose }: { track: MediaStreamTrack; name: string; onClose: () => void }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return (
    <div ref={box} className="group relative size-full overflow-hidden rounded-lg bg-black"
      onWheel={(e) => setZ((v) => ({ ...v, s: Math.min(6, Math.max(1, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) }))}
      onMouseDown={(e) => (drag.current = { x: e.clientX - z.x, y: e.clientY - z.y })}
      onMouseMove={(e) => drag.current && z.s > 1 && setZ((v) => ({ ...v, x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y }))}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}>
      <div className="size-full" style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`, cursor: z.s > 1 ? 'grab' : 'default' }}>
        <Video track={track} contain />
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
        <Tag tone="live">{t('live.live')}</Tag>
        <span className="font-semibold text-white">{name}</span>
        <span className="ms-auto text-xs text-white/70">{t('live.zoomHint')}</span>
        {z.s > 1 && <button type="button" aria-label={t('live.resetZoom')} onClick={() => setZ({ s: 1, x: 0, y: 0 })} className="text-white/80 hover:text-white"><RotateCcw className="size-5" /></button>}
        <button type="button" aria-label={fs ? t('live.exitFullscreen') : t('live.fullscreen')} onClick={() => (fs ? void document.exitFullscreen() : void box.current?.requestFullscreen())} className="text-white/80 hover:text-white">
          {fs ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
        </button>
        <button type="button" aria-label={t('common.close')} onClick={onClose} className="text-white/80 hover:text-white"><X className="size-5" /></button>
      </div>
    </div>
  );
}

export function VolumePopover({ userId, x, y, onClose }: { userId: string; x: number; y: number; onClose: () => void }) {
  const { t } = useTranslation();
  const vol = usePrefs((p) => p.userVolumes[userId] ?? 1);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) && onClose();
    setTimeout(() => {
      addEventListener('mousedown', close);
      addEventListener('keydown', close);
    });
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label={t('live.volume')} className="anim-pop fixed z-50 w-64 rounded-md bg-popover p-3 shadow-pop" style={{ left: Math.min(x, innerWidth - 272), top: Math.min(y, innerHeight - 100) }}>
      <Slider label={t('live.volume')} value={Math.round(vol * 100)} min={0} max={400} step={5} format={(v) => `${v}%`} onValueChange={(v) => setUserVolume(userId, v / 100)} />
    </div>
  );
}

/** Voice/call grid: avatars, cameras and screen shares. Click a stream to focus it. */
export function MediaGrid({ users }: { users: { userId: string; selfMute: boolean; selfStream?: boolean }[] }) {
  const { t } = useTranslation();
  const tiles = useMedia((s) => s.tiles);
  const available = useMedia((s) => s.available);
  const names = useStore((s) => s.names);
  const speaking = useStore((s) => s.speaking);
  const me = useStore((s) => s.me);
  const [focus, setFocus] = useState<string | null>(null);
  const [vol, setVol] = useState<{ userId: string; x: number; y: number } | null>(null);
  const focused = focus ? tiles[focus]?.screen : undefined;
  if (focused && focus) return <div className="min-h-0 flex-1 p-4"><StreamView track={focused} name={names[focus] ?? '…'} onClose={() => { if (focus !== me?.id) void stopWatching(focus); setFocus(null); }} /></div>;
  const cells: { key: string; userId: string; kind: 'screen' | 'camera' | 'avatar' | 'offer'; track?: MediaStreamTrack; muted: boolean }[] = [];
  for (const u of users) {
    const tl = tiles[u.userId];
    if (tl?.screen) cells.push({ key: `${u.userId}-s`, userId: u.userId, kind: 'screen', track: tl.screen, muted: u.selfMute });
    // someone is live but we're not pulling their stream yet (saves bandwidth until you choose to watch)
    else if (available[u.userId]?.includes('screen')) cells.push({ key: `${u.userId}-s`, userId: u.userId, kind: 'offer', muted: u.selfMute });
    cells.push({ key: `${u.userId}-c`, userId: u.userId, kind: tl?.camera ? 'camera' : 'avatar', track: tl?.camera, muted: u.selfMute });
  }
  return (
    <div className="grid flex-1 content-center gap-3 overflow-y-auto p-6 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
      {cells.map((c) => {
        const self = c.userId === me?.id;
        const name = names[c.userId] ?? '…';
        return (
          <div key={c.key}
            onContextMenu={(e) => { if (!self) { e.preventDefault(); setVol({ userId: c.userId, x: e.clientX, y: e.clientY }); } }}
            className={cn('relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-surface-raised transition-shadow', speaking[c.userId] && (c.kind === 'camera' || c.kind === 'avatar') && (self ? 'ring-2 ring-accent' : 'ring-2 ring-online'))}>
            {c.kind === 'avatar' || c.kind === 'offer' ? <Avatar name={name} size={72} /> : <Video track={c.track!} mirror={self && c.kind === 'camera'} contain={c.kind === 'screen'} />}
            {c.kind === 'offer' && (
              <button type="button" onClick={() => void watchStream(c.userId).then(() => setFocus(c.userId))} className="absolute inset-0 grid place-items-center bg-black/50 transition hover:bg-black/60">
                <span className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-on-accent">{t('live.watch')}</span>
              </button>
            )}
            {c.kind === 'screen' && (
              <button type="button" onClick={() => setFocus(c.userId)} className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition hover:bg-black/40 hover:opacity-100">
                <span className="rounded-sm bg-black/70 px-4 py-2 text-sm font-semibold text-white">{t('live.watch')}</span>
              </button>
            )}
            <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded-xs bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white">
              {c.muted && <MicOff aria-hidden className="size-3 text-danger" />}
              {(c.kind === 'screen' || c.kind === 'offer') && <Tag tone="live">{t('live.live')}</Tag>}
              {name}
            </span>
            {!self && (c.kind === 'camera' || c.kind === 'avatar') && (
              <button type="button" aria-label={t('live.volume')} onClick={(e) => setVol({ userId: c.userId, x: e.clientX, y: e.clientY })} className="absolute end-2 top-2 rounded-xs bg-black/50 p-1 text-white opacity-0 hover:bg-black/70 [div:hover>&]:opacity-100"><Volume2 className="size-4" /></button>
            )}
          </div>
        );
      })}
      {vol && <VolumePopover userId={vol.userId} x={vol.x} y={vol.y} onClose={() => setVol(null)} />}
    </div>
  );
}
