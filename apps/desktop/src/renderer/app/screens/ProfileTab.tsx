// Settings → Profiles: everything people see on your profile card, with a live preview. Pictures go through
// a crop/zoom step first (GIFs stay animated). Cosmetics (decoration, effect, name style, nameplate) are free.
import type { ProfileStyle, SelfUser } from '@mncord/shared';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { DECORATIONS, EFFECTS, NAMEPLATES, NAME_STYLES, nameplateClass, ProfileEffect, StyledName } from '../../ui/Cosmetics';
import { DevBadge } from '../../ui/DevBadge';
import { ImageCropper } from '../../ui/ImageCropper';
import { Input } from '../../ui/Input';
import { cn } from '../../ui/cn';
import { api, ApiError, avatarUrl, uploadFile } from '../api';
import { errorText } from '../i18n';
import { set, useStore } from '../store';

const hex = (n: number | null | undefined) => (n == null ? null : `#${n.toString(16).padStart(6, '0')}`);
const SWATCHES = [0x5a63eb, 0x3ba55d, 0xfaa61a, 0xed4245, 0xeb459e, 0x00a8fc, 0x9b59b6, 0x1abc9c, 0x95a5a6, 0x2f3136];

export function useCropLabels() {
  const { t } = useTranslation();
  return { title: t('crop.title'), apply: t('crop.apply'), cancel: t('common.cancel'), zoom: t('crop.zoom'), working: t('crop.working'), hint: t('crop.hint'), close: t('common.close') };
}

/** pick → crop → upload → save on the profile; returns a button-friendly API */
export function usePictureUpload(onError: (e: unknown) => void) {
  const [busy, setBusy] = useState<'avatar' | 'banner' | null>(null);
  const [cropping, setCropping] = useState<{ kind: 'avatar' | 'banner'; file: File } | null>(null);
  const labels = useCropLabels();
  const save = async (kind: 'avatar' | 'banner', f: File) => {
    setBusy(kind);
    try {
      const a = await uploadFile(f, () => {}, undefined, kind);
      set({ me: await api<SelfUser>('PATCH', '/users/@me', kind === 'avatar' ? { avatarFileId: a.id } : { bannerFileId: a.id }) });
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };
  const cropper = cropping ? (
    <ImageCropper file={cropping.file} shape={cropping.kind === 'avatar' ? 'circle' : 'banner'} labels={labels}
      onCancel={() => setCropping(null)}
      onDone={(f) => {
        const kind = cropping.kind;
        setCropping(null);
        void save(kind, f);
      }} />
  ) : null;
  return { busy, pick: (kind: 'avatar' | 'banner', f?: File) => f && setCropping({ kind, file: f }), cropper };
}

function Choice({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick}
      className={cn('relative grid h-[72px] place-items-center overflow-hidden rounded-lg border-2 bg-surface transition-colors hover:bg-surface-hover', active ? 'border-accent' : 'border-transparent')}>
      {children}
    </button>
  );
}

export function ProfileTab() {
  const { t } = useTranslation();
  const me = useStore((s) => s.me)!;
  const init = { displayName: me.displayName ?? '', pronouns: me.pronouns ?? '', bio: me.bio ?? '', status: me.customStatus?.text ?? '', color: me.accentColor ?? null, style: (me.style ?? {}) as ProfileStyle };
  const [p, setP] = useState(init);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const avatarIn = useRef<HTMLInputElement>(null);
  const bannerIn = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(init);
  const fail = (e: unknown) => setMsg({ tone: 'err', text: errorText((e as ApiError).code) });
  const pics = usePictureUpload(fail);
  const st = (k: keyof ProfileStyle, v: string | null) => setP({ ...p, style: { ...p.style, [k]: v } });

  const remove = async (kind: 'avatar' | 'banner') => {
    try {
      set({ me: await api<SelfUser>('PATCH', '/users/@me', kind === 'avatar' ? { avatarFileId: null } : { bannerFileId: null }) });
    } catch (e) {
      fail(e);
    }
  };
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const style = Object.fromEntries(Object.entries(p.style).filter(([, v]) => v)) as ProfileStyle;
      set({
        me: await api<SelfUser>('PATCH', '/users/@me', {
          displayName: p.displayName.trim() || null,
          pronouns: p.pronouns.trim() || null,
          bio: p.bio.trim() || null,
          accentColor: p.color,
          customStatus: p.status.trim() ? { text: p.status.trim(), emoji: me.customStatus?.emoji ?? null } : null,
          style: Object.keys(style).length ? style : null,
        }),
      });
      setMsg({ tone: 'ok', text: t('profileEdit.saved') });
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const banner = me.bannerKey ? avatarUrl(me.bannerKey) : undefined;
  const name = p.displayName || me.username;
  const label = (group: string, id: string | null) => (id ? t(`cos.${group}.${id}`) : t('cos.none'));
  return (
    <>
      <h1 className="mb-5 font-display text-lg font-semibold">{t('profileEdit.title')}</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          <Input label={t('profileEdit.displayName')} value={p.displayName} maxLength={32} onChange={(e) => setP({ ...p, displayName: e.target.value })} placeholder={me.username} />
          <Input label={t('profileEdit.pronouns')} value={p.pronouns} maxLength={40} onChange={(e) => setP({ ...p, pronouns: e.target.value })} placeholder={t('profileEdit.pronounsHint')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.avatar')}</p>
              <div className="flex gap-2">
                <Button size="sm" loading={pics.busy === 'avatar'} onClick={() => avatarIn.current?.click()}>{t('profileEdit.changeAvatar')}</Button>
                {me.avatarKey && <Button size="sm" variant="ghost" onClick={() => void remove('avatar')}>{t('profileEdit.remove')}</Button>}
              </div>
              <input ref={avatarIn} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pics.pick('avatar', e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <div>
              <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.banner')}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} loading={pics.busy === 'banner'} onClick={() => bannerIn.current?.click()}>{t('profileEdit.changeBanner')}</Button>
                {me.bannerKey && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove('banner')}>{t('profileEdit.remove')}</Button>}
              </div>
              <input ref={bannerIn} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pics.pick('banner', e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>
          <p className="-mt-3 text-xs text-faint">{t('profileEdit.gifNote')}</p>
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

          {/* free cosmetics */}
          <div className="rounded-xl border border-accent/30 bg-mention/40 p-4">
            <p className="mb-1 font-display font-semibold">{t('cos.title')}</p>
            <p className="mb-4 text-xs text-muted">{t('cos.sub')}</p>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('cos.decoration._')} · <span className="normal-case text-faint">{label('decoration', p.style.decoration ?? null)}</span></p>
            <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
              <Choice label={t('cos.none')} active={!p.style.decoration} onClick={() => st('decoration', null)}><span className="text-xs text-faint">✕</span></Choice>
              {DECORATIONS.map((d) => <Choice key={d} label={t(`cos.decoration.${d}`)} active={p.style.decoration === d} onClick={() => st('decoration', d)}><Avatar name={name} src={avatarUrl(me.avatarKey)} size={36} decoration={d} /></Choice>)}
            </div>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('cos.effect._')} · <span className="normal-case text-faint">{label('effect', p.style.effect ?? null)}</span></p>
            <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              <Choice label={t('cos.none')} active={!p.style.effect} onClick={() => st('effect', null)}><span className="text-xs text-faint">✕</span></Choice>
              {EFFECTS.map((d) => <Choice key={d} label={t(`cos.effect.${d}`)} active={p.style.effect === d} onClick={() => st('effect', d)}><ProfileEffect id={d} /><span className="relative z-20 text-xs font-medium">{t(`cos.effect.${d}`)}</span></Choice>)}
            </div>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('cos.nameStyle._')}</p>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Choice label={t('cos.none')} active={!p.style.nameStyle} onClick={() => st('nameStyle', null)}><span className="font-display font-bold">{name}</span></Choice>
              {NAME_STYLES.map((d) => <Choice key={d} label={t(`cos.nameStyle.${d}`)} active={p.style.nameStyle === d} onClick={() => st('nameStyle', d)}><StyledName style={{ nameStyle: d }} className="truncate px-2 font-display text-lg font-extrabold">{name}</StyledName></Choice>)}
            </div>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('cos.nameplate._')}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Choice label={t('cos.none')} active={!p.style.nameplate} onClick={() => st('nameplate', null)}><span className="text-xs text-faint">✕</span></Choice>
              {NAMEPLATES.map((d) => (
                <Choice key={d} label={t(`cos.nameplate.${d}`)} active={p.style.nameplate === d} onClick={() => st('nameplate', d)}>
                  <span className={cn('flex h-10 w-[90%] items-center gap-2 rounded-md px-2', nameplateClass({ nameplate: d }))}><Avatar name={name} src={avatarUrl(me.avatarKey)} size={24} /><span className="truncate text-sm font-medium">{name}</span></span>
                </Choice>
              ))}
            </div>
          </div>

          <Input label={t('profileEdit.status')} value={p.status} maxLength={128} onChange={(e) => setP({ ...p, status: e.target.value })} placeholder={t('profileEdit.statusHint')} />
          <label className="flex flex-col gap-2">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.about')}</span>
            <textarea value={p.bio} maxLength={400} rows={4} onChange={(e) => setP({ ...p, bio: e.target.value })} dir="auto" className="resize-none rounded-sm border border-border-input bg-surface-input px-3 py-2 text-text outline-none focus:border-focus" />
            <span className="text-end text-xs text-faint">{p.bio.length}/400</span>
          </label>
          {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={msg.tone === 'err' ? 'text-sm text-danger-text' : 'text-sm text-success'}>{msg.text}</p>}
          {/* Discord-style "unsaved changes" bar */}
          {dirty && (
            <div className="anim-slide-up sticky bottom-3 z-20 flex items-center gap-3 rounded-lg bg-bg-deep p-3 shadow-pop">
              <p className="flex-1 text-sm font-medium">{t('profileEdit.unsaved')}</p>
              <Button variant="ghost" size="sm" onClick={() => setP(init)}>{t('profileEdit.reset')}</Button>
              <Button size="sm" variant="success" loading={saving} onClick={() => void save()}>{t('profileEdit.save')}</Button>
            </div>
          )}
        </div>

        {/* live preview, like the card others see */}
        <div>
          <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('profileEdit.preview')}</p>
          <div className="sticky top-0 overflow-hidden rounded-xl bg-popover shadow-pop">
            <div className="relative">
              <ProfileEffect id={p.style.effect} />
              <div className="h-[106px] bg-cover bg-center" style={banner ? { backgroundImage: `url(${banner})` } : { background: hex(p.color) ?? 'linear-gradient(120deg, color-mix(in srgb, var(--c-accent) 55%, #000), color-mix(in srgb, var(--c-text-link) 40%, #000))' }} />
              <div className="px-4 pb-4">
                <div className="-mt-10 mb-2 w-fit rounded-full border-[6px] border-popover">
                  <Avatar name={name} src={avatarUrl(me.avatarKey)} size={80} status="online" cutout="border-popover" decoration={p.style.decoration} />
                </div>
                <p className="flex items-center gap-2 font-display text-xl font-bold" dir="auto"><StyledName style={p.style}>{name}</StyledName><DevBadge flags={me.flags} size="md" /></p>
                <p className="text-sm text-muted">{me.username}{p.pronouns ? ` · ${p.pronouns}` : ''}</p>
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
          <p className="mb-2 mt-5 text-2xs font-bold uppercase tracking-wide text-muted">{t('cos.inList')}</p>
          <div className={cn('flex h-11 items-center gap-3 rounded-md bg-surface px-2', nameplateClass(p.style))}>
            <Avatar name={name} src={avatarUrl(me.avatarKey)} size={32} status="online" decoration={p.style.decoration} />
            <StyledName style={p.style} className="truncate font-medium">{name}</StyledName>
          </div>
        </div>
      </div>
      {pics.cropper}
    </>
  );
}
