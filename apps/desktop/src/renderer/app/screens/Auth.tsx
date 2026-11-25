// S02 login · S03 register · S04 2FA · S05 reset password
import { ForgotInput, LoginInput, oldEnough, RegisterInput, ResetInput, type AuthTokens, type MfaChallenge } from '@mncord/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import logo from '../../assets/logo-wordmark.webp';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { api, ApiError, storeTokens } from '../api';
import { applyLang, errorText } from '../i18n';

type Mode = 'login' | 'register' | 'mfa' | 'forgot' | 'reset';
type Errors = Partial<Record<'email' | 'login' | 'username' | 'password' | 'dateOfBirth' | 'code' | 'form', string>>;
const device = () => `${window.mncord?.platform === 'win32' ? 'Windows' : (window.mncord?.platform ?? 'Web')} · mncord desktop`;

export function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [ticket, setTicket] = useState('');
  const [f, setF] = useState({ login: '', email: '', username: '', displayName: '', password: '', dateOfBirth: '', code: '' });
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const go = (m: Mode) => {
    setMode(m);
    setErrors({});
    setNotice(null);
    setF((x) => ({ ...x, code: '', password: m === 'reset' ? '' : x.password }));
  };

  /** Server answered either tokens or "now send your 2FA code". */
  async function handleAuth(res: AuthTokens | MfaChallenge) {
    if ('mfaRequired' in res) {
      setTicket(res.ticket);
      go('mfa');
      return;
    }
    await storeTokens(res);
    onSignedIn();
  }

  const fail = (err: unknown) => {
    const e = err as ApiError;
    if (e.field && ['email', 'login', 'username', 'password', 'dateOfBirth', 'code'].includes(e.field)) setErrors({ [e.field]: errorText(e.code) });
    else setErrors({ form: errorText(e.code) });
    if (e.code === 'mfa_ticket_expired') go('login');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      if (mode === 'login') {
        const r = LoginInput.safeParse({ login: f.login, password: f.password, device: device() });
        if (!r.success) return setErrors({ form: errorText('invalid_login') });
        await handleAuth(await api<AuthTokens | MfaChallenge>('POST', '/auth/login', r.data));
      } else if (mode === 'register') {
        const r = RegisterInput.safeParse({ ...f, displayName: f.displayName || undefined, locale: i18n.language, device: device() });
        if (!r.success) {
          const errs: Errors = {};
          for (const issue of r.error.issues) errs[issue.path[0] as keyof Errors] ??= errorText(issue.message);
          return setErrors(errs);
        }
        if (!oldEnough(r.data.dateOfBirth)) return setErrors({ dateOfBirth: errorText('too_young') });
        await handleAuth(await api<AuthTokens>('POST', '/auth/register', r.data));
      } else if (mode === 'mfa') {
        await handleAuth(await api<AuthTokens>('POST', '/auth/mfa', { ticket, code: f.code.trim(), device: device() }));
      } else if (mode === 'forgot') {
        const r = ForgotInput.safeParse({ email: f.email });
        if (!r.success) return setErrors({ email: errorText('email_invalid') });
        await api('POST', '/auth/forgot', r.data);
        go('reset');
        setNotice(t('forgot.codeSent'));
      } else {
        const r = ResetInput.safeParse({ email: f.email, code: f.code, password: f.password, device: device() });
        if (!r.success) {
          const issue = r.error.issues[0];
          return setErrors({ [(issue?.path[0] as keyof Errors) ?? 'form']: errorText(issue?.message) });
        }
        await handleAuth(await api<AuthTokens | MfaChallenge>('POST', '/auth/reset', r.data));
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, [string, string]> = {
    login: [t('auth.welcome'), t('auth.welcomeSub')],
    register: [t('auth.create'), t('auth.createSub')],
    mfa: [t('mfa.title'), t('mfa.sub')],
    forgot: [t('forgot.title'), t('forgot.sub')],
    reset: [t('forgot.title'), notice ?? ''],
  };
  const pw = { showLabel: t('auth.showPassword'), hideLabel: t('auth.hidePassword') };

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-bg-deep p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,color-mix(in_srgb,var(--c-accent)_14%,transparent),transparent_55%),radial-gradient(ellipse_at_80%_90%,color-mix(in_srgb,var(--c-text-link)_12%,transparent),transparent_50%)]" />
      <button
        type="button"
        onClick={() => applyLang(i18n.language === 'ar' ? 'en' : 'ar')}
        className="absolute end-4 top-4 rounded-sm bg-surface-raised px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-selected"
      >
        {i18n.language === 'ar' ? 'English' : 'العربية'}
      </button>
      <main key={mode} className="anim-pop relative w-full max-w-[480px] rounded-lg bg-bg p-8 shadow-modal">
        <img src={logo} alt="mnlovo" className="logo-blend mx-auto mb-6 h-8 w-auto" />
        <h1 className="text-center font-display text-xl font-bold">{titles[mode][0]}</h1>
        <p className="mb-6 mt-1 text-center text-muted">{titles[mode][1]}</p>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {mode === 'login' && (
            <>
              <Input label={t('auth.login')} value={f.login} onChange={upd('login')} autoComplete="username" autoFocus required />
              <Input label={t('auth.password')} variant="password" value={f.password} onChange={upd('password')} autoComplete="current-password" required {...pw} />
              <Button variant="link" className="-mt-2 self-start text-sm" onClick={() => { setF((x) => ({ ...x, email: x.login.includes('@') ? x.login : '' })); go('forgot'); }}>{t('auth.forgot')}</Button>
            </>
          )}
          {mode === 'register' && (
            <>
              <Input label={t('auth.email')} type="email" value={f.email} onChange={upd('email')} error={errors.email} autoComplete="email" autoFocus required />
              <Input label={t('auth.displayName')} value={f.displayName} onChange={upd('displayName')} maxLength={32} />
              <Input label={t('auth.username')} value={f.username} onChange={upd('username')} error={errors.username} hint={t('auth.usernameHint')} autoComplete="username" dir="ltr" required />
              <Input label={t('auth.password')} variant="password" value={f.password} onChange={upd('password')} error={errors.password} autoComplete="new-password" required {...pw} />
              <Input label={t('auth.dob')} type="date" value={f.dateOfBirth} onChange={upd('dateOfBirth')} error={errors.dateOfBirth} max={new Date().toISOString().slice(0, 10)} required />
            </>
          )}
          {mode === 'mfa' && (
            <>
              <Input label={t('mfa.code')} value={f.code} onChange={upd('code')} error={errors.code} inputMode="numeric" autoComplete="one-time-code" autoFocus dir="ltr" maxLength={9} className="[&_input]:text-center [&_input]:font-mono [&_input]:text-xl [&_input]:tracking-[0.3em]" />
              <p className="text-xs text-faint">{t('mfa.backupHint')}</p>
            </>
          )}
          {mode === 'forgot' && <Input label={t('auth.email')} type="email" value={f.email} onChange={upd('email')} error={errors.email} autoComplete="email" autoFocus required />}
          {mode === 'reset' && (
            <>
              <Input label={t('forgot.code')} value={f.code} onChange={upd('code')} error={errors.code} inputMode="numeric" autoComplete="one-time-code" autoFocus dir="ltr" maxLength={6} />
              <Input label={t('forgot.newPassword')} variant="password" value={f.password} onChange={upd('password')} error={errors.password} autoComplete="new-password" required {...pw} />
            </>
          )}
          {errors.form && <p role="alert" className="rounded-sm bg-danger-solid/15 px-3 py-2 text-sm text-danger-text">{errors.form}</p>}
          <Button type="submit" size="lg" loading={busy} className="w-full justify-center">
            {{ login: t('auth.signIn'), register: t('auth.signUp'), mfa: t('mfa.verify'), forgot: t('forgot.send'), reset: t('forgot.reset') }[mode]}
          </Button>
          {mode === 'register' && <p className="text-xs text-faint">{t('auth.terms')}</p>}
          {(mode === 'login' || mode === 'register') && (
            <p className="text-sm text-muted">
              {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
              <Button variant="link" className="text-sm" onClick={() => go(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? t('auth.register') : t('auth.toLogin')}
              </Button>
            </p>
          )}
          {(mode === 'mfa' || mode === 'forgot' || mode === 'reset') && (
            <Button variant="link" className="self-start text-sm" onClick={() => go('login')}>{t('mfa.back')}</Button>
          )}
        </form>
      </main>
    </div>
  );
}
