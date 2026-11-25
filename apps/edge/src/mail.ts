// Outgoing email. Production: Gmail (app password) over SMTPS port 465 using Workers TCP sockets
// (SMTP_URL = smtps://user%40gmail.com:app-password@smtp.gmail.com:465). Dev/tests: kept in dev_outbox.
import { env } from './config.ts';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let devDb: { query: (sql: string, params?: unknown[]) => Promise<unknown> } | null = null;
/** the Hub registers its database so dev mail lands in a table tests can read */
export const setMailDb = (db: typeof devDb) => void (devDb = db);

function smtpSettings(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || (u.protocol === 'smtps:' ? 465 : 587)),
    secure: u.protocol === 'smtps:',
    startTls: u.protocol !== 'smtps:',
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}
const parseFrom = (from: string) => {
  const m = /^(.*)<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1]!.trim(), email: m[2]!.trim() } : { name: 'mncord', email: from.trim() };
};

export async function sendMail(m: Mail) {
  const e = env();
  if (e.SMTP_URL && e.DEV_TOOLS !== '1') {
    const s = smtpSettings(e.SMTP_URL);
    const { WorkerMailer } = await import('worker-mailer');
    await WorkerMailer.send(
      { host: s.host, port: s.port, secure: s.secure, startTls: s.startTls, authType: 'plain', credentials: { username: s.username, password: s.password } },
      { from: parseFrom(e.MAIL_FROM ?? `mncord <${s.username}>`), to: { email: m.to }, subject: m.subject, text: m.text, html: m.html },
    );
    return;
  }
  if (e.DEV_TOOLS !== '1') throw new Error('SMTP_URL not configured');
  await devDb?.query(`insert into dev_outbox (recipient, subject, body, html) values ($1, $2, $3, $4)`, [m.to, m.subject, m.text, m.html]);
}

// ── templates (en / ar), plain and simple so they survive every mail client
type Locale = 'en' | 'ar';
const wrap = (locale: Locale, body: string) =>
  `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><body style="margin:0;background:#0a0e16;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#e8edf6">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px"><div style="font-size:20px;font-weight:700;letter-spacing:.5px;margin-bottom:24px">mncord</div>${body}
  <p style="color:#8a96ae;font-size:12px;margin-top:32px">© mnlovo</p></div></body></html>`;
const codeBlock = (code: string) => `<div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#161d2c;border-radius:8px;padding:16px;text-align:center;direction:ltr">${code}</div>`;

export const templates = {
  verify: (locale: Locale, code: string): Omit<Mail, 'to'> =>
    locale === 'ar'
      ? { subject: `رمز تأكيد بريدك في mncord: ${code}`, text: `رمز التأكيد: ${code}\nينتهي خلال 15 دقيقة.`, html: wrap(locale, `<p>أدخل هذا الرمز في mncord لتأكيد بريدك الإلكتروني:</p>${codeBlock(code)}<p style="color:#a3aec4">ينتهي خلال 15 دقيقة. إن لم تطلبه فتجاهل هذه الرسالة.</p>`) }
      : { subject: `Your mncord verification code: ${code}`, text: `Verification code: ${code}\nIt expires in 15 minutes.`, html: wrap(locale, `<p>Enter this code in mncord to verify your email:</p>${codeBlock(code)}<p style="color:#a3aec4">It expires in 15 minutes. If you didn't ask for it, ignore this email.</p>`) },
  reset: (locale: Locale, code: string): Omit<Mail, 'to'> =>
    locale === 'ar'
      ? { subject: `رمز إعادة تعيين كلمة المرور: ${code}`, text: `رمز إعادة التعيين: ${code}\nينتهي خلال 15 دقيقة.`, html: wrap(locale, `<p>طلب أحدهم إعادة تعيين كلمة مرور حسابك. أدخل هذا الرمز في mncord:</p>${codeBlock(code)}<p style="color:#a3aec4">إن لم تكن أنت فتجاهل هذه الرسالة؛ كلمة مرورك لم تتغير.</p>`) }
      : { subject: `Your mncord password reset code: ${code}`, text: `Reset code: ${code}\nIt expires in 15 minutes.`, html: wrap(locale, `<p>Someone asked to reset your password. Enter this code in mncord:</p>${codeBlock(code)}<p style="color:#a3aec4">If it wasn't you, ignore this email. Your password hasn't changed.</p>`) },
  newDevice: (locale: Locale, device: string): Omit<Mail, 'to'> =>
    locale === 'ar'
      ? { subject: 'تسجيل دخول جديد إلى حسابك في mncord', text: `تم تسجيل الدخول من جهاز جديد: ${device}. إن لم تكن أنت فغيّر كلمة المرور فورًا.`, html: wrap(locale, `<p>تم تسجيل الدخول إلى حسابك من جهاز جديد:</p><p style="font-weight:600">${device}</p><p style="color:#a3aec4">إن لم تكن أنت فغيّر كلمة المرور فورًا وأنهِ الجلسات من الإعدادات ← الأجهزة.</p>`) }
      : { subject: 'New sign-in to your mncord account', text: `New sign-in from: ${device}. If this wasn't you, change your password now.`, html: wrap(locale, `<p>Your account was just signed in from a new device:</p><p style="font-weight:600">${device}</p><p style="color:#a3aec4">If this wasn't you, change your password now and sign out other sessions in Settings → Devices.</p>`) },
  passwordChanged: (locale: Locale): Omit<Mail, 'to'> =>
    locale === 'ar'
      ? { subject: 'تم تغيير كلمة مرور mncord', text: 'تم تغيير كلمة مرور حسابك. إن لم تكن أنت فأعد تعيينها فورًا.', html: wrap(locale, `<p>تم تغيير كلمة مرور حسابك وتسجيل الخروج من الأجهزة الأخرى.</p><p style="color:#a3aec4">إن لم تكن أنت فأعد تعيين كلمة المرور فورًا.</p>`) }
      : { subject: 'Your mncord password was changed', text: 'Your password was changed. If this wasn\'t you, reset it now.', html: wrap(locale, `<p>Your password was changed and other devices were signed out.</p><p style="color:#a3aec4">If this wasn't you, reset your password now.</p>`) },
};

/** Escape anything user-controlled before it goes into HTML mail. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
