// S23 channel create / settings / permission overwrites, and the server header menu.
import { has, P, type Channel, type Guild, type Member, type Overwrite, type PermissionName } from '@mncord/shared';
import { Check, ChevronDown, FolderPlus, Hash, LogOut, Megaphone, PlusCircle, Settings, Slash, Trash2, UserPlus, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Switch';
import { cn } from '../../ui/cn';
import { api, ApiError } from '../api';
import { errorText } from '../i18n';
import { set, useStore } from '../store';
import { hex, PERM_GROUPS } from './GuildSettings';

export function ServerMenu({ guild, onInvite, onSettings, onCreateChannel, onCreateCategory }: { guild: Guild; onInvite: () => void; onSettings: () => void; onCreateChannel: () => void; onCreateCategory: () => void }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const [open, setOpen] = useState(false);
  const [leave, setLeave] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const perms = BigInt(guild.myGuildPermissions);
  const canSettings = [P.MANAGE_GUILD, P.MANAGE_ROLES, P.KICK_MEMBERS, P.BAN_MEMBERS, P.VIEW_AUDIT_LOG, P.MANAGE_EXPRESSIONS, P.TIMEOUT_MEMBERS].some((p) => has(perms, p));
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) && setOpen(false);
    setTimeout(() => {
      addEventListener('mousedown', close);
      addEventListener('keydown', close);
    });
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);
  const item = (label: string, icon: React.ReactNode, onClick: () => void, cls = '') => (
    <button type="button" role="menuitem" onClick={() => { setOpen(false); onClick(); }} className={cn('flex h-8 w-full items-center justify-between rounded-xs px-2 text-sm hover:bg-surface-selected', cls || 'text-muted hover:text-text')}>
      {label}{icon}
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t('gs.menu')} onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center gap-2 border-b border-border px-4 text-start hover:bg-surface-hover">
        <h2 className="min-w-0 flex-1 truncate font-display font-semibold" title={guild.name}>{guild.name}</h2>
        {open ? <X className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {open && (
        <div role="menu" className="anim-pop absolute inset-x-2 top-14 z-30 rounded-md bg-popover p-1.5 shadow-pop">
          {item(t('gs.invite'), <UserPlus className="size-4" />, onInvite, 'text-link hover:text-link')}
          {canSettings && item(t('gs.settings'), <Settings className="size-4" />, onSettings)}
          {has(perms, P.MANAGE_CHANNELS) && item(t('gs.createChannel'), <PlusCircle className="size-4" />, onCreateChannel)}
          {has(perms, P.MANAGE_CHANNELS) && item(t('gs.createCategory'), <FolderPlus className="size-4" />, onCreateCategory)}
          {guild.ownerId !== me?.id && (
            <>
              <div className="my-1 h-px bg-border" />
              {item(t('gs.leave'), <LogOut className="size-4 rtl:-scale-x-100" />, () => setLeave(true), 'text-danger-text hover:bg-danger-solid hover:text-on-danger')}
            </>
          )}
        </div>
      )}
      {leave && (
        <Modal open onOpenChange={(o) => !o && setLeave(false)} title={t('gs.leave')} description={t('gs.leaveConfirm', { name: guild.name })} closeLabel={t('common.close')}
          footer={<><Button variant="ghost" onClick={() => setLeave(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void api('DELETE', `/users/@me/guilds/${guild.id}`).then(() => { setLeave(false); set({ selectedGuild: null }); })}>{t('gs.leave')}</Button></>} />
      )}
    </div>
  );
}

const TYPES: { id: 'text' | 'voice' | 'announcement'; icon: typeof Hash }[] = [
  { id: 'text', icon: Hash },
  { id: 'voice', icon: Volume2 },
  { id: 'announcement', icon: Megaphone },
];

export function CreateChannelModal({ guild, category, kind, initialType, onClose }: { guild: Guild; category: Channel | null; kind: 'channel' | 'category'; initialType?: 'text' | 'voice'; onClose: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState<'text' | 'voice' | 'announcement'>(initialType ?? 'text');
  const [name, setName] = useState('');
  const [priv, setPriv] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const c = await api<Channel>('POST', `/guilds/${guild.id}/channels`, { type: kind === 'category' ? 'category' : type, name, parentId: category?.id ?? null, private: priv });
      if (c.type !== 'category') set((s) => ({ selectedChannel: { ...s.selectedChannel, [guild.id]: c.id } }));
      onClose();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  const shown = type === 'text' || type === 'announcement' ? name.toLowerCase().replace(/\s+/g, '-') : name;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={kind === 'category' ? t('gs.createCategory') : t('ch.create')} description={category ? t('ch.createIn', { name: category.name }) : undefined} closeLabel={t('common.close')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!name.trim()} onClick={() => void create()}>{kind === 'category' ? t('gs.createCategory') : t('ch.create')}</Button></>}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        {kind === 'channel' && (
          <div role="radiogroup" aria-label={t('ch.type')} className="flex flex-col gap-2">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted">{t('ch.type')}</span>
            {TYPES.map(({ id, icon: Icon }) => (
              <button key={id} type="button" role="radio" aria-checked={type === id} onClick={() => setType(id)}
                className={cn('flex items-center gap-3 rounded-md border px-3 py-2.5 text-start', type === id ? 'border-accent bg-mention' : 'border-border bg-surface hover:bg-surface-hover')}>
                <Icon className="size-6 text-muted" />
                <span className="flex-1"><span className="block font-semibold">{t(`ch.${id}`)}</span><span className="block text-xs text-muted">{t(`ch.${id}Sub`)}</span></span>
                <span className={cn('size-4 rounded-full border-2', type === id ? 'border-accent bg-accent' : 'border-border-input')} />
              </button>
            ))}
          </div>
        )}
        <Input label={kind === 'category' ? t('ch.category') : t('ch.name')} value={shown} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
        <Switch label={t('ch.private')} description={t('ch.privateSub')} checked={priv} onCheckedChange={setPriv} />
        {err && <p role="alert" className="text-sm text-danger-text">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function ChannelSettings({ guild, channel, onClose }: { guild: Guild; channel: Channel; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');
  const perms = BigInt(guild.myPermissions[channel.id] ?? guild.myGuildPermissions);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`${channel.type === 'voice' ? '🔊' : '#'} ${channel.name} · ${t('ch.settings')}`} closeLabel={t('common.close')} size="md">
      <div className="mb-4 flex gap-2" role="tablist">
        {(['overview', 'permissions'] as const).filter((x) => x === 'overview' || has(perms, P.MANAGE_ROLES)).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={cn('rounded-xs px-3 py-1 font-medium', tab === x ? 'bg-surface-selected text-text' : 'text-muted hover:text-text')}>{t(`ch.${x}`)}</button>
        ))}
      </div>
      {tab === 'overview' ? <ChannelOverview guild={guild} channel={channel} onClose={onClose} /> : <OverwriteEditor guild={guild} channel={channel} />}
    </Modal>
  );
}

function ChannelOverview({ guild, channel, onClose }: { guild: Guild; channel: Channel; onClose: () => void }) {
  const { t } = useTranslation();
  const isVoice = channel.type === 'voice';
  const [v, setV] = useState({ name: channel.name ?? '', topic: channel.topic ?? '', slowmodeS: 0, bitrate: channel.bitrate, userLimit: channel.userLimit });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('PATCH', `/channels/${channel.id}`, isVoice ? { name: v.name, bitrate: v.bitrate, userLimit: v.userLimit } : channel.type === 'category' ? { name: v.name } : { name: v.name, topic: v.topic || null, slowmodeS: v.slowmodeS });
      onClose();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    try {
      await api('DELETE', `/channels/${channel.id}`);
      set((s) => ({ selectedChannel: { ...s.selectedChannel, [guild.id]: guild.channels.find((c) => c.type === 'text' && c.id !== channel.id)?.id ?? '' } }));
      onClose();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
      setConfirm(false);
    }
  };
  const slow: [number, string][] = [[0, t('ch.off')], [5, t('ch.s5')], [30, t('ch.s30')], [60, t('ch.m1')], [300, t('ch.m5')], [900, t('ch.m15')], [3600, t('ch.h1')]];
  return (
    <div className="flex flex-col gap-4">
      <Input label={t('ch.name')} value={v.name} maxLength={100} onChange={(e) => setV({ ...v, name: e.target.value })} />
      {(channel.type === 'text' || channel.type === 'announcement') && (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted">{t('ch.topic')}</span>
            <textarea value={v.topic} rows={2} maxLength={1024} dir="auto" onChange={(e) => setV({ ...v, topic: e.target.value })} className="resize-none rounded-sm border border-border-input bg-surface-input p-3 text-text outline-none focus-visible:border-focus" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted">{t('ch.slowmode')}</span>
            <select value={v.slowmodeS} onChange={(e) => setV({ ...v, slowmodeS: Number(e.target.value) })} className="h-10 rounded-sm border border-border-input bg-surface-input px-3 text-text">
              {slow.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
            </select>
          </label>
        </>
      )}
      {isVoice && (
        <>
          <Slider label={t('ch.bitrate')} value={v.bitrate} min={8000} max={510000} step={8000} format={(x) => `${Math.round(x / 1000)} kbps`} onValueChange={(x) => setV({ ...v, bitrate: x })} />
          <Slider label={t('ch.userLimit')} value={v.userLimit} min={0} max={99} format={(x) => (x === 0 ? t('ch.noLimit') : String(x))} onValueChange={(x) => setV({ ...v, userLimit: x })} />
        </>
      )}
      {err && <p role="alert" className="text-sm text-danger-text">{err}</p>}
      <div className="flex justify-between gap-2">
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>{t('ch.deleteChannel')}</Button>
        <Button loading={busy} onClick={() => void save()}>{t('common.save')}</Button>
      </div>
      {confirm && (
        <Modal open onOpenChange={(o) => !o && setConfirm(false)} title={t('ch.deleteChannel')} description={t('ch.deleteConfirm', { name: channel.name })} closeLabel={t('common.close')}
          footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void del()}>{t('ch.deleteChannel')}</Button></>} />
      )}
    </div>
  );
}

/** Per-role / per-member allow · inherit · deny for every permission. */
function OverwriteEditor({ guild, channel }: { guild: Guild; channel: Channel }) {
  const { t } = useTranslation();
  const [list, setList] = useState<Overwrite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => void api<Overwrite[]>('GET', `/channels/${channel.id}/permissions`).then((l) => { setList(l); setSel((s) => s ?? l[0]?.targetId ?? guild.roles.find((r) => r.isEveryone)!.id); });
  useEffect(load, [channel.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void api<Member[]>('GET', `/guilds/${guild.id}/members`).then(setMembers), [guild.id]);
  const everyone = guild.roles.find((r) => r.isEveryone)!;
  const labelOf = (o: { targetId: string; targetType: string }) => {
    if (o.targetType === 'role') {
      const r = guild.roles.find((x) => x.id === o.targetId);
      return { name: r?.name ?? '?', color: hex(r?.color ?? 0) };
    }
    const m = members.find((x) => x.userId === o.targetId);
    return { name: m?.nick ?? m?.user.displayName ?? m?.user.username ?? '…', color: 'var(--c-text)' };
  };
  const entries: Overwrite[] = list.some((o) => o.targetId === everyone.id) ? list : [{ targetId: everyone.id, targetType: 'role', allow: '0', deny: '0' }, ...list];
  const cur = entries.find((o) => o.targetId === sel) ?? entries[0]!;
  const setBit = async (p: PermissionName, state: 'allow' | 'neutral' | 'deny') => {
    let allow = BigInt(cur.allow) & ~P[p];
    let deny = BigInt(cur.deny) & ~P[p];
    if (state === 'allow') allow |= P[p];
    if (state === 'deny') deny |= P[p];
    setErr(null);
    try {
      await api('PUT', `/channels/${channel.id}/permissions/${cur.targetId}`, { type: cur.targetType, allow: allow.toString(), deny: deny.toString() });
      load();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    }
  };
  const groups = PERM_GROUPS.map((g) => ({ ...g, perms: g.perms.filter((p) => p !== 'ADMINISTRATOR' && !['MANAGE_GUILD', 'VIEW_AUDIT_LOG', 'KICK_MEMBERS', 'BAN_MEMBERS', 'TIMEOUT_MEMBERS', 'MANAGE_NICKNAMES', 'CHANGE_NICKNAME', 'MANAGE_EXPRESSIONS'].includes(p)) })).filter((g) => g.perms.length);
  const candidates = [
    ...guild.roles.filter((r) => !entries.some((o) => o.targetId === r.id)).map((r) => ({ id: r.id, type: 'role' as const, name: r.name, color: hex(r.color) })),
    ...members.filter((m) => !entries.some((o) => o.targetId === m.userId)).map((m) => ({ id: m.userId, type: 'member' as const, name: m.nick ?? m.user.displayName ?? m.user.username, color: 'var(--c-text)' })),
  ];
  return (
    <div className="flex max-h-[60vh] gap-4">
      <div className="w-44 shrink-0 overflow-y-auto">
        <p className="mb-2 flex items-center justify-between text-2xs font-bold uppercase tracking-wide text-muted">
          {t('ch.rolesMembers')}
          <button type="button" aria-label={t('ch.addRole')} onClick={() => setAdding((a) => !a)} className="text-faint hover:text-text"><PlusCircle className="size-4" /></button>
        </p>
        {adding && (
          <ul className="mb-2 max-h-40 overflow-y-auto rounded-sm bg-surface-input p-1">
            {candidates.map((c) => (
              <li key={c.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded-xs px-2 py-1 text-start text-sm hover:bg-surface-hover"
                  onClick={() => void api('PUT', `/channels/${channel.id}/permissions/${c.id}`, { type: c.type, allow: '0', deny: '0' }).then(() => { setAdding(false); setSel(c.id); load(); })}>
                  {c.type === 'member' ? <Avatar name={c.name} size={16} /> : <span className="size-2.5 rounded-full" style={{ background: c.color }} />}
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className="flex flex-col gap-0.5">
          {entries.map((o) => {
            const l = labelOf(o);
            return (
              <li key={o.targetId}>
                <button type="button" onClick={() => setSel(o.targetId)} className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm', cur.targetId === o.targetId ? 'bg-surface-selected' : 'hover:bg-surface-hover')}>
                  {o.targetType === 'member' ? <Avatar name={l.name} size={16} /> : <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color }} />}
                  <span className="truncate">{l.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto pe-1">
        {err && <p role="alert" className="mb-2 text-sm text-danger-text">{err}</p>}
        {groups.map((g) => (
          <section key={g.id} className="mb-4">
            <h3 className="mb-1 font-semibold">{t(`perm.${g.id}`)}</h3>
            {g.perms.map((p) => {
              const state = has(BigInt(cur.allow), P[p]) ? 'allow' : has(BigInt(cur.deny), P[p]) ? 'deny' : 'neutral';
              return (
                <div key={p} className="flex items-center justify-between gap-2 border-b border-border py-2">
                  <span className="text-sm">{t(`perm.${p}`)}</span>
                  <div className="flex overflow-hidden rounded-sm border border-border" role="radiogroup" aria-label={t(`perm.${p}`)}>
                    {([['deny', <X key="d" className="size-4" />, 'bg-danger-solid text-on-danger'], ['neutral', <Slash key="n" className="size-4" />, 'bg-surface-selected text-text'], ['allow', <Check key="a" className="size-4" />, 'bg-success-solid text-on-success']] as const).map(([s, icon, on]) => (
                      <button key={s} type="button" role="radio" aria-checked={state === s} aria-label={t(`ch.${s}`)} onClick={() => void setBit(p, s)}
                        className={cn('grid h-7 w-8 place-items-center', state === s ? on : 'text-faint hover:bg-surface-hover')}>{icon}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        {cur.targetId !== everyone.id && (
          <Button variant="ghost" size="sm" onClick={() => void api('DELETE', `/channels/${channel.id}/permissions/${cur.targetId}`).then(() => { setSel(everyone.id); load(); })}>{t('ch.removeOverwrite')}</Button>
        )}
      </div>
    </div>
  );
}
