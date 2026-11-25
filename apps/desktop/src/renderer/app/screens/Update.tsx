// Updates, Discord-style: when a new version is out it downloads by itself and a card shows the animated
// mnlovo logo, the progress and what's new; when it's ready, one click restarts into it. After the
// restart, "What's new" opens once.
import { Download, RotateCw, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import splash from '../../assets/splash.webm';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { CHANGELOG } from '../changelog';
import { setPrefs, usePrefs } from '../prefs';

type Phase = { kind: 'idle' } | { kind: 'downloading'; version: string; notes: string; percent: number; bps: number } | { kind: 'ready'; version: string; notes: string };

/** GitHub release notes arrive as HTML: turn them into plain lines safely (no HTML is ever injected). */
function notesToLines(html: string): { text: string; heading: boolean }[] {
  if (!html.trim()) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: { text: string; heading: boolean }[] = [];
  const walk = (n: Element) => {
    for (const c of Array.from(n.children)) {
      const tag = c.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) out.push({ text: c.textContent?.trim() ?? '', heading: true });
      else if (tag === 'li') out.push({ text: c.textContent?.trim() ?? '', heading: false });
      else if (tag === 'p') {
        const t = c.textContent?.trim();
        if (t) out.push({ text: t, heading: false });
      } else walk(c);
    }
  };
  walk(doc.body);
  if (!out.length) for (const l of (doc.body.textContent ?? '').split(/\n+/)) if (l.trim()) out.push({ text: l.trim().replace(/^[-*•]\s*/, ''), heading: false });
  return out.filter((l) => l.text).slice(0, 40);
}

function Notes({ version, notes }: { version: string; notes: string }) {
  const { i18n } = useTranslation();
  const local = CHANGELOG.find((r) => r.version === version);
  const lines = useMemo(() => (local ? (i18n.language === 'ar' ? local.ar : local.en).map((text) => ({ text, heading: false })) : notesToLines(notes)), [local, notes, i18n.language]);
  if (!lines.length) return null;
  return (
    <ul className="flex flex-col gap-1.5" dir="auto">
      {lines.map((l, i) =>
        l.heading ? (
          <li key={i} className="pt-2 text-2xs font-bold uppercase tracking-wide text-faint">{l.text}</li>
        ) : (
          <li key={i} className="flex gap-2 text-sm leading-snug text-muted"><Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent-text" /><span>{l.text}</span></li>
        ),
      )}
    </ul>
  );
}

function Card({ children, onClose, closeLabel }: { children: ReactNode; onClose?: () => void; closeLabel: string }) {
  return (
    <div role="dialog" aria-modal="false" className="anim-pop fixed bottom-4 end-4 z-50 flex max-h-[min(640px,calc(100vh-80px))] w-[380px] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-pop">
      {onClose && (
        <button type="button" onClick={onClose} aria-label={closeLabel} className="absolute end-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white"><X className="size-4" /></button>
      )}
      {children}
    </div>
  );
}

export function UpdateCenter() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [hidden, setHidden] = useState(false);
  const [whatsNew, setWhatsNew] = useState<string | null>(null);
  const seen = usePrefs((p) => p.seenVersion);

  useEffect(() => {
    const u = window.mncord?.update;
    if (!u) return;
    const offs = [
      u.onAvailable?.((i) => setPhase({ kind: 'downloading', version: i.version, notes: i.notes, percent: 0, bps: 0 })),
      u.onProgress?.((p) => setPhase((cur) => (cur.kind === 'downloading' ? { ...cur, percent: p.percent, bps: p.bps } : { kind: 'downloading', version: '', notes: '', percent: p.percent, bps: p.bps }))),
      u.onReady((version) => setPhase((cur) => ({ kind: 'ready', version, notes: cur.kind !== 'idle' ? cur.notes : '' }))),
      u.onInfo?.((i) => setPhase((cur) => (cur.kind === 'ready' ? { ...cur, notes: cur.notes || i.notes } : cur))),
    ];
    return () => offs.forEach((f) => f?.());
  }, []);

  // first launch on a new version: show what changed, once
  useEffect(() => {
    void window.mncord?.app?.version().then((v) => {
      if (!v) return;
      if (!seen) return setPrefs({ seenVersion: v }); // fresh install: nothing to compare with
      if (seen !== v && CHANGELOG.some((r) => r.version === v)) setWhatsNew(v);
      else if (seen !== v) setPrefs({ seenVersion: v });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (whatsNew) {
    const close = () => {
      setPrefs({ seenVersion: whatsNew });
      setWhatsNew(null);
    };
    return (
      <div className="anim-fade fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={close}>
        <div className="anim-pop w-full max-w-[520px] overflow-hidden rounded-xl bg-popover shadow-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('update.whatsNew')}>
          <div className="relative grid h-40 place-items-center overflow-hidden bg-black">
            <video src={splash} autoPlay muted loop playsInline className="logo-blend h-full" />
            <span className="absolute bottom-3 start-4 rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">v{whatsNew}</span>
          </div>
          <div className="max-h-[50vh] overflow-y-auto p-5">
            <h2 className="mb-3 font-display text-xl font-bold">{t('update.whatsNew')}</h2>
            <Notes version={whatsNew} notes="" />
          </div>
          <div className="flex justify-end bg-surface p-4"><Button onClick={close}>{t('update.gotIt')}</Button></div>
        </div>
      </div>
    );
  }

  if (phase.kind === 'idle') return null;
  if (hidden)
    return (
      <button type="button" onClick={() => setHidden(false)} className="anim-pop fixed bottom-4 end-4 z-50 flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-pop hover:brightness-110">
        {phase.kind === 'ready' ? <RotateCw className="size-4" /> : <Download className="size-4 animate-bounce" />}
        {phase.kind === 'ready' ? t('update.readyShort') : `${Math.round(phase.percent)}%`}
      </button>
    );

  const ready = phase.kind === 'ready';
  return (
    <Card onClose={() => setHidden(true)} closeLabel={t('update.later')}>
      <div className="relative grid h-36 shrink-0 place-items-center overflow-hidden bg-black">
        {/* the animated mnlovo logo while the new version comes down */}
        <video src={splash} autoPlay muted loop playsInline className="logo-blend h-full" />
      </div>
      <div className="flex min-h-0 flex-col gap-3 p-4">
        <div>
          <p className="font-display text-lg font-bold">{ready ? t('update.readyTitle') : t('update.downloading')}</p>
          {phase.version && <p className="text-sm text-muted">mncord v{phase.version}</p>}
        </div>
        {!ready && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-selected" role="progressbar" aria-valuenow={Math.round(phase.percent)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--c-accent),var(--c-text-link))] transition-[width] duration-300" style={{ width: `${Math.max(3, phase.percent)}%` }} />
            </div>
            <p className="mt-1 flex justify-between text-xs text-faint"><span>{Math.round(phase.percent)}%</span><span>{phase.bps > 0 ? `${(phase.bps / 1048576).toFixed(1)} MB/s` : ''}</span></p>
          </div>
        )}
        <div className={cn('min-h-0 overflow-y-auto rounded-lg bg-bg-deep/60 p-3', ready ? 'max-h-64' : 'max-h-48')}>
          <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-faint">{t('update.whatsNew')}</p>
          <Notes version={phase.version} notes={phase.notes} />
        </div>
        {ready ? (
          <div className="flex gap-2">
            <Button className="flex-1 justify-center" icon={<RotateCw className="size-4" />} onClick={() => void window.mncord?.update.install()}>{t('app.restartNow')}</Button>
            <Button variant="ghost" onClick={() => setHidden(true)}>{t('update.later')}</Button>
          </div>
        ) : (
          <p className="text-xs text-faint">{t('update.background')}</p>
        )}
      </div>
    </Card>
  );
}
