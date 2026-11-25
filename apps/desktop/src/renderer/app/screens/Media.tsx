// S12 Go Live picker · S13 stream viewer (focus, fullscreen, pop-out, zoom/pan) · per-user volume · video grid.
import { AppWindow, HeadphoneOff, Maximize2, Minimize2, MicOff, Monitor, PictureInPicture2, RotateCcw, Settings2, Volume2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { Tag } from '../../ui/Badge';
import { Modal } from '../../ui/Modal';
import { Slider } from '../../ui/Slider';
import { cn } from '../../ui/cn';
import { avatarUrl } from '../api';
import { setPrefs, usePrefs } from '../prefs';
import { useStore } from '../store';
import { setUserVolume, startStream, stopWatching, useMedia, watchStream } from '../voice';
import { UserContextMenu } from './UserMenu';

interface Source { id: string; name: string; thumbnail: string; icon: string | null }

type Mode = 'gaming' | 'screenshare' | 'custom';
const MODES: Record<Exclude<Mode, 'custom'>, { res: 720 | 1080 | 1440; fps: 15 | 30 | 60 | 100 }> = {
  gaming: { res: 1440, fps: 60 },
  screenshare: { res: 1080, fps: 15 },
};

/** Discord-style picker: Applications / Entire Screen tabs, big previews, and a gear for quality. */
export function GoLivePicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'window' | 'screen'>('window');
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [gear, setGear] = useState(false);
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
  const go = async (id: string) => {
    setBusy(id);
    try {
      await startStream(id);
      onClose();
    } finally {
      setBusy(null);
    }
  };
  const setMode = (m: Mode) => setPrefs(m === 'custom' ? { streamMode: m } : { streamMode: m, streamRes: MODES[m].res, streamFps: MODES[m].fps });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('live.goLive')} closeLabel={t('common.close')} size="lg">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-bg-deep p-1" role="tablist">
        {(['window', 'screen'] as const).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
            className={cn('flex h-9 items-center justify-center gap-2 rounded-sm text-sm font-semibold transition-colors', tab === x ? 'bg-surface-selected text-text' : 'text-muted hover:text-text')}>
            {x === 'window' ? <AppWindow className="size-4" /> : <Monitor className="size-4" />}
            {x === 'window' ? t('live.apps') : t('live.entireScreen')}
          </button>
        ))}
      </div>
      <div className="grid max-h-[52vh] min-h-[220px] grid-cols-1 gap-4 overflow-y-auto pe-1 sm:grid-cols-2">
        {shown.length === 0 && <p className="col-span-full grid h-40 place-items-center text-muted">{t('live.noSources')}</p>}
        {shown.map((s) => (
          <div key={s.id} className="group flex flex-col gap-2">
            <button type="button" onClick={() => void go(s.id)} disabled={!!busy}
              className="relative overflow-hidden rounded-md border-2 border-transparent bg-black transition hover:border-accent focus-visible:border-accent">
              <img src={s.thumbnail} alt="" className="aspect-video w-full object-contain" />
              <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <span className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black shadow-pop">{busy === s.id ? '…' : t('live.shareScreen')}</span>
              </span>
            </button>
            <span className="flex items-center gap-2 truncate text-sm">{s.icon && <img src={s.icon} alt="" className="size-4" />}<span className="truncate" dir="auto">{s.name}</span></span>
          </div>
        ))}
      </div>
      <div className="relative mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-semibold">{t(`live.mode.${p.streamMode}`)}</p>
          <p className="text-sm text-muted">{p.streamRes}p · {p.streamFps}fps{!p.streamAudio ? ` · ${t('live.audioMuted')}` : ''}</p>
        </div>
        <button type="button" aria-label={t('live.quality')} aria-expanded={gear} onClick={() => setGear((g) => !g)} className={cn('grid size-10 place-items-center rounded-md', gear ? 'bg-surface-selected text-text' : 'bg-surface-raised text-muted hover:text-text')}>
          <Settings2 className="size-5" />
        </button>
        {gear && (
          <div className="anim-pop absolute bottom-12 end-0 z-10 w-72 rounded-md bg-popover p-2 text-sm shadow-pop">
            <p className="px-2 pb-1 pt-1 text-2xs font-bold uppercase tracking-wide text-faint">{t('live.streamMode')}</p>
            {(['gaming', 'screenshare', 'custom'] as Mode[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={p.streamMode === m} onClick={() => setMode(m)} className="flex w-full items-center justify-between gap-3 rounded-xs px-2 py-1.5 text-start hover:bg-surface-selected">
                <span>
                  <span className="block font-medium text-text">{t(`live.mode.${m}`)}</span>
                  {m !== 'custom' && <span className="block text-xs text-muted">{t(`live.mode.${m}Sub`)}</span>}
                </span>
                <span className={cn('size-4 shrink-0 rounded-full border-2', p.streamMode === m ? 'border-accent bg-accent shadow-[inset_0_0_0_3px_var(--c-popover)]' : 'border-border-input')} />
              </button>
            ))}
            <div className="my-1.5 h-px bg-border" />
            <p className="px-2 pb-1 text-2xs font-bold uppercase tracking-wide text-faint">{t('live.resolution')}</p>
            <div className="flex gap-1 px-2 pb-2">
              {([720, 1080, 1440] as const).map((r) => (
                <button key={r} type="button" onClick={() => setPrefs({ streamRes: r, streamMode: 'custom' })} className={cn('h-8 flex-1 rounded-sm font-semibold', p.streamRes === r ? 'bg-accent text-on-accent' : 'bg-surface-raised text-muted hover:text-text')}>{r}p</button>
              ))}
            </div>
            <p className="px-2 pb-1 text-2xs font-bold uppercase tracking-wide text-faint">{t('live.frameRate')}</p>
            <div className="flex gap-1 px-2 pb-2">
              {([15, 30, 60, 100] as const).map((f) => (
                <button key={f} type="button" onClick={() => setPrefs({ streamFps: f, streamMode: 'custom' })} className={cn('h-8 flex-1 rounded-sm font-semibold', p.streamFps === f ? 'bg-accent text-on-accent' : 'bg-surface-raised text-muted hover:text-text')}>{f}</button>
              ))}
            </div>
            <div className="my-1.5 h-px bg-border" />
            <label className="flex cursor-pointer items-center justify-between rounded-xs px-2 py-1.5 hover:bg-surface-selected">
              <span className="font-medium text-text">{t('live.muteAudio')}</span>
              <input type="checkbox" checked={!p.streamAudio} onChange={(e) => setPrefs({ streamAudio: !e.target.checked })} className="size-4 accent-[var(--c-accent)]" />
            </label>
            <p className="px-2 pt-1 text-xs text-faint">{t('live.hq')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Video({ track, mirror, contain }: { track: MediaStreamTrack; mirror?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = new MediaStream([track]);
  }, [track]);
  useEffect(() => () => {
    if (document.pictureInPictureElement && document.pictureInPictureElement === ref.current) void document.exitPictureInPicture().catch(() => {});
  }, []);
  return <video ref={ref} autoPlay playsInline muted className={cn('size-full bg-black', contain ? 'object-contain' : 'object-cover', mirror && '-scale-x-100')} />;
}

/** Fullscreen-capable stream view with wheel zoom, drag pan and pop-out (picture in picture). */
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
      <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
        <Tag tone="live">{t('live.live')}</Tag>
        <span className="font-semibold text-white">{name}</span>
        <span className="ms-auto text-xs text-white/70">{t('live.zoomHint')}</span>
        {z.s > 1 && <button type="button" aria-label={t('live.resetZoom')} onClick={() => setZ({ s: 1, x: 0, y: 0 })} className="text-white/80 hover:text-white"><RotateCcw className="size-5" /></button>}
        <button type="button" aria-label={t('live.popOut')} title={t('live.popOut')} onClick={() => void box.current?.querySelector('video')?.requestPictureInPicture().catch(() => {})} className="text-white/80 hover:text-white"><PictureInPicture2 className="size-5" /></button>
        <button type="button" aria-label={fs ? t('live.exitFullscreen') : t('live.fullscreen')} title={fs ? t('live.exitFullscreen') : t('live.fullscreen')} onClick={() => (fs ? void document.exitFullscreen() : void box.current?.requestFullscreen())} className="text-white/80 hover:text-white">
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

/** Stable, pleasant tile colour per person (Discord paints tiles with the profile colour). */
function tileColor(userId: string, accent?: number | null) {
  if (accent != null) return `#${accent.toString(16).padStart(6, '0')}`;
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 32% 26%)`;
}

/** Discord-like tiling: pick the column count that gives the biggest 16:9 tiles that all fit on screen. */
function useTileLayout(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gap = 8;
  let best = { cols: 1, w: 0 };
  for (let cols = 1; cols <= Math.max(1, count); cols++) {
    const rows = Math.ceil(count / cols);
    const w = Math.min((box.w - gap * (cols - 1)) / cols, ((box.h - gap * (rows - 1)) / rows) * (16 / 9));
    if (w > best.w) best = { cols, w };
  }
  return { ref, tileW: Math.max(160, Math.floor(best.w)), cols: best.cols, gap };
}

type GridUser = { userId: string; selfMute: boolean; selfDeaf?: boolean; serverMute?: boolean; serverDeaf?: boolean; selfStream?: boolean };

/** Voice/call grid: avatars, cameras and screen shares. Click a stream to focus it; right-click anyone. */
export function MediaGrid({ users, guildId }: { users: GridUser[]; guildId?: string | null }) {
  const tiles = useMedia((s) => s.tiles);
  const available = useMedia((s) => s.available);
  const names = useStore((s) => s.names);
  const people = useStore((s) => s.users);
  const speaking = useStore((s) => s.speaking);
  const me = useStore((s) => s.me);
  const showNonVideo = usePrefs((p) => p.showNonVideo);
  const showOwnCamera = usePrefs((p) => p.showOwnCamera);
  const [focus, setFocus] = useState<string | null>(null);
  const [vol, setVol] = useState<{ userId: string; x: number; y: number } | null>(null);
  const focused = focus ? tiles[focus]?.screen : undefined;
  if (focused && focus) return <div className="min-h-0 flex-1 p-4"><StreamView track={focused} name={names[focus] ?? '…'} onClose={() => { if (focus !== me?.id) void stopWatching(focus); setFocus(null); }} /></div>;

  let cells: Cell[] = [];
  for (const u of users) {
    const tl = tiles[u.userId];
    if (tl?.screen) cells.push({ key: `${u.userId}-s`, userId: u.userId, kind: 'screen', track: tl.screen, u });
    // someone is live but we're not pulling their stream yet (saves bandwidth until you choose to watch)
    else if (available[u.userId]?.includes('screen')) cells.push({ key: `${u.userId}-s`, userId: u.userId, kind: 'offer', u });
    const cam = tl?.camera && !(u.userId === me?.id && !showOwnCamera) ? tl.camera : undefined;
    cells.push({ key: `${u.userId}-c`, userId: u.userId, kind: cam ? 'camera' : 'avatar', track: cam, u });
  }
  if (!showNonVideo && cells.some((c) => c.kind !== 'avatar')) cells = cells.filter((c) => c.kind !== 'avatar');
  return <TileGrid cells={cells} render={(c) => {
        const self = c.userId === me?.id;
        const name = names[c.userId] ?? '…';
        const person = people[c.userId] as ((typeof people)[string] & { accentColor?: number | null }) | undefined;
        const isSpeaking = !!speaking[c.userId] && (c.kind === 'camera' || c.kind === 'avatar');
        const muted = c.u.selfMute || c.u.serverMute;
        const deaf = c.u.selfDeaf || c.u.serverDeaf;
        const color = tileColor(c.userId, person?.accentColor);
        return { self, name, person, isSpeaking, muted, deaf, color };
      }} extra={vol && <VolumePopover userId={vol.userId} x={vol.x} y={vol.y} onClose={() => setVol(null)} />}
    guildId={guildId} onFocus={setFocus} onVolume={setVol} />;
}

type Cell = { key: string; userId: string; kind: 'screen' | 'camera' | 'avatar' | 'offer'; track?: MediaStreamTrack; u: GridUser };
type CellView = { self: boolean; name: string; person?: { avatarKey: string | null; style?: { decoration?: string | null } | null }; isSpeaking: boolean; muted?: boolean; deaf?: boolean; color: string };

function TileGrid({ cells, render, extra, guildId, onFocus, onVolume }: { cells: Cell[]; render: (c: Cell) => CellView; extra: React.ReactNode; guildId?: string | null; onFocus: (id: string) => void; onVolume: (v: { userId: string; x: number; y: number }) => void }) {
  const { t } = useTranslation();
  const { ref, tileW, cols, gap } = useTileLayout(cells.length);
  const avatarSize = Math.round(Math.min(120, Math.max(56, tileW * 0.19)));
  return (
    <div ref={ref} className="relative min-h-0 flex-1 overflow-y-auto px-6 py-3">
      <div className="mx-auto flex min-h-full flex-wrap content-center justify-center" style={{ gap, maxWidth: cols * tileW + (cols - 1) * gap }}>
      {cells.map((c) => {
        const { self, name, person, isSpeaking, muted, deaf, color } = render(c);
        return (
          <UserContextMenu key={c.key} userId={c.userId} guildId={guildId}>
            <div
              style={{ width: tileW, background: c.kind === 'avatar' || c.kind === 'offer' ? `linear-gradient(180deg, ${color} 0%, color-mix(in srgb, ${color} 55%, #000) 100%)` : '#000' }}
              className={cn('group relative grid aspect-video shrink-0 place-items-center overflow-hidden rounded-lg transition-shadow duration-150', isSpeaking && 'shadow-[0_0_0_2px_var(--c-online),inset_0_0_0_2px_var(--c-online)]')}
>
              {c.kind === 'avatar' || c.kind === 'offer' ? (
                <Avatar name={name} src={avatarUrl(person?.avatarKey)} size={avatarSize} speaking={isSpeaking} self={self} decoration={person?.style?.decoration} />
              ) : (
                <Video track={c.track!} mirror={self && c.kind === 'camera'} contain={c.kind === 'screen'} />
              )}
              {c.kind === 'offer' && (
                <button type="button" onClick={() => void watchStream(c.userId).then(() => onFocus(c.userId))} className="absolute inset-0 grid place-items-center bg-black/45 transition hover:bg-black/55">
                  <span className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-pop">{t('live.watch')}</span>
                </button>
              )}
              {c.kind === 'screen' && (
                <button type="button" onClick={() => onFocus(c.userId)} className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition hover:bg-black/40 hover:opacity-100">
                  <span className="rounded-md bg-black/70 px-4 py-2 text-sm font-semibold text-white">{t('live.watch')}</span>
                </button>
              )}
              <span className="absolute bottom-2 start-2 flex max-w-[80%] items-center gap-1.5 rounded-md bg-black/65 px-2 py-1 text-sm font-semibold text-white backdrop-blur-sm">
                {(c.kind === 'screen' || c.kind === 'offer') && <Tag tone="live">{t('live.live')}</Tag>}
                <span className="truncate">{name}</span>
              </span>
              {(muted || deaf) && (c.kind === 'avatar' || c.kind === 'camera') && (
                <span className="absolute bottom-2 end-2 flex items-center gap-1 rounded-full bg-black/65 p-1.5 text-white">
                  {muted && <MicOff aria-label={t('voice.mute')} className={cn('size-4', c.u.serverMute && 'text-danger')} />}
                  {deaf && <HeadphoneOff aria-label={t('voice.deafen')} className={cn('size-4', c.u.serverDeaf && 'text-danger')} />}
                </span>
              )}
              {!self && (c.kind === 'camera' || c.kind === 'avatar') && (
                <button type="button" aria-label={t('live.volume')} onClick={(e) => onVolume({ userId: c.userId, x: e.clientX, y: e.clientY })} className="absolute end-2 top-2 rounded-md bg-black/55 p-1.5 text-white opacity-0 transition hover:bg-black/75 group-hover:opacity-100"><Volume2 className="size-4" /></button>
              )}
            </div>
          </UserContextMenu>
        );
      })}
      </div>
      {extra}
    </div>
  );
}
