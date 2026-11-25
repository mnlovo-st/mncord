// S11 voice channel: grid (avatars, cameras, streams) + Discord-style control bar.
import type { Channel, Guild } from '@mncord/shared';
import { ChevronDown, Ellipsis, Headphones, HeadphoneOff, Maximize2, Mic, MicOff, Minimize2, MonitorUp, MonitorX, PhoneOff, Sparkles, UserPlus, Video, VideoOff, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { errorText } from '../i18n';
import { setPrefs, usePrefs } from '../prefs';
import { useStore } from '../store';
import { joinVoice, leaveVoice, setDeafened, setMuted, setSuppression, stopStream, toggleCamera, useVoice } from '../voice';
import { MicMenu, OutputMenu, Popover } from './AudioMenus';
import { GoLivePicker, MediaGrid } from './Media';

export function VoiceControls({ compact, fullscreen, onFullscreen }: { compact?: boolean; fullscreen?: boolean; onFullscreen?: () => void }) {
  const { t } = useTranslation();
  const v = useVoice();
  const p = usePrefs();
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<{ kind: 'mic' | 'out' | 'more'; el: HTMLElement } | null>(null);
  const toggleMenu = (kind: 'mic' | 'out' | 'more', el: HTMLElement) => setMenu(menu?.kind === kind ? null : { kind, el });
  const micOff = v.muted || v.serverMuted;
  const deaf = v.deafened || v.serverDeafened;
  return (
    <div className={cn('flex items-center gap-2', compact && 'scale-90')}>
      <Group>
        <Ctl label={micOff ? t('voice.unmute') : t('voice.mute')} danger={micOff} onClick={() => void setMuted(!v.muted)}>{micOff ? <MicOff className="size-5" /> : <Mic className="size-5" />}</Ctl>
        <Chevron label={t('am.inputOptions')} onClick={(el) => toggleMenu('mic', el)} />
        <Ctl label={deaf ? t('voice.undeafen') : t('voice.deafen')} danger={deaf} onClick={() => void setDeafened(!v.deafened)}>{deaf ? <HeadphoneOff className="size-5" /> : <Headphones className="size-5" />}</Ctl>
        <Chevron label={t('am.outputOptions')} onClick={(el) => toggleMenu('out', el)} />
      </Group>
      <Group>
        <Ctl label={v.camera ? t('live.cameraOff') : t('live.camera')} active={v.camera} onClick={() => void toggleCamera()}>{v.camera ? <Video className="size-5" /> : <VideoOff className="size-5" />}</Ctl>
        <Ctl label={v.streaming ? t('live.stop') : t('live.goLive')} active={v.streaming} onClick={() => (v.streaming ? void stopStream() : setPicker(true))}>{v.streaming ? <MonitorX className="size-5" /> : <MonitorUp className="size-5" />}</Ctl>
        <Ctl label={`${t('voice.noise')}: ${t(`settings.sup.${v.suppression}`)}`} accent={v.suppression !== 'off'} onClick={() => void setSuppression(v.suppression === 'off' ? 'rnnoise' : 'off')}><Sparkles className="size-5" /></Ctl>
        <MoreBtn label={t('voice.more')} onClick={(el) => toggleMenu('more', el)} />
      </Group>
      <Tooltip content={t('voice.leave')}>
        <button type="button" aria-label={t('voice.leave')} onClick={() => void leaveVoice()} className="grid h-12 w-[72px] place-items-center rounded-xl bg-danger-solid text-on-danger transition hover:brightness-110 active:scale-95">
          <PhoneOff className="size-6" />
        </button>
      </Tooltip>
      {picker && <GoLivePicker onClose={() => setPicker(false)} />}
      {menu?.kind === 'mic' && <MicMenu anchor={menu.el} onClose={() => setMenu(null)} />}
      {menu?.kind === 'out' && <OutputMenu anchor={menu.el} onClose={() => setMenu(null)} />}
      {menu?.kind === 'more' && (
        <Popover anchor={menu.el} onClose={() => setMenu(null)} width={250}>
          <Check label={t('um.showNonVideo')} checked={p.showNonVideo} onChange={(on) => setPrefs({ showNonVideo: on })} />
          <Check label={t('um.showOwnCamera')} checked={p.showOwnCamera} onChange={(on) => setPrefs({ showOwnCamera: on })} />
          <div className="mx-1.5 my-1.5 h-px bg-border" />
          {onFullscreen && <button type="button" onClick={() => { setMenu(null); onFullscreen(); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-text hover:bg-surface-selected">{fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}{fullscreen ? t('live.exitFullscreen') : t('live.fullscreen')}</button>}
          <button type="button" onClick={() => { setMenu(null); dispatchEvent(new CustomEvent('mncord:settings', { detail: 'voice' })); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-text hover:bg-surface-selected">{t('am.voiceSettings')}</button>
        </Popover>
      )}
    </div>
  );
}

const Group = ({ children }: { children: ReactNode }) => <div className="flex items-center gap-0.5 rounded-xl bg-surface p-1 shadow-pop">{children}</div>;

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-text hover:bg-surface-selected">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--c-accent)]" />
    </label>
  );
}

function Chevron({ label, onClick }: { label: string; onClick: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <Tooltip content={label}>
      <button ref={ref} type="button" aria-label={label} aria-haspopup="menu" onClick={() => ref.current && onClick(ref.current)} className="grid h-11 w-5 place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-text"><ChevronDown className="size-4" /></button>
    </Tooltip>
  );
}
function MoreBtn({ label, onClick }: { label: string; onClick: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <Tooltip content={label}>
      <button ref={ref} type="button" aria-label={label} onClick={() => ref.current && onClick(ref.current)} className="grid size-11 place-items-center rounded-lg text-text hover:bg-surface-hover"><Ellipsis className="size-5" /></button>
    </Tooltip>
  );
}

function Ctl({ label, active, danger, accent, onClick, children }: { label: string; active?: boolean; danger?: boolean; accent?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip content={label}>
      <button type="button" aria-label={label} aria-pressed={active || danger} onClick={onClick}
        className={cn('grid size-11 place-items-center rounded-lg transition-colors active:scale-95',
          danger ? 'text-danger-text hover:bg-surface-hover' : active ? 'bg-text text-bg' : 'text-text hover:bg-surface-hover',
          accent && !active && 'text-accent-text')}>
        {children}
      </button>
    </Tooltip>
  );
}

export function VoiceRoom({ guild, channel }: { guild: Guild; channel: Channel }) {
  const { t } = useTranslation();
  const voice = useStore((s) => s.voice);
  const v = useVoice();
  const box = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFs = () => (document.fullscreenElement ? void document.exitFullscreen() : void box.current?.requestFullscreen());
  const inHere = v.channelId === channel.id;
  const users = Object.values(voice).filter((x) => x.channelId === channel.id);

  return (
    <div ref={box} className="flex min-h-0 flex-1 flex-col bg-black">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <Volume2 aria-hidden className="size-5 text-faint" />
        <h1 className="truncate font-semibold">{channel.name}</h1>
        <div className="ms-auto flex items-center gap-1">
          <Tooltip content={fs ? t('live.exitFullscreen') : t('live.fullscreen')}>
            <button type="button" aria-label={fs ? t('live.exitFullscreen') : t('live.fullscreen')} onClick={toggleFs} className="grid size-8 place-items-center rounded-sm text-muted hover:bg-surface-hover hover:text-text">{fs ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}</button>
          </Tooltip>
        </div>
      </header>
      {users.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <p className="font-display text-2xl font-bold">{channel.name}</p>
            <p className="mt-2 text-muted">{t('voice.empty')}</p>
          </div>
        </div>
      ) : (
        <MediaGrid users={users} guildId={guild.id} />
      )}
      {v.serverMuted && inHere && <p className="pb-2 text-center text-sm text-warning">{t('live.serverMuted')}</p>}
      {v.error && <p role="alert" className="pb-2 text-center text-sm text-danger-text">{errorText(v.error)}</p>}
      {inHere && (
        <div className="flex justify-center gap-2 pb-3">
          <button type="button" onClick={() => dispatchEvent(new CustomEvent('mncord:invite'))} className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-hover"><UserPlus className="size-4" />{t('voice.inviteToVoice')}</button>
        </div>
      )}
      <div className="flex justify-center pb-5">
        {inHere ? <VoiceControls fullscreen={fs} onFullscreen={toggleFs} /> : (
          <Button size="lg" loading={v.status === 'connecting' && v.channelId === channel.id} onClick={() => void joinVoice(guild.id, channel.id)}>{t('voice.join')}</Button>
        )}
      </div>
    </div>
  );
}
