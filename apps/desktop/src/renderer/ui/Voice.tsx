import { ChevronDown, Headphones, HeadphoneOff, Mic, MicOff, MonitorUp, PhoneOff, Settings, Signal, Sparkles, Video, VideoOff } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Avatar, type Status } from './Avatar';
import { Tag } from './Badge';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

function IconToggle({ label, active, danger, onClick, children, className }: { label: string; active?: boolean; danger?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'grid size-8 place-items-center rounded-sm transition-colors duration-(--motion-fast)',
          danger ? 'text-danger-text hover:bg-surface-hover' : 'text-muted hover:bg-surface-hover hover:text-text',
          className,
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** icon + small arrow, like Discord's mic / headphone buttons (arrow opens the device menu) */
function SplitToggle({ label, menuLabel, danger, onClick, onMenu, children }: { label: string; menuLabel: string; danger?: boolean; onClick: () => void; onMenu?: (el: HTMLElement) => void; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div className={cn('flex h-8 items-center rounded-sm transition-colors', danger ? 'text-danger-text' : 'text-muted')}>
      <Tooltip content={label}>
        <button type="button" aria-label={label} aria-pressed={danger} onClick={onClick} onContextMenu={(e) => { e.preventDefault(); if (ref.current) onMenu?.(ref.current); }} className={cn('grid h-8 w-7 place-items-center rounded-s-sm hover:bg-surface-hover', !danger && 'hover:text-text', !onMenu && 'rounded-e-sm')}>{children}</button>
      </Tooltip>
      {onMenu && (
        <Tooltip content={menuLabel}>
          <button ref={ref} type="button" aria-label={menuLabel} aria-haspopup="menu" onClick={() => ref.current && onMenu(ref.current)} className="-ms-0.5 grid h-8 w-3.5 place-items-center rounded-e-sm hover:bg-surface-hover hover:text-text"><ChevronDown className="size-3" strokeWidth={2.5} /></button>
        </Tooltip>
      )}
    </div>
  );
}

export function UserPanel({ name, nameNode, tag, status, muted, deafened, onMute, onDeafen, onSettings, labels, avatarSrc, decoration, onAvatarClick, onMicMenu, onOutputMenu, plate }: {
  avatarSrc?: string;
  decoration?: string | null;
  onAvatarClick?: (el: HTMLElement) => void;
  name: string;
  nameNode?: ReactNode;
  tag: string;
  status: Status;
  muted: boolean;
  deafened: boolean;
  onMute: () => void;
  onDeafen: () => void;
  onSettings?: () => void;
  onMicMenu?: (el: HTMLElement) => void;
  onOutputMenu?: (el: HTMLElement) => void;
  plate?: string;
  labels: { mute: string; unmute: string; deafen: string; undeafen: string; settings: string; status: string; inputOptions: string; outputOptions: string };
}) {
  return (
    <div className={cn('flex h-[52px] items-center gap-0.5 bg-bg-deep/70 ps-2 pe-1.5', plate)}>
      <button type="button" onClick={(e) => onAvatarClick?.(e.currentTarget)} className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 ps-0.5 pe-1 text-start hover:bg-surface-hover">
        <Avatar name={name} src={avatarSrc} size={32} status={status} statusLabel={labels.status} cutout="border-bg-deep" decoration={decoration} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-text">{nameNode ?? name}</span>
          <span className="block truncate text-xs text-muted">{tag}</span>
        </span>
      </button>
      <SplitToggle label={muted ? labels.unmute : labels.mute} menuLabel={labels.inputOptions} danger={muted} onClick={onMute} onMenu={onMicMenu}>
        {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
      </SplitToggle>
      <SplitToggle label={deafened ? labels.undeafen : labels.deafen} menuLabel={labels.outputOptions} danger={deafened} onClick={onDeafen} onMenu={onOutputMenu}>
        {deafened ? <HeadphoneOff className="size-5" /> : <Headphones className="size-5" />}
      </SplitToggle>
      <IconToggle label={labels.settings} onClick={onSettings} className="w-7 hover:[&>svg]:rotate-45 [&>svg]:transition-transform"><Settings className="size-5" /></IconToggle>
    </div>
  );
}

export function VoiceConnectedPanel({ channel, labels, onDisconnect, onNoise, onCamera, onScreen, onOpen, camera, streaming, noiseOn, ping, connecting }: {
  channel: string;
  onCamera?: () => void;
  onScreen?: () => void;
  onOpen?: () => void;
  camera?: boolean;
  streaming?: boolean;
  noiseOn?: boolean;
  ping?: number | null;
  connecting?: boolean;
  onDisconnect?: () => void;
  onNoise?: () => void;
  labels: { connected: string; disconnect: string; camera: string; cameraOff: string; screen: string; noise: string; ping: string };
}) {
  const tone = connecting ? 'text-warning' : ping == null || ping < 120 ? 'text-online' : ping < 250 ? 'text-warning' : 'text-danger';
  const btn = 'grid h-8 place-items-center rounded-md transition-colors';
  return (
    <div className="border-b border-border bg-bg-deep/70 px-2 pb-2 pt-1.5">
      <div className="flex items-center gap-1.5">
        <Tooltip content={labels.ping}><Signal aria-label={labels.ping} className={cn('size-4 shrink-0', tone)} /></Tooltip>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start leading-tight">
          <p className={cn('text-sm font-semibold', tone)}>{labels.connected}</p>
          <p className="truncate text-xs text-muted hover:text-text hover:underline">{channel}</p>
        </button>
        <IconToggle label={labels.noise} onClick={onNoise} active={noiseOn}><Sparkles className={cn('size-[18px]', noiseOn ? 'text-accent-text' : 'text-faint')} /></IconToggle>
        <IconToggle label={labels.disconnect} onClick={onDisconnect}><PhoneOff className="size-5" /></IconToggle>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <Tooltip content={camera ? labels.cameraOff : labels.camera}>
          <button type="button" aria-label={camera ? labels.cameraOff : labels.camera} aria-pressed={camera} onClick={onCamera} className={cn(btn, camera ? 'bg-text text-bg' : 'bg-surface-raised text-text hover:bg-surface-selected')}>{camera ? <Video className="size-5" /> : <VideoOff className="size-5" />}</button>
        </Tooltip>
        <Tooltip content={labels.screen}>
          <button type="button" aria-label={labels.screen} aria-pressed={streaming} onClick={onScreen} className={cn(btn, streaming ? 'bg-online text-on-chrome' : 'bg-surface-raised text-text hover:bg-surface-selected')}><MonitorUp className="size-5" /></button>
        </Tooltip>
      </div>
    </div>
  );
}

export function VoiceUser({ name, avatarSrc, decoration, speaking, muted, deafened, serverMuted, live, self, onClick }: { name: string; avatarSrc?: string; decoration?: string | null; speaking?: boolean; muted?: boolean; deafened?: boolean; serverMuted?: boolean; live?: boolean; self?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <li onClick={onClick} className="flex h-8 cursor-pointer items-center gap-2 rounded-sm ps-1 pe-1.5 text-sm text-muted hover:bg-surface-hover hover:text-text">
      <Avatar name={name} src={avatarSrc} size={24} speaking={speaking} self={self} decoration={decoration} />
      <span className={cn('truncate', speaking && 'text-text')}>{name}</span>
      <span className="ms-auto flex items-center gap-1">
        {live && <Tag tone="live">Live</Tag>}
        {muted && <MicOff aria-label="muted" className={cn('size-3.5', serverMuted ? 'text-danger-text' : 'text-faint')} />}
        {deafened && <HeadphoneOff aria-label="deafened" className="size-3.5 text-faint" />}
      </span>
    </li>
  );
}

export function VoiceTile({ name, speaking, muted, stream, quality, self, watchLabel = 'Watch stream' }: {
  name: string;
  speaking?: boolean;
  muted?: boolean;
  stream?: boolean;
  quality?: string;
  self?: boolean;
  watchLabel?: string;
}) {
  return (
    <div
      className={cn(
        'relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-surface-raised transition-shadow duration-(--motion-fast)',
        speaking && (self ? 'ring-2 ring-accent' : 'ring-2 ring-online'),
      )}
    >
      {stream ? (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#2b3a5c,transparent_60%),linear-gradient(135deg,#101828,#1d2a44)]">
          <div className="absolute inset-0 grid place-items-center">
            <button type="button" className="rounded-sm bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/80">{watchLabel}</button>
          </div>
          <div className="absolute start-2 top-2 flex gap-1"><Tag tone="live">Live</Tag>{quality && <Tag>{quality}</Tag>}</div>
        </div>
      ) : (
        <Avatar name={name} size={72} />
      )}
      <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded-xs bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white">
        {muted && <MicOff aria-label="muted" className="size-3 text-danger" />}
        {name}
      </span>
    </div>
  );
}
