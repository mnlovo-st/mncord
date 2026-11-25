// The little menus on the mic / headphone arrows (user panel and call bar), like Discord's:
// input device, input profile, input volume + live level · output device, output volume · Voice Settings.
import { Check, ChevronRight, Settings } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Slider } from '../../ui/Slider';
import { cn } from '../../ui/cn';
import { setPrefs, usePrefs } from '../prefs';
import { micLevel, setSuppression } from '../voice';

export type InputProfile = 'isolation' | 'studio' | 'custom';
export function inputProfileOf(p: { rawMic: boolean; suppression: string; mic: object }): InputProfile {
  if (p.rawMic) return 'studio';
  if (p.suppression !== 'off' && Object.values(p.mic).every((v) => v === undefined)) return 'isolation';
  return 'custom';
}
export function setInputProfile(x: InputProfile) {
  if (x === 'studio') setPrefs({ rawMic: true });
  else if (x === 'isolation') {
    setPrefs({ rawMic: false, mic: {} });
    if (usePrefs.getState().suppression === 'off') void setSuppression('rnnoise');
  } else setPrefs({ rawMic: false });
}

const openSettings = (tab: string) => dispatchEvent(new CustomEvent('mncord:settings', { detail: tab }));
const dbToPct = (db: number) => Math.round(10 ** (db / 20) * 100);
const pctToDb = (pct: number) => (pct <= 0 ? -60 : Math.round(20 * Math.log10(pct / 100) * 10) / 10);

function useDevices(kind: 'audioinput' | 'audiooutput') {
  const [list, setList] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => void navigator.mediaDevices.enumerateDevices().then((d) => setList(d.filter((x) => x.kind === kind && x.deviceId && x.deviceId !== 'default' && x.deviceId !== 'communications')));
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, [kind]);
  return list;
}

/** Floating panel anchored above a button; closes on outside click / Esc. */
export function Popover({ anchor, onClose, children, width = 260 }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    const top = a.top - h - 8 > 8 ? a.top - h - 8 : Math.min(a.bottom + 8, innerHeight - h - 8);
    setPos({ left: Math.max(8, Math.min(a.left + a.width / 2 - width / 2, innerWidth - width - 8)), top });
  }, [anchor, width]);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    setTimeout(() => {
      addEventListener('mousedown', close);
      addEventListener('keydown', close);
    });
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} role="menu" className="anim-pop fixed z-50 rounded-lg bg-popover p-1.5 text-sm shadow-pop" style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      {children}
    </div>,
    document.body,
  );
}

function Row({ label, sub, onClick, open, children }: { label: string; sub?: string; onClick?: () => void; open?: boolean; children?: ReactNode }) {
  return (
    <>
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-start hover:bg-surface-selected">
        <span className="min-w-0">
          <span className="block font-medium text-text">{label}</span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
        </span>
        <ChevronRight className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-90')} />
      </button>
      {open && <div className="mb-1 ms-2 border-s border-border ps-1">{children}</div>}
    </>
  );
}
function Pick({ label, active, onClick, sub }: { label: string; active: boolean; onClick: () => void; sub?: string }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={active} onClick={onClick} className="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-start hover:bg-surface-selected">
      <span className="min-w-0">
        <span className={cn('block truncate', active ? 'font-semibold text-text' : 'text-muted')}>{label}</span>
        {sub && <span className="block text-xs text-faint">{sub}</span>}
      </span>
      {active && <Check className="size-4 shrink-0 text-accent-text" />}
    </button>
  );
}
const Sep = () => <div className="mx-1.5 my-1.5 h-px bg-border" />;

/** live input meter: the call's mic when you're in one, otherwise a quick private peek at the device */
function InputLevel() {
  const [lvl, setLvl] = useState(0);
  const deviceId = usePrefs((p) => p.inputDeviceId);
  useEffect(() => {
    let raf = 0;
    let stop = () => {};
    let analyser: AnalyserNode | null = null;
    const buf = new Float32Array(1024);
    const read = () => {
      let db = micLevel();
      if (db === null && analyser) {
        analyser.getFloatTimeDomainData(buf);
        let s = 0;
        for (const v of buf) s += v * v;
        db = 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9);
      }
      setLvl(db === null ? 0 : Math.max(0, Math.min(100, ((db + 70) / 70) * 100)));
      raf = requestAnimationFrame(read);
    };
    if (micLevel() === null) {
      void navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId !== 'default' ? { ideal: deviceId } : undefined } }).then((s) => {
        const ctx = new AudioContext();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(s).connect(analyser);
        stop = () => {
          s.getTracks().forEach((x) => x.stop());
          void ctx.close();
        };
      }).catch(() => {});
    }
    read();
    return () => {
      cancelAnimationFrame(raf);
      stop();
    };
  }, [deviceId]);
  const bars = 28;
  return (
    <div className="flex gap-[3px] px-2.5 pb-2 pt-1" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={cn('h-4 flex-1 rounded-[2px] transition-colors duration-75', (i / bars) * 100 < lvl ? (i > bars * 0.85 ? 'bg-warning' : 'bg-online') : 'bg-surface-selected')} />
      ))}
    </div>
  );
}

export function MicMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const { t } = useTranslation();
  const p = usePrefs();
  const devices = useDevices('audioinput');
  const [open, setOpen] = useState<'device' | 'profile' | null>(null);
  const profile = inputProfileOf(p);
  const current = devices.find((d) => d.deviceId === p.inputDeviceId)?.label || t('settings.default');
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      <Row label={t('am.inputDevice')} sub={current} open={open === 'device'} onClick={() => setOpen(open === 'device' ? null : 'device')}>
        <Pick label={t('settings.default')} active={p.inputDeviceId === 'default'} onClick={() => setPrefs({ inputDeviceId: 'default' })} />
        {devices.map((d) => <Pick key={d.deviceId} label={d.label || d.deviceId.slice(0, 8)} active={p.inputDeviceId === d.deviceId} onClick={() => setPrefs({ inputDeviceId: d.deviceId })} />)}
      </Row>
      <Row label={t('am.inputProfile')} sub={t(`am.profile.${profile}`)} open={open === 'profile'} onClick={() => setOpen(open === 'profile' ? null : 'profile')}>
        {(['isolation', 'studio', 'custom'] as InputProfile[]).map((x) => <Pick key={x} label={t(`am.profile.${x}`)} sub={t(`am.profile.${x}Sub`)} active={profile === x} onClick={() => setInputProfile(x)} />)}
      </Row>
      <Sep />
      <div className="px-2.5 pb-1 pt-1">
        <Slider label={t('am.inputVolume')} value={dbToPct(p.mic.inputGainDb ?? 0)} min={0} max={200} step={5} format={(v) => `${v}%`} onValueChange={(v) => setPrefs({ mic: { ...p.mic, inputGainDb: pctToDb(v) } })} />
      </div>
      <p className="px-2.5 pt-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('am.inputLevel')}</p>
      <InputLevel />
      <Sep />
      <button type="button" onClick={() => { onClose(); openSettings('voice'); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 font-medium text-text hover:bg-surface-selected"><Settings className="size-4 text-muted" />{t('am.voiceSettings')}</button>
    </Popover>
  );
}

export function OutputMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const { t } = useTranslation();
  const p = usePrefs();
  const devices = useDevices('audiooutput');
  const [open, setOpen] = useState(false);
  const current = devices.find((d) => d.deviceId === p.outputDeviceId)?.label || t('am.windowsDefault');
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      <Row label={t('am.outputDevice')} sub={current} open={open} onClick={() => setOpen(!open)}>
        <Pick label={t('am.windowsDefault')} active={p.outputDeviceId === 'default'} onClick={() => setPrefs({ outputDeviceId: 'default' })} />
        {devices.map((d) => <Pick key={d.deviceId} label={d.label || d.deviceId.slice(0, 8)} active={p.outputDeviceId === d.deviceId} onClick={() => setPrefs({ outputDeviceId: d.deviceId })} />)}
      </Row>
      <Sep />
      <div className="px-2.5 pb-2 pt-1">
        <Slider label={t('am.outputVolume')} value={p.outputVolume} min={0} max={200} step={5} format={(v) => `${v}%`} onValueChange={(v) => setPrefs({ outputVolume: v })} />
      </div>
      <Sep />
      <button type="button" onClick={() => { onClose(); openSettings('voice'); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 font-medium text-text hover:bg-surface-selected"><Settings className="size-4 text-muted" />{t('am.voiceSettings')}</button>
    </Popover>
  );
}
