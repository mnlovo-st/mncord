import { DevBadge } from '../../ui/DevBadge';
// Settings → Profiles: everything people see on your profile card, with a live preview.
import type { SelfUser } from '@mncord/shared';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { api, ApiError, avatarUrl, uploadFile } from '../api';
import { errorText } from '../i18n';
import { set, useStore } from '../store';

const hex = (n: number | null | undefined) => (n == null ? null : `#${n.toString(16).padStart(6, '0')}`);
const SWATCHES = [0x5a63eb, 0x3ba55d, 0xfaa61a, 0xed4245, 0xeb459e, 0x00a8fc, 0x9b59b6, 0x1abc9c, 0x95a5a6, 0x2f3136];

export function ProfileTab() {
  const { t } = useTranslation();
  const me = useStore((s) => s.me)!;
  const init = { displayName: me.displayName ?? '', pronouns: me.pronouns ?? '', bio: me.bio ?? '', status: me.customStatus?.text ?? '', color: me.accentColor ?? null };
  const [p, setP] = useState(init);
  const [busy, setBusy] = useState<'avatar' | 'banner' | 'save' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const avatarIn = useRef<HTMLInputElement>(null);
  const bannerIn = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(init);
  const fail = (e: unknown) => setMsg({ tone: 'err', text: errorText((e as ApiError).code) });

  const upload = async (kind: 'avatar' | 'banner', f?: File) => {
    if (!f) return;
    setBusy(kind);
    setMsg(null);
    try {
      const a = await uploadFile(f, () => {}, undefined, kind === 'avatar' ? 'avatar' : 'banner');
      set({ me: await api<SelfUser>('PATCH', '/users/@me', kind === 'avatar' ? { avatarFileId: a.id } : { bannerFileId: a.id }) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (kind: 'avatar' | 'banner') => {
    try {
      set({ me: await api<SelfUser>('PATCH', '/users/@me', kind === 'avatar' ? { avatarFileId: null } : { bannerFileId: null }) });
    } catch (e) {
      fail(e);
    }
  };
  const save = async () => {
    setBusy('save');
    setMsg(null);
    try {
      set({
        me: await api<SelfUser>('PATCH', '/users/@me', {
          displayName: p.displayName.trim() || null,
          pronouns: p.pronouns.trim() || null,
          bio: p.bio.trim() || null,
          accentColor: p.color,
          customStatus: p.status.trim() ? { text: p.status.trim(), emoji: me.customStatus?.emoji ?? null } : null,
        }),
      });
      setMsg({ tone: 'ok', text: t('profileEdit.saved') });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const banner = me.bannerKey ? avatarUrl(me.bannerKey) : undefined;
  return (
    <>
      <h1 className="mb-5 font-display text-lg font-semibold">{t('profileEdit.title')}</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          <Input label={t('profileEdit.displayName')} value={p.displayName} maxLength={32} onChange={(e) => setP({ ...p, displayName: e.target.value })} placeholder={me.username} />
          <Input label={t('profileEdit.pronouns')} value={p.pronouns} maxLength={40} onChange={(e) => setP({ ...p, pronouns: e.target.value })} placeholder={t('profileEdit.pronounsHint')} />
          <div>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.avatar')}</p>
            <div className="flex gap-2">
              <Button size="sm" loading={busy === 'avatar'} onClick={() => avatarIn.current?.click()}>{t('profileEdit.changeAvatar')}</Button>
              {me.avatarKey && <Button size="sm" variant="ghost" onClick={() => void remove('avatar')}>{t('profileEdit.remove')}</Button>}
            </div>
            <input ref={avatarIn} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void upload('avatar', e.target.files?.[0])} />
          </div>
          <div>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.banner')}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} loading={busy === 'banner'} onClick={() => bannerIn.current?.click()}>{t('profileEdit.changeBanner')}</Button>
              {me.bannerKey && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove('banner')}>{t('profileEdit.remove')}</Button>}
            </div>
            <input ref={bannerIn} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void upload('banner', e.target.files?.[0])} />
          </div>
          <div>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.color')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button key={c} type="button" aria-label={hex(c)!} onClick={() => setP({ ...p, color: c })} className="size-8 rounded-sm ring-offset-2 ring-offset-bg transition-transform hover:scale-110" style={{ background: hex(c)!, boxShadow: p.color === c ? '0 0 0 2px var(--c-text)' : undefined }} />
              ))}
              <label className="relative grid size-8 cursor-pointer place-items-center rounded-sm border border-border-input text-xs text-muted" title={t('profileEdit.custom')}>
                +
                <input type="color" value={hex(p.color) ?? '#5a63eb'} onChange={(e) => setP({ ...p, color: parseInt(e.target.value.slice(1), 16) })} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              {p.color != null && <button type="button" onClick={() => setP({ ...p, color: null })} className="text-xs text-link hover:underline">{t('profileEdit.default')}</button>}
            </div>
          </div>
          <Input label={t('profileEdit.status')} value={p.status} maxLength={128} onChange={(e) => setP({ ...p, status: e.target.value })} placeholder={t('profileEdit.statusHint')} />
          <label className="flex flex-col gap-2">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.about')}</span>
            <textarea value={p.bio} maxLength={400} rows={4} onChange={(e) => setP({ ...p, bio: e.target.value })} dir="auto" className="resize-none rounded-sm border border-border-input bg-surface-input px-3 py-2 text-text outline-none focus:border-focus" />
            <span className="text-end text-xs text-faint">{p.bio.length}/400</span>
          </label>
          {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={msg.tone === 'err' ? 'text-sm text-danger-text' : 'text-sm text-success'}>{msg.text}</p>}
          <div className="flex gap-2">
            <Button loading={busy === 'save'} disabled={!dirty} onClick={() => void save()}>{t('profileEdit.save')}</Button>
            {dirty && <Button variant="ghost" onClick={() => setP(init)}>{t('profileEdit.reset')}</Button>}
          </div>
        </div>

        {/* live preview, like the card others see */}
        <div>
          <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.preview')}</p>
          <div className="overflow-hidden rounded-lg bg-popover shadow-pop">
            <div className="h-[106px] bg-cover bg-center" style={banner ? { backgroundImage: `url(${banner})` } : { background: hex(p.color) ?? 'linear-gradient(120deg, color-mix(in srgb, var(--c-accent) 55%, #000), color-mix(in srgb, var(--c-text-link) 40%, #000))' }} />
            <div className="px-4 pb-4">
              <div className="-mt-10 mb-2 w-fit rounded-full border-[6px] border-popover">
                <Avatar name={p.displayName || me.username} src={avatarUrl(me.avatarKey)} size={80} status="online" cutout="border-popover" />
              </div>
              <p className="flex items-center gap-2 font-display text-lg font-bold" dir="auto">{p.displayName || me.username}<DevBadge flags={me.flags} size="md" /></p>
              <p className="text-sm text-muted">@{me.username}{p.pronouns ? ` · ${p.pronouns}` : ''}</p>
              {p.status && <p className="mt-2 text-sm" dir="auto">{p.status}</p>}
              {p.bio && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.about')}</p>
                  <p className="whitespace-pre-wrap text-sm" dir="auto">{p.bio}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
