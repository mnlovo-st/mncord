// S24 user settings (full screen) · S25 voice settings
import { ApprovalsTab, usePending } from './Approvals';
import { ProfileTab, usePictureUpload } from './ProfileTab';
import type { SelfUser, SessionInfo } from '@mncord/shared';
import { Bell, Check, ChevronRight, Copy, Crown, Gamepad2, Globe, Laptop, LogOut, Mic, Monitor, Palette, Search, ShieldCheck, Smartphone, Sparkles, Trash2, User, UserCog, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createMicChain, createRawMic, DEFAULT_MIC, withDefaults, type MicChain, type Suppression } from '../../media/micChain';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Switch';
import { cn } from '../../ui/cn';
import { api, ApiError, avatarUrl, signOut } from '../api';
import { applyLang, errorText } from '../i18n';
import { setPrefs, usePrefs } from '../prefs';
import { set, useStore } from '../store';
import { setSuppression } from '../voice';
import { currentGame, KNOWN_GAMES } from '../activity';
import { playSound, SOUND_NAMES, type SoundName } from '../sounds';
import { inputProfileOf, setInputProfile, type InputProfile } from './AudioMenus';

export type Tab = 'account' | 'profile' | 'security' | 'devices' | 'appearance' | 'language' | 'voice' | 'notifications' | 'windows' | 'activity' | 'games' | 'approvals';

export function SettingsScreen({ onClose, initialTab = 'account' }: { onClose: () => void; initialTab?: Tab }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState('');
  const me = useStore((s) => s.me);
  const isOwner = !!me?.isOwner;
  const pending = usePending((s) => s.count);
  const [version, setVersion] = useState('');
  useEffect(() => void window.mncord?.app?.version().then(setVersion), []);
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=dialog][data-state=open], [role=alertdialog]') && onClose(); // our own full-screen panel is a dialog too: only a modal on top of it blocks Esc
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const I = (C: typeof User) => <C aria-hidden className="size-[18px] shrink-0" />;
  const nav: [string, [Tab, string, ReactNode][]][] = [
    [t('settings.user'), [['account', t('settings.account'), I(User)], ['profile', t('profileEdit.title'), I(UserCog)], ['security', t('settings.security'), I(ShieldCheck)], ['devices', t('settings.devices'), I(Laptop)]]],
    [t('settings.app'), [['voice', t('settings.voice'), I(Mic)], ['notifications', t('settings.notifications'), I(Bell)], ['appearance', t('settings.appearance'), I(Palette)], ['language', t('settings.language'), I(Globe)], ['windows', t('win.title'), I(Monitor)]]],
    [t('settings.activityGroup'), [['activity', t('settings.activityPrivacy'), I(Sparkles)], ['games', t('settings.games'), I(Gamepad2)]]],
    ...(isOwner ? ([[t('approvals.group'), [['approvals', pending ? `${t('approvals.title')} (${pending})` : t('approvals.title'), I(Crown)]]]] as [string, [Tab, string, ReactNode][]][]) : []),
  ];
  const filtered = q.trim() ? nav.map(([g, items]) => [g, items.filter(([, label]) => label.toLowerCase().includes(q.trim().toLowerCase()))] as [string, [Tab, string, ReactNode][]]).filter(([, items]) => items.length) : nav;

  return (
    <div role="dialog" aria-modal="true" aria-label={t('settings.title')} className="anim-fade fixed inset-0 z-40 flex bg-bg">
      <nav className="flex w-[min(320px,35vw)] shrink-0 justify-end overflow-y-auto bg-surface pb-6 pt-8 pe-2">
        <div className="flex w-[232px] flex-col">
          {me && (
            <button type="button" onClick={() => setTab('profile')} className="mb-3 flex items-center gap-3 rounded-md p-2 text-start hover:bg-surface-hover">
              <Avatar name={me.displayName ?? me.username} src={avatarUrl(me.avatarKey)} size={40} decoration={me.style?.decoration} />
              <span className="min-w-0">
                <span className="block truncate font-display font-bold">{me.displayName ?? me.username}</span>
                <span className="block text-xs text-muted">{t('settings.editProfiles')} ✎</span>
              </span>
            </button>
          )}
          <label className="mb-3 flex h-9 items-center gap-2 rounded-md border border-border bg-bg-deep/60 px-2.5 text-muted focus-within:border-focus">
            <Search aria-hidden className="size-4" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('settings.search')} aria-label={t('settings.search')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-faint" />
          </label>
          {filtered.map(([group, items]) => (
            <div key={group} className="mb-3 border-b border-border pb-3 last:border-0">
              <h2 className="px-2.5 pb-1.5 text-xs font-semibold text-faint">{group}</h2>
              {items.map(([id, label, icon]) => (
                <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
                  className={cn('mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start text-[15px] font-medium transition-colors', tab === id ? 'bg-surface-selected text-text' : 'text-muted hover:bg-surface-hover hover:text-text')}>
                  {icon}{label}
                </button>
              ))}
            </div>
          ))}
          <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start text-[15px] font-medium text-danger-text hover:bg-surface-hover">
            <LogOut className="size-[18px] rtl:-scale-x-100" /> {t('settings.logout')}
          </button>
          <p className="mt-4 px-2.5 text-2xs leading-relaxed text-faint">mncord {version ? `v${version}` : ''} · Windows<br />© mnlovo</p>
        </div>
      </nav>
      <div className="relative min-w-0 flex-1 overflow-y-auto px-10 py-14">
        <div className="max-w-[740px]">
          {tab === 'account' && <AccountTab go={setTab} />}
          {tab === 'profile' && <ProfileTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'devices' && <DevicesTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'language' && <LanguageTab />}
          {tab === 'voice' && <VoiceTab />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'windows' && <WindowsTab />}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'games' && <GamesTab />}
          {tab === 'approvals' && <ApprovalsTab />}
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
function AccountTab({ go }: { go: (t: Tab) => void }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me)!;
  const [edit, setEdit] = useState<'username' | 'email' | 'password' | 'verify' | null>(null);
  const [reveal, setReveal] = useState(false);
  const [mfa, setMfa] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  useEffect(() => {
    void api<{ enabled: boolean }>('GET', '/users/@me/mfa').then((r) => setMfa(r.enabled)).catch(() => {});
    void api<SessionInfo[]>('GET', '/users/@me/sessions').then((r) => setDevices(r.length)).catch(() => {});
  }, []);
  const masked = me.email.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => `${a}${'*'.repeat(Math.max(4, b.length))}${c}`);

  const Row = ({ label, value, onEdit, extra, chevron, onClick }: { label: string; value?: ReactNode; onEdit?: () => void; extra?: ReactNode; chevron?: boolean; onClick?: () => void }) => (
    <div className={cn('flex min-h-14 items-center justify-between gap-4 py-2', onClick && 'cursor-pointer')} onClick={onClick}>
      <p className="font-medium text-text">{label}</p>
      <div className="flex min-w-0 items-center gap-3">
        {value !== undefined && <span className="truncate text-muted" dir="auto">{value}</span>}
        {extra}
        {onEdit && <Button variant="secondary" size="sm" className="min-w-[72px] justify-center" onClick={onEdit}>{t('settings.edit')}</Button>}
        {chevron && <ChevronRight className="size-5 text-muted rtl:-scale-x-100" />}
      </div>
    </div>
  );

  return (
    <>
      <H>{t('settings.account')}</H>
      <div className="mb-8 overflow-hidden rounded-xl bg-surface">
        <div className="h-24 bg-cover bg-center" style={me.bannerKey ? { backgroundImage: `url(${avatarUrl(me.bannerKey)})` } : { background: me.accentColor != null ? `#${me.accentColor.toString(16).padStart(6, '0')}` : 'linear-gradient(120deg,color-mix(in srgb,var(--c-accent) 55%,#000),color-mix(in srgb,var(--c-text-link) 45%,#000))' }} />
        <div className="flex items-end gap-4 px-4 pb-4">
          <AvatarUpload />
          <div className="min-w-0 flex-1 pb-1">
            <p className="truncate font-display text-xl font-bold">{me.displayName ?? me.username}</p>
            <p className="text-sm text-muted">{me.username}</p>
          </div>
          <Button size="sm" className="mb-1" onClick={() => go('profile')}>{t('settings.editProfile')}</Button>
        </div>
      </div>

      <h2 className="mb-1 font-display text-lg font-semibold">{t('settings.accountInfo')}</h2>
      <div className="mb-8 divide-y divide-border">
        <Row label={t('settings.username')} value={me.username} onEdit={() => setEdit('username')} />
        <Row label={t('settings.email')} value={reveal ? me.email : masked} onEdit={() => setEdit('email')}
          extra={<>
            <button type="button" onClick={() => setReveal((r) => !r)} className="text-sm font-medium text-link hover:underline">{reveal ? t('settings.hide') : t('settings.reveal')}</button>
            {me.emailVerified ? <span className="text-xs font-semibold text-success">✓ {t('settings.verified')}</span> : <button type="button" onClick={() => setEdit('verify')} className="text-xs font-semibold text-warning hover:underline">{t('settings.unverified')}</button>}
          </>} />
      </div>

      <h2 className="mb-1 font-display text-lg font-semibold">{t('settings.passwordSecurity')}</h2>
      <div className="mb-8 divide-y divide-border">
        <Row label={t('settings.password')} onEdit={() => setEdit('password')} />
        <Row label={t('settings.mfaTitle')} value={mfa === null ? '…' : mfa ? t('settings.enabled') : t('settings.disabled')} chevron onClick={() => go('security')} />
        <Row label={t('settings.devices')} value={devices === null ? '…' : t('settings.devicesCount', { count: devices })} chevron onClick={() => go('devices')} />
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold">{t('settings.accountStatus')}</h2>
      <div className="mb-8 flex items-center gap-4 rounded-xl bg-surface p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success/15 text-success"><Check className="size-6" strokeWidth={3} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t('settings.standing')}</p>
          <p className="text-sm text-muted">{t('settings.standingSub')}</p>
        </div>
        <span className="font-semibold text-text">{t('settings.allGood')}</span>
      </div>

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
        audio: p.rawMic
          ? { deviceId: p.inputDeviceId !== 'default' ? { ideal: p.inputDeviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 }
          : { deviceId: p.inputDeviceId !== 'default' ? { ideal: p.inputDeviceId } : undefined, echoCancellation: p.echoCancellation, noiseSuppression: false, autoGainControl: p.autoGain, channelCount: 1, sampleRate: 48000 },
      });
      if (!live) return raw.getTracks().forEach((x) => x.stop());
      chain.current = p.rawMic ? await createRawMic(raw) : await createMicChain(raw, withDefaults(p.mic, p.suppression));
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
  }, [testing, p.inputDeviceId, p.suppression, p.rawMic, p.echoCancellation, p.autoGain]); // eslint-disable-line react-hooks/exhaustive-deps

  // live-apply processing changes to the running test
  const micJson = JSON.stringify(p.mic);
  useEffect(() => {
    void chain.current?.update(withDefaults(p.mic, p.suppression));
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
      <Section title={t('am.inputProfile')}>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
          {(['isolation', 'studio', 'custom'] as InputProfile[]).map((x) => {
            const on = inputProfileOf(p) === x;
            return (
              <button key={x} type="button" role="radio" aria-checked={on} onClick={() => setInputProfile(x)}
                className={cn('rounded-lg border p-3 text-start transition-colors', on ? 'border-accent bg-mention' : 'border-border bg-surface hover:bg-surface-hover')}>
                <span className="block font-semibold">{t(`am.profile.${x}`)}</span>
                <span className="mt-1 block text-xs text-muted">{t(`am.profile.${x}Sub`)}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={t('settings.volumes')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider label={t('am.inputVolume')} value={Math.round(10 ** ((p.mic.inputGainDb ?? 0) / 20) * 100)} min={0} max={200} step={5} format={(v) => `${v}%`}
            onValueChange={(v) => setPrefs({ mic: { ...p.mic, inputGainDb: v <= 0 ? -60 : Math.round(20 * Math.log10(v / 100) * 10) / 10 } })} />
          <Slider label={t('am.outputVolume')} value={p.outputVolume} min={0} max={200} step={5} format={(v) => `${v}%`} onValueChange={(v) => setPrefs({ outputVolume: v })} />
        </div>
      </Section>
      <Section title={t('settings.suppression')}>
        <div role="radiogroup" className={cn('flex flex-col gap-2', p.rawMic && 'pointer-events-none opacity-40')}>
          {(['rnnoise', 'gtcrn', 'max', 'off'] as Suppression[]).map((x) => (
            <button key={x} type="button" role="radio" aria-checked={p.suppression === x} onClick={() => void setSuppression(x)}
              className={cn('flex items-center gap-3 rounded-lg border px-4 py-3 text-start', p.suppression === x ? (x === 'max' ? 'border-warning bg-warning/10' : 'border-accent bg-mention') : 'border-border bg-surface hover:bg-surface-hover')}>
              <span className={cn('size-4 shrink-0 rounded-full border-2', p.suppression === x ? (x === 'max' ? 'border-warning bg-warning' : 'border-accent bg-accent') : 'border-border-input')} />
              <span className="min-w-0">
                <span className="block font-medium">{t(`settings.sup.${x}`)}</span>
                <span className="block text-xs text-muted">{t(`settings.sup.${x}Sub`)}</span>
              </span>
            </button>
          ))}
        </div>
        {p.suppression === 'max' && !p.rawMic && (
          <div role="alert" className="mt-3 flex gap-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
            <span aria-hidden className="text-lg leading-none">⚠️</span>
            <p><b className="text-warning">{t('settings.sup.maxWarnTitle')}</b><br /><span className="text-muted">{t('settings.sup.maxWarn')}</span></p>
          </div>
        )}
        <div className={cn('mt-4', p.rawMic && 'pointer-events-none opacity-40')}>
          <Switch label={t('vs.loudProtect')} description={t('vs.loudProtectSub')} checked={p.mic.loudProtect ?? true} onCheckedChange={(v) => setPrefs({ mic: { ...p.mic, loudProtect: v } })} />
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
              onValueChange={(v) => setPrefs({ mic: { ...p.mic, gate: { ...DEFAULT_MIC.gate, ...p.mic.gate, enabled: true, openDb: v, closeDb: v - 10 } } })} />
            <p className="mt-1 text-xs text-faint">{t('vs.sensitivitySub')}</p>
          </>
        )}
      </Section>
      <Section title={t('vs.advanced')}>
        <div className="grid gap-4">
          <div className="rounded-md border border-accent/40 bg-mention p-3">
            <Switch label={t('vs.raw')} description={t('vs.rawSub')} checked={p.rawMic} onCheckedChange={(v) => setPrefs({ rawMic: v })} />
          </div>
          <div className={cn('grid gap-4', p.rawMic && 'pointer-events-none opacity-40')} aria-disabled={p.rawMic}>
          <Switch label={t('vs.echo')} checked={p.echoCancellation} onCheckedChange={(v) => setPrefs({ echoCancellation: v })} />
          <Switch label={t('vs.agc')} checked={p.autoGain} onCheckedChange={(v) => setPrefs({ autoGain: v })} />
          <Switch label={t('vs.highpass')} checked={(p.mic.highpassHz ?? DEFAULT_MIC.highpassHz) > 0} onCheckedChange={(v) => setPrefs({ mic: { ...p.mic, highpassHz: v ? 80 : 0 } })} />
          <Switch label={t('vs.compressor')} checked={p.mic.compressor?.enabled ?? DEFAULT_MIC.compressor.enabled} onCheckedChange={(v) => setPrefs({ mic: { ...p.mic, compressor: { ...DEFAULT_MIC.compressor, ...p.mic.compressor, enabled: v } } })} />
          <Switch label={t('vs.limiter')} checked={p.mic.limiter?.enabled ?? DEFAULT_MIC.limiter.enabled} onCheckedChange={(v) => setPrefs({ mic: { ...p.mic, limiter: { ...DEFAULT_MIC.limiter, ...p.mic.limiter, enabled: v } } })} />
          <Switch label={t('vs.gate')} description={t('vs.gateSub')} checked={p.mic.gate?.enabled ?? DEFAULT_MIC.gate.enabled} onCheckedChange={(v) => setPrefs({ mic: { ...p.mic, gate: { ...DEFAULT_MIC.gate, ...p.mic.gate, enabled: v } } })} />
          </div>
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
  const file = useRef<HTMLInputElement>(null);
  const pics = usePictureUpload(() => {});
  return (
    <div className="relative -mt-10 rounded-full border-[6px] border-surface">
      <button type="button" aria-label={t('settings.changeAvatar')} onClick={() => file.current?.click()} className="group relative block rounded-full">
        <Avatar name={me.displayName ?? me.username} src={avatarUrl(me.avatarKey)} size={80} decoration={me.style?.decoration} />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60 text-center text-2xs font-bold uppercase text-white opacity-0 transition-opacity group-hover:opacity-100">{pics.busy ? '…' : t('settings.changeAvatar')}</span>
      </button>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pics.pick('avatar', e.target.files?.[0]); e.target.value = ''; }} />
      {pics.cropper}
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
        </div>
      </Section>
    </>
  );
}

// ── Notifications: desktop notifications + app sounds (volume and each sound on/off)
function NotificationsTab() {
  const { t } = useTranslation();
  const p = usePrefs();
  const toggle = (n: SoundName, on: boolean) => setPrefs({ mutedSounds: on ? p.mutedSounds.filter((x) => x !== n) : [...p.mutedSounds, n] });
  return (
    <>
      <H>{t('settings.notifications')}</H>
      <Section>
        <Switch label={t('win.notifications')} description={t('win.notificationsSub')} checked={p.notifications}
          onCheckedChange={(v) => { setPrefs({ notifications: v }); if (v && typeof Notification !== 'undefined') void Notification.requestPermission(); }} />
      </Section>
      <Section title={t('sounds.title')}>
        <Slider label={t('sounds.volume')} value={p.soundVolume} min={0} max={100} step={5} format={(v) => `${v}%`} onValueChange={(v) => setPrefs({ soundVolume: v })} />
        <p className="mb-4 mt-1 text-xs text-faint">{t('sounds.volumeSub')}</p>
        <div className="divide-y divide-border rounded-lg bg-surface px-4">
          {SOUND_NAMES.map((n) => (
            <div key={n} className="flex items-center justify-between gap-3 py-2.5">
              <button type="button" onClick={() => playSound(n)} className="shrink-0 text-sm font-medium text-link hover:underline">{t('sounds.preview')}</button>
              <div className="flex-1"><Switch label={t(`sounds.n.${n}`)} checked={!p.mutedSounds.includes(n)} onCheckedChange={(on) => toggle(n, on)} /></div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

// ── Activity Privacy: share "Playing …" with friends and servers
function ActivityTab() {
  const { t } = useTranslation();
  const p = usePrefs();
  return (
    <>
      <H>{t('settings.activityPrivacy')}</H>
      <Section>
        <Switch label={t('activity.share')} description={t('activity.shareSub')} checked={p.shareActivity} onCheckedChange={(v) => setPrefs({ shareActivity: v })} />
      </Section>
      <p className="text-sm text-faint">{t('activity.privacyNote')}</p>
    </>
  );
}

// ── Registered Games: what we detect, plus your own additions
function GamesTab() {
  const { t } = useTranslation();
  const p = usePrefs();
  const [running, setRunning] = useState<string[]>([]);
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  const [now, setNow] = useState(currentGame());
  useEffect(() => {
    const load = () => {
      void window.mncord?.games?.running().then((r) => setRunning(r.filter((x) => x.endsWith('.exe')).sort()));
      setNow(currentGame());
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);
  const add = () => {
    if (!pick || !name.trim()) return;
    setPrefs({ customGames: { ...p.customGames, [pick]: name.trim().slice(0, 64) }, hiddenGames: p.hiddenGames.filter((x) => x !== pick) });
    setPick('');
    setName('');
  };
  const remove = (exe: string) => {
    const next = { ...p.customGames };
    delete next[exe];
    setPrefs({ customGames: next });
  };
  return (
    <>
      <H>{t('settings.games')}</H>
      <div className={cn('mb-6 flex items-center gap-4 rounded-xl p-4', now ? 'bg-success/10' : 'bg-surface')}>
        <span className={cn('grid size-12 place-items-center rounded-lg', now ? 'bg-success/20 text-success' : 'bg-surface-raised text-faint')}><Gamepad2 className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{now ? now.name : t('games.none')}</p>
          <p className="text-sm text-muted">{now ? t('games.playingNow') : t('games.noneSub')}</p>
        </div>
        {now && <Button size="sm" variant="ghost" onClick={() => setPrefs({ hiddenGames: [...p.hiddenGames, now.exe] })}>{t('games.hide')}</Button>}
      </div>
      <Section title={t('games.add')}>
        <p className="mb-3 text-sm text-muted">{t('games.addSub')}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select value={pick} onChange={(e) => { setPick(e.target.value); setName(KNOWN_GAMES[e.target.value] ?? e.target.value.replace(/\.exe$/, '')); }} aria-label={t('games.program')} className="h-10 rounded-sm border border-border-input bg-surface-input px-3 text-text">
            <option value="">{t('games.program')}</option>
            {running.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={t('games.name')} aria-label={t('games.name')} dir="auto" className="h-10 rounded-sm border border-border-input bg-surface-input px-3 text-text outline-none focus:border-focus" />
          <Button disabled={!pick || !name.trim()} onClick={add}>{t('games.addBtn')}</Button>
        </div>
      </Section>
      {Object.keys(p.customGames).length > 0 && (
        <Section title={t('games.yours')}>
          <ul className="divide-y divide-border rounded-lg bg-surface px-4">
            {Object.entries(p.customGames).map(([exe, n]) => (
              <li key={exe} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="block font-medium" dir="auto">{n}</span><span className="block text-xs text-faint">{exe}</span></span>
                <button type="button" aria-label={t('common.delete')} onClick={() => remove(exe)} className="text-faint hover:text-danger-text"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {p.hiddenGames.length > 0 && (
        <Section title={t('games.hidden')}>
          <div className="flex flex-wrap gap-2">
            {p.hiddenGames.map((exe) => (
              <button key={exe} type="button" onClick={() => setPrefs({ hiddenGames: p.hiddenGames.filter((x) => x !== exe) })} className="rounded-full bg-surface px-3 py-1 text-sm text-muted hover:text-text">{KNOWN_GAMES[exe] ?? exe} ✕</button>
            ))}
          </div>
        </Section>
      )}
      <p className="text-xs text-faint">{t('games.knownCount', { count: Object.keys(KNOWN_GAMES).length })}</p>
    </>
  );
}
