import { Headphones, HeadphoneOff, Mic, MicOff, MonitorUp, PhoneOff, Settings, Signal, Sparkles, Video } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, type Status } from './Avatar';
import { Tag } from './Badge';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

function IconToggle({ label, active, danger, onClick, children }: { label: string; active?: boolean; danger?: boolean; onClick?: () => void; children: ReactNode }) {
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
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function UserPanel({ name, tag, status, muted, deafened, onMute, onDeafen, onSettings, labels, avatarSrc, onAvatarClick }: {
  avatarSrc?: string;
  onAvatarClick?: () => void;
  name: string;
  tag: string;
  status: Status;
  muted: boolean;
  deafened: boolean;
  onMute: () => void;
  onDeafen: () => void;
  onSettings?: () => void;
  labels: { mute: string; unmute: string; deafen: string; undeafen: string; settings: string; status: string };
}) {
  return (
    <div className="flex h-14 items-center gap-2 bg-bg-deep/60 px-2">
      <button type="button" onClick={onAvatarClick} className="flex min-w-0 flex-1 items-center gap-2 rounded-sm p-1 text-start hover:bg-surface-hover">
        <Avatar name={name} src={avatarSrc} size={32} status={status} statusLabel={labels.status} cutout="border-bg-deep" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-text">{name}</span>
          <span className="block truncate text-xs text-muted">{tag}</span>
        </span>
      </button>
      <IconToggle label={muted ? labels.unmute : labels.mute} active={muted} danger={muted} onClick={onMute}>
        {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
      </IconToggle>
      <IconToggle label={deafened ? labels.undeafen : labels.deafen} active={deafened} danger={deafened} onClick={onDeafen}>
        {deafened ? <HeadphoneOff className="size-5" /> : <Headphones className="size-5" />}
      </IconToggle>
      <IconToggle label={labels.settings} onClick={onSettings}><Settings className="size-5" /></IconToggle>
    </div>
  );
}

export function VoiceConnectedPanel({ channel, labels, onDisconnect, onNoise, onCamera, onScreen, camera, streaming }: {
  channel: string;
  onCamera?: () => void;
  onScreen?: () => void;
  camera?: boolean;
  streaming?: boolean;
  onDisconnect?: () => void;
  onNoise?: () => void;
  labels: { connected: string; disconnect: string; camera: string; screen: string; noise: string; ping: string };
}) {
  return (
    <div className="border-b border-border bg-bg-deep/60 px-2 py-2">
      <div className="flex items-center gap-2">
        <Tooltip content={labels.ping}><Signal aria-label={labels.ping} className="size-4 text-online" /></Tooltip>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold text-online">{labels.connected}</p>
          <p className="truncate text-xs text-muted">{channel}</p>
        </div>
        <IconToggle label={labels.noise} onClick={onNoise}><Sparkles className="size-5 text-accent-text" /></IconToggle>
        <IconToggle label={labels.disconnect} onClick={onDisconnect}><PhoneOff className="size-5" /></IconToggle>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={camera} onClick={onCamera} className={cn('flex h-8 items-center justify-center gap-1.5 rounded-sm text-sm', camera ? 'bg-text text-bg' : 'bg-surface-raised text-text hover:bg-surface-selected')}><Video className="size-4" />{labels.camera}</button>
        <button type="button" aria-pressed={streaming} onClick={onScreen} className={cn('flex h-8 items-center justify-center gap-1.5 rounded-sm text-sm', streaming ? 'bg-danger-solid text-on-danger' : 'bg-surface-raised text-text hover:bg-surface-selected')}><MonitorUp className="size-4" />{labels.screen}</button>
      </div>
    </div>
  );
}

export function VoiceUser({ name, speaking, muted, live, self }: { name: string; speaking?: boolean; muted?: boolean; live?: boolean; self?: boolean }) {
  return (
    <li className="flex h-7 items-center gap-2 rounded-sm px-1 text-sm text-muted hover:bg-surface-hover hover:text-text">
      <Avatar name={name} size={24} speaking={speaking} self={self} />
      <span className="truncate">{name}</span>
      <span className="ms-auto flex items-center gap-1">
        {muted && <MicOff aria-label="muted" className="size-3.5 text-danger-text" />}
        {live && <Tag tone="live">Live</Tag>}
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
