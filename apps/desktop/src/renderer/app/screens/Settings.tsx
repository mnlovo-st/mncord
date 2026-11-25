// S24 user settings (full screen) · S25 voice settings
import type { SelfUser, SessionInfo } from '@mncord/shared';
import { Check, Copy, KeyRound, LogOut, Monitor, ShieldCheck, Smartphone, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createMicChain, DEFAULT_MIC, type MicChain, type Suppression } from '../../media/micChain';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Switch';
import { cn } from '../../ui/cn';
import { api, ApiError, avatarUrl, signOut, uploadFile } from '../api';
import { applyLang, errorText } from '../i18n';
import { setPrefs, usePrefs } from '../prefs';
import { set, useStore } from '../store';
import { setSuppression } from '../voice';

type Tab = 'account' | 'security' | 'devices' | 'appearance' | 'language' | 'voice' | 'windows';

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('account');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=dialog][data-state=open], [role=alertdialog]') && onClose(); // our own full-screen panel is a dialog too: only a modal on top of it blocks Esc
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const nav: [string, [Tab, string][]][] = [
    [t('settings.user'), [['account', t('settings.account')], ['security', t('settings.security')], ['devices', t('settings.devices')]]],
    [t('settings.app'), [['appearance', t('settings.appearance')], ['voice', t('settings.voice')], ['language', t('settings.language')], ['windows', t('win.title')]]],
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label={t('settings.title')} className="anim-fade fixed inset-0 z-40 flex bg-bg">
      <nav className="flex w-[min(320px,35vw)] shrink-0 justify-end overflow-y-auto bg-surface py-14 pe-2">
        <div className="w-[218px]">
          {nav.map(([group, items]) => (
            <div key={group} className="mb-4">
              <h2 className="px-2.5 pb-1.5 text-2xs font-bold uppercase tracking-wide text-faint">{group}</h2>
              {items.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? 'page' : undefined}
                  className={cn('mb-0.5 block w-full rounded-sm px-2.5 py-1.5 text-start text-base font-medium', tab === id ? 'bg-surface-selected text-text' : 'text-muted hover:bg-surface-hover hover:text-text')}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
          <div className="my-2 h-px bg-border" />
          <button type="button" onClick={() => void signOut()} className="flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-start font-medium text-danger-text hover:bg-surface-hover">
            {t('settings.logout')} <LogOut className="size-4 rtl:-scale-x-100" />
          </button>
        </div>
      </nav>
      <div className="relative min-w-0 flex-1 overflow-y-auto px-10 py-14">
        <div className="max-w-[740px]">
          {tab === 'account' && <AccountTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'devices' && <DevicesTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'language' && <LanguageTab />}
          {tab === 'voice' && <VoiceTab />}
          {tab === 'windows' && <WindowsTab />}
        </div>
        <button type="button" onClick={onClose} aria-label={t('settings.close')} className="fixed end-10 top-14 flex flex-col items-center gap-1 text-faint hover:text-text">
          <span className="grid size-9 place-items-center rounded-full border-2 border-current"><X className="size-5" /></span>
          <span className="text-xs font-semibold">ESC</span>
        </button>
      </div>
    </div>
  );
}

const H = ({ children }: { children: ReactNode }) => <h1 className="mb-5 font-display text-lg font-semibold">{children}</h1>;
const Section = ({ title, children }: { title?: string; children: ReactNode }) => (
  <section className="mb-8 border-b border-border pb-8 last:border-0">
    {title && <h2 className="mb-3 text-2xs font-bold uppercase tracking-wide text-muted">{title}</h2>}
    {children}
  </section>
);
const updateMe = (me: SelfUser | null) => me && set({ me });

// ── My account
function AccountTab() {
  const { t } = useTranslation();
  const me = useStore((s) => s.me)!;
  const [p, setP] = useState({ displayName: me.displayName ?? '', bio: me.bio ?? '', pronouns: me.pronouns ?? '' });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string>();
  const [edit, setEdit] = useState<'username' | 'email' | 'password' | 'verify' | null>(null);
  const dirty = p.displayName !== (me.displayName ?? '') || p.bio !== (me.bio ?? '') || p.pronouns !== (me.pronouns ?? '');

  const save = async () => {
    setErr(undefined);
    try {
      updateMe(await api<SelfUser>('PATCH', '/users/@me', { displayName: p.displayName.trim() || null, bio: p.bio || null, pronouns: p.pronouns || null }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    }
  };

  const Row = ({ label, value, onEdit, extra }: { label: string; value: string; onEdit: () => void; extra?: ReactNode }) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate text-text" dir="auto">{value} {extra}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onEdit}>{t('settings.edit')}</Button>
    </div>
  );

  return (
    <>
      <H>{t('settings.account')}</H>
      <div className="mb-8 overflow-hidden rounded-lg bg-surface">
        <div className="h-24 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--c-accent)_55%,#000),color-mix(in_srgb,var(--c-text-link)_45%,#000))]" />
        <div className="flex items-end gap-4 px-4 pb-4">
          <AvatarUpload />
          <div className="pb-1">
            <p className="font-display text-lg font-semibold">{me.displayName ?? me.username}</p>
            <p className="text-sm text-muted">@{me.username}</p>
          </div>
        </div>
        <div className="mx-4 mb-4 divide-y divide-border rounded-md bg-bg-deep/50 px-4">
          <Row label={t('settings.username')} value={me.username} onEdit={() => setEdit('username')} />
          <Row
            label={t('settings.email')}
            value={me.email}
            onEdit={() => setEdit('email')}
            extra={
              me.emailVerified ? (
                <span className="ms-2 text-xs font-semibold text-success">✓ {t('settings.verified')}</span>
              ) : (
                <button type="button" onClick={() => setEdit('verify')} className="ms-2 text-xs font-semibold text-warning hover:underline">{t('settings.unverified')}</button>
              )
            }
          />
        </div>
      </div>

      <Section title={t('settings.profile')}>
        <div className="grid gap-4">
          <Input label={t('settings.displayName')} value={p.displayName} maxLength={32} onChange={(e) => setP({ ...p, displayName: e.target.value })} />
          <Input label={t('settings.pronouns')} value={p.pronouns} maxLength={40} onChange={(e) => setP({ ...p, pronouns: e.target.value })} />
          <label className="flex flex-col gap-2">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted">{t('settings.bio')}</span>
            <textarea value={p.bio} maxLength={400} dir="auto" rows={3} onChange={(e) => setP({ ...p, bio: e.target.value })} className="resize-none rounded-sm border border-border-input bg-surface-input p-3 text-text outline-none focus-visible:border-focus" />
          </label>
          {err && <p role="alert" className="text-sm text-danger-text">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button disabled={!dirty} onClick={() => void save()} icon={saved ? <Check className="size-4" /> : undefined}>{saved ? t('settings.saved') : t('settings.save')}</Button>
          </div>
        </div>
      </Section>

      <Section title={t('settings.changePassword')}>
        <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setEdit('password')}>{t('settings.changePassword')}</Button>
      </Section>

      <EditModal kind={edit} onClose={() => setEdit(null)} />
    </>
  );
}

export function EditModal({ kind, onClose }: { kind: 'username' | 'email' | 'password' | 'verify' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const [v, setV] = useState({ value: '', password: '', next: '', code: '' });
  const [err, setErr] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNote(undefined);
    setV({ value: kind === 'username' ? (me?.username ?? '') : kind === 'email' ? (me?.email ?? '') : '', password: '', next: '', code: '' });
    setErr(undefined);
    setInfo(undefined);
  }, [kind, me?.username, me?.email]);
  if (!kind) return null;

  const run = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      if (kind === 'username') updateMe(await api<SelfUser>('PATCH', '/users/@me/username', { username: v.value, password: v.password }));
      if (kind === 'email') updateMe(await api<SelfUser>('PATCH', '/users/@me/email', { email: v.value, password: v.password }));
      if (kind === 'password') {
        await api('PATCH', '/users/@me/password', { currentPassword: v.password, newPassword: v.next });
        setInfo(t('settings.passwordChanged'));
        setBusy(false);
        return;
      }
      if (kind === 'verify') {
        await api('POST', '/auth/verify-email', { code: v.code.trim() });
        if (me) set({ me: { ...me, emailVerified: true } });
      }
      onClose();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  const title = { username: t('settings.username'), email: t('settings.email'), password: t('settings.changePassword'), verify: t('verifyEmail.title') }[kind];
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={kind === 'verify' ? t('verifyEmail.sub', { email: me?.email }) : undefined}
      closeLabel={t('common.close')}
      footer={
        info ? <Button onClick={onClose}>{t('settings.done')}</Button> : <><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} onClick={() => void run()}>{kind === 'verify' ? t('verifyEmail.confirm') : t('settings.save')}</Button></>
      }
    >
      {info ? (
        <p className="text-success">{info}</p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          {(kind === 'username' || kind === 'email') && <Input label={title} value={v.value} dir="ltr" type={kind === 'email' ? 'email' : 'text'} autoFocus onChange={(e) => setV({ ...v, value: e.target.value })} />}
          {kind === 'verify' ? (
            <>
              <Input label={t('verifyEmail.code')} value={v.code} inputMode="numeric" maxLength={6} dir="ltr" autoFocus onChange={(e) => setV({ ...v, code: e.target.value })} />
              <Button variant="link" className="self-start text-sm" onClick={() => void api('POST', '/auth/verify-email/resend', {}).then(() => setNote(t('verifyEmail.resent')), (e: ApiError) => setErr(errorText(e.code)))}>{t('verifyEmail.resend')}</Button>
            </>
          ) : (
            <Input label={kind === 'password' ? t('settings.currentPassword') : t('settings.confirmPassword')} variant="password" value={v.password} autoComplete="current-password" onChange={(e) => setV({ ...v, password: e.target.value })} />
          )}
          {kind === 'password' && <Input label={t('settings.newPassword')} variant="password" value={v.next} autoComplete="new-password" onChange={(e) => setV({ ...v, next: e.target.value })} />}
          {note && <p role="status" className="text-sm text-success">{note}</p>}
          {err && <p role="alert" className="text-sm text-danger-text">{err}</p>}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}

// ── Privacy & security
function SecurityTab() {
  const { t } = useTranslation();
  const me = useStore((s) => s.me)!;
  const [status, setStatus] = useState<{ enabled: boolean; backupCodesLeft: number } | null>(null);
  const [flow, setFlow] = useState<'enable' | 'disable' | 'regen' | 'delete' | null>(null);
  const refresh = () => void api<{ enabled: boolean; backupCodesLeft: number }>('GET', '/users/@me/mfa').then(setStatus);
  useEffect(refresh, []);

  return (
    <>
      <H>{t('settings.security')}</H>
      <Section title={t('settings.mfaTitle')}>
        <div className="flex items-start gap-4 rounded-lg bg-surface p-4">
          <ShieldCheck className={cn('mt-0.5 size-8 shrink-0', status?.enabled ? 'text-success' : 'text-faint')} />
          <div className="flex-1">
            <p className="text-muted">{status?.enabled ? t('settings.mfaOn', { left: status.backupCodesLeft }) : t('settings.mfaOff')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {status?.enabled ? (
                <>
                  <Button variant="secondary" onClick={() => setFlow('regen')}>{t('settings.regen')}</Button>
                  <Button variant="danger" onClick={() => setFlow('disable')}>{t('settings.disable2fa')}</Button>
                </>
              ) : (
                <Button onClick={() => setFlow('enable')} disabled={!status}>{t('settings.enable2fa')}</Button>
              )}
            </div>
          </div>
        </div>
      </Section>
      <Section title={t('settings.deleteTitle')}>
        <p className="mb-3 text-sm text-muted">{t('settings.deleteSub')}</p>
        <Button variant="danger" onClick={() => setFlow('delete')}>{t('settings.deleteBtn')}</Button>
      </Section>
      {flow === 'enable' && <EnableMfa username={me.username} onClose={() => { setFlow(null); refresh(); }} />}
      {(flow === 'disable' || flow === 'regen' || flow === 'delete') && (
        <StepUpModal kind={flow} mfa={!!status?.enabled} onClose={() => { setFlow(null); refresh(); }} />
      )}
    </>
  );
}

function EnableMfa({ username, onClose }: { username: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ secret: string; uri: string }>('POST', '/users/@me/mfa/totp/setup', {})
      .then(async (s) => setSetup({ ...s, qr: await QRCode.toDataURL(s.uri, { margin: 1, width: 176, color: { dark: '#0a0e16', light: '#ffffff' } }) }))
      .catch((e: ApiError) => setErr(errorText(e.code)));
  }, [username]);

  const enable = async () => {
    if (!setup) return;
    setBusy(true);
    setErr(undefined);
    try {
      const r = await api<{ backupCodes: string[] }>('POST', '/users/@me/mfa/totp/enable', { secret: setup.secret, code: code.trim(), password });
      setCodes(r.backupCodes);
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  if (codes) return <BackupCodes codes={codes} onClose={onClose} />;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('settings.enable2fa')} closeLabel={t('common.close')} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!setup} onClick={() => void enable()}>{t('settings.enable2fa')}</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('settings.scan')}</p>
        <div className="flex items-center gap-4">
          <div className="grid size-[184px] shrink-0 place-items-center rounded-md bg-white p-1">{setup ? <img src={setup.qr} alt="QR" className="size-[176px]" /> : null}</div>
          <div className="min-w-0 text-sm">
            <p className="text-muted">{t('settings.manual')}</p>
            <code className="mt-1 block break-all rounded-xs bg-surface-input p-2 font-mono text-xs text-text" dir="ltr">{setup?.secret.match(/.{1,4}/g)?.join(' ')}</code>
          </div>
        </div>
        <Input label={t('settings.enterCode')} value={code} inputMode="numeric" maxLength={6} dir="ltr" onChange={(e) => setCode(e.target.value)} />
        <Input label={t('settings.confirmPassword')} variant="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        {err && <p role="alert" className="text-sm text-danger-text">{err}</p>}
      </div>
    </Modal>
  );
}

function BackupCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Modal open onOpenChange={() => {}} title={t('settings.backupTitle')} description={t('settings.backupSub')} closeLabel={t('common.close')}
      footer={<><Button variant="secondary" icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => { void navigator.clipboard.writeText(codes.join('\n')); setCopied(true); }}>{t('settings.copyCodes')}</Button><Button onClick={onClose}>{t('settings.done')}</Button></>}>
      <ul className="grid grid-cols-2 gap-2 font-mono text-base" dir="ltr">
        {codes.map((c) => <li key={c} className="rounded-xs bg-surface-input px-3 py-2 text-center">{c}</li>)}
      </ul>
    </Modal>
  );
}

function StepUpModal({ kind, mfa, onClose }: { kind: 'disable' | 'regen' | 'delete'; mfa: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string>();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      if (kind === 'disable') await api('POST', '/users/@me/mfa/totp/disable', { password, code: code.trim() });
      if (kind === 'regen') return setCodes((await api<{ backupCodes: string[] }>('POST', '/users/@me/mfa/backup-codes', { password, code: code.trim() })).backupCodes);
      if (kind === 'delete') {
        await api('DELETE', '/users/@me', { password, code: mfa ? code.trim() : undefined });
        await signOut();
        return;
      }
      onClose();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  if (codes) return <BackupCodes codes={codes} onClose={onClose} />;
  const title = { disable: t('settings.disable2fa'), regen: t('settings.regen'), delete: t('settings.deleteTitle') }[kind];
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title} description={kind === 'delete' ? t('settings.deleteSub') : undefined} closeLabel={t('common.close')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant={kind === 'regen' ? 'primary' : 'danger'} loading={busy} onClick={() => void run()}>{kind === 'delete' ? t('settings.deleteConfirm') : title}</Button></>}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <Input label={t('settings.confirmPassword')} variant="password" value={password} autoFocus autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        {mfa && <Input label={t('settings.mfaCodeOrBackup')} value={code} dir="ltr" maxLength={9} onChange={(e) => setCode(e.target.value)} />}
        {err && <p role="alert" className="text-sm text-danger-text">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ── Devices
function DevicesTab() {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const load = () => void api<SessionInfo[]>('GET', '/users/@me/sessions').then(setList);
  useEffect(load, []);
  const rel = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
  const when = (iso: string) => {
    const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
    if (Math.abs(mins) < 60) return rel.format(mins, 'minute');
    if (Math.abs(mins) < 1440) return rel.format(Math.round(mins / 60), 'hour');
    return rel.format(Math.round(mins / 1440), 'day');
  };
  const revoke = async (id?: string) => {
    await api('DELETE', id ? `/users/@me/sessions/${id}` : '/users/@me/sessions');
    load();
  };
  return (
    <>
      <H>{t('settings.devices')}</H>
      <p className="mb-6 text-muted">{t('settings.devicesSub')}</p>
      <ul className="flex flex-col gap-2">
        {list?.map((s) => (
          <li key={s.id} className="flex items-center gap-4 rounded-lg bg-surface p-4">
            <span className="grid size-10 place-items-center rounded-full bg-surface-raised">{/web|android|ios/i.test(s.os ?? '') ? <Smartphone className="size-5" /> : <Monitor className="size-5" />}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{s.deviceName ?? t('settings.unknownDevice')}</p>
              <p className="text-sm text-muted">{s.current ? <span className="font-semibold text-success">{t('settings.thisDevice')}</span> : t('settings.lastActive', { when: when(s.lastSeenAt) })}{s.clientVersion ? ` · v${s.clientVersion}` : ''}</p>
            </div>
            {!s.current && <Button variant="secondary" size="sm" onClick={() => void revoke(s.id)}>{t('settings.signOutDevice')}</Button>}
          </li>
        ))}
      </ul>
      {list && list.length > 1 && <Button variant="danger" className="mt-6" onClick={() => void revoke()}>{t('settings.signOutAll')}</Button>}
    </>
  );
}

// ── Appearance
function AppearanceTab() {
  const { t } = useTranslation();
  const p = usePrefs();
  const themes: { id: typeof p.theme; bg: string; fg: string }[] = [
    { id: 'midnight', bg: '#161d2c', fg: '#e8edf6' },
    { id: 'light', bg: '#ffffff', fg: '#111622' },
    { id: 'amoled', bg: '#000000', fg: '#e8edf6' },
  ];
  return (
    <>
      <H>{t('settings.appearance')}</H>
      <Section title={t('settings.theme')}>
        <div role="radiogroup" className="flex flex-wrap gap-3">
          {themes.map((th) => (
            <button key={th.id} type="button" role="radio" aria-checked={p.theme === th.id} onClick={() => setPrefs({ theme: th.id })} className="flex flex-col items-center gap-2">
              <span className={cn('grid size-16 place-items-center rounded-full border-2 text-xl font-bold', p.theme === th.id ? 'border-accent' : 'border-border')} style={{ background: th.bg, color: th.fg }}>
                {p.theme === th.id ? <Check className="size-6" /> : 'Aa'}
              </span>
              <span className="text-sm">{t(`settings.${th.id}`)}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('settings.density')}>
        <div role="radiogroup" className="flex gap-2">
          {(['cozy', 'compact'] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={p.density === d} onClick={() => setPrefs({ density: d })}
              className={cn('h-10 rounded-sm border px-4 font-medium', p.density === d ? 'border-accent bg-mention' : 'border-border bg-surface hover:bg-surface-hover')}>
              {t(`settings.${d}`)}
            </button>
          ))}
        </div>
      </Section>
      <Section>
        <Slider label={t('settings.fontScale')} value={p.fontScale} min={80} max={130} step={5} format={(v) => `${v}%`} onValueChange={(v) => setPrefs({ fontScale: v })} />
      </Section>
      <Section>
        <Switch label={t('settings.reducedMotion')} description={t('settings.reducedMotionSub')} checked={p.reducedMotion} onCheckedChange={(v) => setPrefs({ reducedMotion: v })} />
      </Section>
    </>
  );
}

// ── Language
function LanguageTab() {
  const { t, i18n } = useTranslation();
  const me = useStore((s) => s.me);
  const pick = (lang: 'en' | 'ar') => {
    applyLang(lang);
    void api<SelfUser>('PATCH', '/users/@me', { locale: lang }).then(updateMe).catch(() => {});
  };
  return (
    <>
      <H>{t('settings.language')}</H>
      <p className="mb-6 text-muted">{t('settings.languageSub')}</p>
      <div role="radiogroup" className="flex flex-col gap-2">
        {([['ar', 'العربية', 'Arabic'], ['en', 'English', 'الإنجليزية']] as const).map(([id, name, other]) => (
          <button key={id} type="button" role="radio" aria-checked={i18n.language === id} onClick={() => pick(id)}
            className={cn('flex h-14 items-center justify-between rounded-md border px-4 text-start', i18n.language === id ? 'border-accent bg-mention' : 'border-border bg-surface hover:bg-surface-hover')}>
            <span className="font-semibold">{name}</span>
            <span className="text-sm text-muted">{other}</span>
          </button>
        ))}
      </div>
      <span hidden>{me?.locale}</span>
    </>
  );
}

// ── Voice & audio
function VoiceTab() {
  const { t } = useTranslation();
  const p = usePrefs();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const [level, setLevel] = useState(0);
  const chain = useRef<MicChain | null>(null);

  useEffect(() => {
    const load = () => void navigator.mediaDevices.enumerateDevices().then(setDevices);
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);

  useEffect(() => {
    if (!testing) return;
    let raf = 0;
    let live = true;
    void (async () => {
      const raw = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: p.inputDeviceId !== 'default' ? { ideal: p.inputDeviceId } : undefined, echoCancellation: true, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 },
      });
      if (!live) return raw.getTracks().forEach((x) => x.stop());
      chain.current = await createMicChain(raw, { ...DEFAULT_MIC, ...p.mic, suppression: p.suppression });
      chain.current.setMonitoring(monitor);
      const tick = () => {
        if (chain.current) setLevel(Math.max(0, Math.min(100, ((chain.current.levelDb() + 70) / 70) * 100)));
        raf = requestAnimationFrame(tick);
      };
      tick();
      // DevicesList gains labels once permission is granted
      setDevices(await navigator.mediaDevices.enumerateDevices());
    })().catch(() => setTesting(false));
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      chain.current?.destroy();
      chain.current = null;
      setLevel(0);
    };
    // restart the test when the device or suppression changes
  }, [testing, p.inputDeviceId, p.suppression]); // eslint-disable-line react-hooks/exhaustive-deps

  // live-apply processing changes to the running test
  const micJson = JSON.stringify(p.mic);
  useEffect(() => {
    void chain.current?.update({ ...DEFAULT_MIC, ...p.mic, suppression: p.suppression });
  }, [micJson]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => chain.current?.setMonitoring(monitor), [monitor]);

  const select = (kind: 'audioinput' | 'audiooutput', value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex flex-col gap-2">
      <span className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-sm border border-border-input bg-surface-input px-3 text-text outline-none focus-visible:border-focus">
        <option value="default">{t('settings.default')}</option>
        {devices.filter((d) => d.kind === kind && d.deviceId !== 'default' && d.deviceId).map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <H>{t('settings.voice')}</H>
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          {select('audioinput', p.inputDeviceId, (v) => setPrefs({ inputDeviceId: v }), t('settings.inputDevice'))}
          {select('audiooutput', p.outputDeviceId, (v) => setPrefs({ outputDeviceId: v }), t('settings.outputDevice'))}
        </div>
      </Section>
      <Section title={t('settings.suppression')}>
        <div role="radiogroup" className="flex flex-col gap-2">
          {(['gtcrn', 'rnnoise', 'off'] as Suppression[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={p.suppression === s} onClick={() => void setSuppression(s)}
              className={cn('flex h-12 items-center gap-3 rounded-md border px-4 text-start font-medium', p.suppression === s ? 'border-accent bg-mention' : 'border-border bg-surface hover:bg-surface-hover')}>
              <span className={cn('size-4 rounded-full border-2', p.suppression === s ? 'border-accent bg-accent' : 'border-border-input')} />
              {t(`settings.${s === 'gtcrn' ? 'ai' : s}`)}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('vs.inputMode')}>
        <div role="radiogroup" className="mb-4 flex gap-2">
          {(['vad', 'ptt'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={p.inputMode === m} onClick={() => setPrefs({ inputMode: m })}
              className={cn('h-10 flex-1 rounded-md border font-medium', p.inputMode === m ? 'border-accent bg-mention' : 'border-border bg-surface hover:bg-surface-hover')}>{t(`vs.${m}`)}</button>
          ))}
        </div>
        {p.inputMode === 'ptt' ? (
          <div className="grid gap-4">
            <PttRecorder />
            <Slider label={t('vs.pttRelease')} value={p.pttReleaseMs} min={0} max={1000} step={20} format={(v) => `${v} ms`} onValueChange={(v) => setPrefs({ pttReleaseMs: v })} />
            <p className="text-xs text-faint">{t('vs.pttGlobal')}</p>
          </div>
        ) : (
          <>
            <Slider label={t('vs.sensitivity')} value={p.mic.gate?.openDb ?? DEFAULT_MIC.gate.openDb} min={-90} max={-10} format={(v) => `${v} dB`} level={testing ? level : undefined}
              onValueChange={(v) => setPrefs({ mic: { ...p.mic, gate: { ...DEFAULT_MIC.gate, ...p.mic.gate, enabled: true, openDb: v, closeDb: v - 6 } } })} />
            <p className="mt-1 text-xs text-faint">{t('vs.sensitivitySub')}</p>
          </>
        )}
      </Section>
      <Section title={t('vs.advanced')}>
        <div className="grid gap-4">
          <Switch label={t('vs.echo')} checked={p.echoCancellation} onCheckedChange={(v) => setPrefs({ echoCancellation: v })} />
          <Switch label={t('vs.agc')} checked={p.autoGain} onCheckedChange={(v) => setPrefs({ autoGain: v })} />
          <Switch label={t('vs.highpass')} checked={(p.mic.highpassHz ?? DEFAULT_MIC.highpassHz) > 0} onCheckedChange={(v) => setPrefs({ mic: { ...p.mic, highpassHz: v ? 80 : 0 } })} />
          <Switch label={t('vs.compressor')} checked={p.mic.compressor?.enabled ?? DEFAULT_MIC.compressor.enabled} onCheckedChange={(v) => setPrefs({ mic: { ...p.mic, compressor: { ...DEFAULT_MIC.compressor, ...p.mic.compressor, enabled: v } } })} />
          <Switch label={t('vs.limiter')} checked={p.mic.limiter?.enabled ?? DEFAULT_MIC.limiter.enabled} onCheckedChange={(v) => setPrefs({ mic: { ...p.mic, limiter: { ...DEFAULT_MIC.limiter, ...p.mic.limiter, enabled: v } } })} />
          {(['lowDb', 'midDb', 'highDb'] as const).map((k) => (
            <Slider key={k} label={t(`vs.eq${k === 'lowDb' ? 'Low' : k === 'midDb' ? 'Mid' : 'High'}`)} value={p.mic.eq?.[k] ?? DEFAULT_MIC.eq[k]} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
              onValueChange={(v) => setPrefs({ mic: { ...p.mic, eq: { ...DEFAULT_MIC.eq, ...p.mic.eq, [k]: v } } })} />
          ))}
          <Button variant="ghost" className="self-start" onClick={() => setPrefs({ mic: {} })}>{t('vs.reset')}</Button>
        </div>
      </Section>
      <Section title={t('settings.micTest')}>
        <p className="mb-3 text-sm text-muted">{t('settings.micTestSub')}</p>
        <div className="mb-3 h-3 overflow-hidden rounded-full bg-surface-selected" role="meter" aria-valuenow={Math.round(level)} aria-valuemin={0} aria-valuemax={100} aria-label={t('settings.micTest')}>
          <div className="h-full bg-online transition-[width] duration-75" style={{ width: `${level}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant={testing ? 'danger' : 'primary'} onClick={() => setTesting((x) => !x)}>{testing ? t('settings.stopTest') : t('settings.startTest')}</Button>
          <div className="min-w-56"><Switch label={t('settings.monitor')} checked={monitor} onCheckedChange={setMonitor} disabled={!testing} /></div>
        </div>
      </Section>
    </>
  );
}

function PttRecorder() {
  const { t } = useTranslation();
  const ptt = usePrefs((p) => p.ptt);
  const [rec, setRec] = useState(false);
  useEffect(() => {
    if (!rec) return;
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key !== 'Escape') setPrefs({ ptt: { kind: 'key', code: e.code } });
      setRec(false);
    };
    const mouse = (e: MouseEvent) => {
      // left click cancels; any other button (middle, side buttons) becomes the binding
      if (e.button !== 0) {
        e.preventDefault();
        setPrefs({ ptt: { kind: 'mouse', button: e.button } });
      }
      setRec(false);
    };
    setTimeout(() => {
      addEventListener('keydown', key, { capture: true });
      addEventListener('mousedown', mouse, { capture: true });
    });
    return () => {
      removeEventListener('keydown', key, { capture: true });
      removeEventListener('mousedown', mouse, { capture: true });
    };
  }, [rec]);
  const label = !ptt ? '—' : ptt.kind === 'key' ? ptt.code.replace(/^Key|^Digit/, '') : `Mouse ${ptt.button + 1}`;
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-medium">{t('vs.pttKey')}</span>
      <button type="button" onClick={() => setRec(true)} className={cn('h-10 min-w-40 rounded-md border px-4 font-mono', rec ? 'animate-pulse border-danger text-danger-text' : 'border-border-input bg-surface-input')}>
        {rec ? t('vs.pttRecord') : label}
      </button>
    </div>
  );
}

function AvatarUpload() {
  const { t } = useTranslation();
  const me = useStore((s) => s.me)!;
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const pick = async (f: File) => {
    setBusy(true);
    try {
      const a = await uploadFile(f, () => {}, undefined, 'avatar');
      updateMe(await api<SelfUser>('PATCH', '/users/@me', { avatarFileId: a.id }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative -mt-10 rounded-full border-[6px] border-surface">
      <button type="button" aria-label={t('settings.changeAvatar')} onClick={() => file.current?.click()} className="group relative block rounded-full">
        <Avatar name={me.displayName ?? me.username} src={avatarUrl(me.avatarKey)} size={80} />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60 text-center text-2xs font-bold uppercase text-white opacity-0 transition-opacity group-hover:opacity-100">{busy ? '…' : t('settings.changeAvatar')}</span>
      </button>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
    </div>
  );
}

function WindowsTab() {
  const { t } = useTranslation();
  const p = usePrefs();
  const [auto, setAuto] = useState(false);
  useEffect(() => void window.mncord?.window.getAutostart().then(setAuto), []);
  return (
    <>
      <H>{t('win.title')}</H>
      <Section>
        <div className="grid gap-5">
          <Switch label={t('win.autostart')} description={t('win.autostartSub')} checked={auto} disabled={!window.mncord}
            onCheckedChange={(v) => { setAuto(v); void window.mncord?.window.setAutostart(v); }} />
          <Switch label={t('win.tray')} description={t('win.traySub')} checked={p.closeToTray} onCheckedChange={(v) => setPrefs({ closeToTray: v })} />
          <Switch label={t('win.notifications')} description={t('win.notificationsSub')} checked={p.notifications}
            onCheckedChange={(v) => { setPrefs({ notifications: v }); if (v && typeof Notification !== 'undefined') void Notification.requestPermission(); }} />
        </div>
      </Section>
    </>
  );
}
