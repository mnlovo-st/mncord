// S11 voice channel: grid (avatars, cameras, streams) + control bar.
import type { Channel, Guild } from '@mncord/shared';
import { Headphones, HeadphoneOff, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Sparkles, Video, VideoOff, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { errorText } from '../i18n';
import { useStore } from '../store';
import { joinVoice, leaveVoice, setDeafened, setMuted, setSuppression, stopStream, toggleCamera, useVoice } from '../voice';
import { GoLivePicker, MediaGrid } from './Media';

export function VoiceControls({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const v = useVoice();
  const [picker, setPicker] = useState(false);
  return (
    <div className={cn('flex items-center gap-2 rounded-xl bg-surface p-2 shadow-pop', compact && 'scale-90')}>
      <Ctl label={v.muted ? t('voice.unmute') : t('voice.mute')} active={v.muted || v.serverMuted} onClick={() => void setMuted(!v.muted)}>
        {v.muted || v.serverMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
      </Ctl>
      <Ctl label={v.deafened ? t('voice.undeafen') : t('voice.deafen')} active={v.deafened} onClick={() => void setDeafened(!v.deafened)}>
        {v.deafened ? <HeadphoneOff className="size-5" /> : <Headphones className="size-5" />}
      </Ctl>
      <Ctl label={v.camera ? t('live.cameraOff') : t('live.camera')} active={v.camera} onClick={() => void toggleCamera()}>
        {v.camera ? <VideoOff className="size-5" /> : <Video className="size-5" />}
      </Ctl>
      <Ctl label={v.streaming ? t('live.stop') : t('live.goLive')} active={v.streaming} onClick={() => (v.streaming ? void stopStream() : setPicker(true))}>
        {v.streaming ? <MonitorX className="size-5" /> : <MonitorUp className="size-5" />}
      </Ctl>
      <Ctl label={`${t('voice.noise')}: ${v.suppression}`} active={false} accent={v.suppression !== 'off'} onClick={() => void setSuppression(v.suppression === 'gtcrn' ? 'rnnoise' : v.suppression === 'rnnoise' ? 'off' : 'gtcrn')}>
        <Sparkles className="size-5" />
      </Ctl>
      <Tooltip content={t('voice.leave')}>
        <button type="button" aria-label={t('voice.leave')} onClick={() => void leaveVoice()} className="grid h-12 w-16 place-items-center rounded-lg bg-danger-solid text-on-danger hover:brightness-110">
          <PhoneOff className="size-5" />
        </button>
      </Tooltip>
      {picker && <GoLivePicker onClose={() => setPicker(false)} />}
    </div>
  );
}

export function VoiceRoom({ guild, channel }: { guild: Guild; channel: Channel }) {
  const { t } = useTranslation();
  const voice = useStore((s) => s.voice);
  const v = useVoice();
  const inHere = v.channelId === channel.id;
  const users = Object.values(voice).filter((x) => x.channelId === channel.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-deep">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <Volume2 aria-hidden className="size-6 text-faint" />
        <h1 className="font-semibold">{channel.name}</h1>
      </header>
      {users.length === 0 ? <p className="grid flex-1 place-items-center text-muted">{t('voice.empty')}</p> : <MediaGrid users={users} />}
      {inHere && users.length === 1 && <p className="pb-2 text-center text-sm text-muted">{t('voice.alone')}</p>}
      {v.serverMuted && inHere && <p className="pb-2 text-center text-sm text-warning">{t('live.serverMuted')}</p>}
      {v.error && <p role="alert" className="pb-2 text-center text-sm text-danger-text">{errorText(v.error)}</p>}
      <div className="flex justify-center pb-6">
        {inHere ? <VoiceControls /> : (
          <Button size="lg" loading={v.status === 'connecting' && v.channelId === channel.id} onClick={() => void joinVoice(guild.id, channel.id)}>{t('voice.join')}</Button>
        )}
      </div>
    </div>
  );
}

function Ctl({ label, active, accent, onClick, children }: { label: string; active: boolean; accent?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip content={label}>
      <button type="button" aria-label={label} aria-pressed={active} onClick={onClick}
        className={cn('grid size-12 place-items-center rounded-lg transition-colors', active ? 'bg-text text-bg' : 'bg-surface-raised text-text hover:bg-surface-selected', accent && !active && 'text-accent-text')}>
        {children}
      </button>
    </Tooltip>
  );
}
