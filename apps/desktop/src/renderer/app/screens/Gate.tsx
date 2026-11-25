// Before the app opens: verify your email (6-digit code), then wait for the owner's one-time approval.
import type { SelfUser } from '@mncord/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import splash from '../../assets/splash.webm';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { api, ApiError, signOut } from '../api';
import { errorText } from '../i18n';

export type GateState = 'verify' | 'pending' | 'ok';
export async function gateState(): Promise<{ state: GateState; me: SelfUser }> {
  const me = await api<SelfUser>('GET', '/users/@me');
  const a = await api<{ verified: boolean; approved: boolean; gate: boolean }>('GET', '/users/@me/approval');
  if (a.gate && !a.verified) return { state: 'verify', me };
  if (!a.approved) return { state: 'pending', me };
  return { state: 'ok', me };
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-bg-deep p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,color-mix(in_srgb,var(--c-accent)_16%,transparent),transparent_55%),radial-gradient(ellipse_at_80%_90%,color-mix(in_srgb,var(--c-text-link)_12%,transparent),transparent_50%)]" />
      <div className="anim-pop relative w-full max-w-[480px] rounded-lg bg-surface p-8 shadow-pop">{children}</div>
    </div>
  );
}

export function VerifyEmailGate({ me, onDone }: { me: SelfUser; onDone: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('POST', '/auth/verify-email', { code: code.trim() });
      onDone();
    } catch (err) {
      setMsg({ tone: 'err', text: errorText((err as ApiError).code) });
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setMsg(null);
    try {
      await api('POST', '/auth/verify-email/resend', {});
      setMsg({ tone: 'ok', text: t('verifyEmail.resent') });
    } catch (err) {
      setMsg({ tone: 'err', text: errorText((err as ApiError).code) });
    }
  };
  return (
    <Frame>
      <h1 className="text-center font-display text-xl font-bold">{t('gate.verifyTitle')}</h1>
      <p className="mt-2 text-center text-muted">{t('gate.verifySub', { email: me.email })}</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Input label={t('verifyEmail.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus className="text-center font-mono text-xl tracking-[0.5em]" />
        {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={msg.tone === 'err' ? 'text-sm text-danger-text' : 'text-sm text-success'}>{msg.text}</p>}
        <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6}>{t('verifyEmail.confirm')}</Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button type="button" onClick={() => void resend()} className="font-medium text-link hover:underline">{t('verifyEmail.resend')}</button>
        <button type="button" onClick={() => void signOut()} className="text-muted hover:text-text hover:underline">{t('settings.logout')}</button>
      </div>
      <p className="mt-4 text-xs text-faint">{t('gate.spam')}</p>
    </Frame>
  );
}

export function PendingGate({ onApproved }: { onApproved: () => void }) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const check = async (manual: boolean) => {
    if (manual) setChecking(true);
    try {
      const a = await api<{ approved: boolean }>('GET', '/users/@me/approval');
      if (a.approved) return onApproved();
      if (manual) setNote(t('gate.stillWaiting'));
    } catch {
      if (manual) setNote(t('errors.network'));
    } finally {
      if (manual) setChecking(false);
    }
  };
  useEffect(() => {
    const id = setInterval(() => void check(false), 20_000); // approval usually lands while you watch
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid min-h-full place-items-center bg-black p-6">
      <div className="flex max-w-[560px] flex-col items-center text-center">
        {/* the animated mnlovo logo, looping while you wait */}
        <video ref={video} src={splash} autoPlay muted loop playsInline className="w-[min(520px,80vw)]" />
        <h1 className="mt-2 font-display text-xl font-bold text-white">{t('gate.pendingTitle')}</h1>
        <p className="mt-2 text-[#a3aec4]">{t('gate.pendingSub')}</p>
        <div className="mt-6 flex items-center gap-3">
          <Button size="lg" loading={checking} onClick={() => void check(true)}>{t('gate.check')}</Button>
          <Button size="lg" variant="ghost" onClick={() => void signOut()}>{t('settings.logout')}</Button>
        </div>
        {note && <p role="status" className="mt-3 text-sm text-[#a3aec4]">{note}</p>}
      </div>
    </div>
  );
}
