// Owner only: accounts waiting for a one-time approval.
import { Check, UserCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { api, ApiError } from '../api';
import { errorText } from '../i18n';
import { playSound } from '../sounds';

interface Pending { id: string; username: string; displayName: string | null; email: string; createdAt: string; verified: boolean }
export const usePending = create<{ count: number }>(() => ({ count: 0 }));

export async function refreshPending() {
  const list = await api<Pending[]>('GET', '/admin/pending').catch(() => null);
  if (list) usePending.setState({ count: list.filter((p) => p.verified).length });
  return list;
}

/** gateway: someone verified their email and is waiting for the owner */
export function onApprovalRequest(d: { username: string; displayName: string | null }) {
  usePending.setState((s) => ({ count: s.count + 1 }));
  playSound('mention');
  try {
    const ar = document.documentElement.lang === 'ar';
    new Notification(ar ? 'حساب جديد بانتظار موافقتك' : 'New account waiting for approval', { body: d.displayName ? `${d.displayName} (@${d.username})` : `@${d.username}`, silent: true });
  } catch {
    /* notifications off */
  }
}

export function ApprovalsTab() {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<Pending[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => setList((await refreshPending()) ?? []);
  useEffect(() => {
    void load();
  }, []);
  const act = async (id: string, kind: 'approve' | 'decline') => {
    setErr(null);
    try {
      await api('POST', `/admin/users/${id}/${kind}`, {});
      await load();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    }
  };
  const fmt = new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section>
      <h1 className="mb-1 font-display text-xl font-bold">{t('approvals.title')}</h1>
      <p className="mb-6 text-sm text-muted">{t('approvals.sub')}</p>
      {err && <p role="alert" className="mb-3 text-sm text-danger-text">{err}</p>}
      {list === null ? (
        <div className="h-16 animate-pulse rounded-md bg-surface-raised" />
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-14 text-muted">
          <UserCheck className="size-8 text-faint" aria-hidden />
          <p>{t('approvals.empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-md bg-surface-raised px-4 py-3">
              <Avatar name={u.displayName ?? u.username} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{u.displayName ?? u.username} <span className="font-normal text-muted">@{u.username}</span></p>
                <p className="truncate text-xs text-faint">{u.email} · {fmt.format(new Date(u.createdAt))} · {u.verified ? t('approvals.verified') : t('approvals.unverified')}</p>
              </div>
              <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => void act(u.id, 'decline')}>{t('approvals.decline')}</Button>
              <Button size="sm" icon={<Check className="size-4" />} disabled={!u.verified} onClick={() => void act(u.id, 'approve')}>{t('approvals.approve')}</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
