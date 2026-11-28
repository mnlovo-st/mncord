// S22 server settings (full screen).
import { has, P, type AuditEntry, type Ban, type Guild, type InviteInfo, type Member, type PermissionName, type Role } from '@mncord/shared';
import { ChevronDown, ChevronUp, Plus, ShieldAlert, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Switch';
import { cn } from '../../ui/cn';
import { api, ApiError, uploadFile } from '../api';
import { errorText } from '../i18n';
import { useStore } from '../store';

export const PERM_GROUPS: { id: string; perms: PermissionName[] }[] = [
  { id: 'general', perms: ['VIEW_CHANNEL', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_EXPRESSIONS', 'VIEW_AUDIT_LOG', 'MANAGE_WEBHOOKS', 'MANAGE_GUILD', 'CREATE_INVITE'] },
  { id: 'members', perms: ['CHANGE_NICKNAME', 'MANAGE_NICKNAMES', 'KICK_MEMBERS', 'BAN_MEMBERS', 'TIMEOUT_MEMBERS'] },
  { id: 'text', perms: ['SEND_MESSAGES', 'SEND_IN_THREADS', 'CREATE_THREADS', 'EMBED_LINKS', 'ATTACH_FILES', 'ADD_REACTIONS', 'USE_EXTERNAL_EMOJI', 'MENTION_EVERYONE', 'MANAGE_MESSAGES', 'MANAGE_THREADS', 'READ_HISTORY'] },
  { id: 'voice', perms: ['CONNECT', 'SPEAK', 'STREAM', 'USE_VOICE_ACTIVITY', 'PRIORITY_SPEAKER', 'USE_SOUNDBOARD', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS'] },
  { id: 'advanced', perms: ['ADMINISTRATOR'] },
];
export const COLORS = [0, 0x1abc9c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe91e63, 0xf1c40f, 0xe67e22, 0xe74c3c, 0x95a5a6, 0xf4b740, 0x8cbcff, 0xc9d3e3];
export const hex = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : 'var(--c-text-muted)');

type Tab = 'overview' | 'roles' | 'emoji' | 'members' | 'bans' | 'invites' | 'audit' | 'delete';

export function GuildSettings({ guild, onClose }: { guild: Guild; onClose: () => void }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const perms = BigInt(guild.myGuildPermissions);
  const isOwner = guild.ownerId === me?.id;
  const can = (p: bigint) => has(perms, p);
  const tabs: [string, [Tab, string, boolean][]][] = [
    [guild.name, [['overview', t('gs.overview'), can(P.MANAGE_GUILD)], ['roles', t('gs.roles'), can(P.MANAGE_ROLES)], ['emoji', t('gs.emoji'), can(P.MANAGE_EXPRESSIONS)]]],
    [t('gs.moderation'), [['members', t('gs.members'), can(P.KICK_MEMBERS) || can(P.BAN_MEMBERS) || can(P.MANAGE_ROLES) || can(P.TIMEOUT_MEMBERS)], ['bans', t('gs.bans'), can(P.BAN_MEMBERS)], ['invites', t('gs.invites'), can(P.MANAGE_GUILD)], ['audit', t('gs.audit'), can(P.VIEW_AUDIT_LOG)]]],
  ];
  const first = tabs.flatMap(([, x]) => x).find(([, , ok]) => ok)?.[0] ?? 'overview';
  const [tab, setTab] = useState<Tab>(first);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=dialog][data-state=open]') && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t('gs.settings')} className="anim-fade fixed inset-0 z-40 flex bg-bg">
      <nav className="flex w-[min(320px,35vw)] shrink-0 justify-end overflow-y-auto bg-surface py-14 pe-2">
        <div className="w-[218px]">
          {tabs.map(([group, items]) => (
            <div key={group} className="mb-4">
              <h2 className="truncate px-2.5 pb-1.5 text-2xs font-bold uppercase tracking-wide text-faint">{group}</h2>
              {items.filter(([, , ok]) => ok).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
                  className={cn('mb-0.5 block w-full rounded-sm px-2.5 py-1.5 text-start font-medium', tab === id ? 'bg-surface-selected text-text' : 'text-muted hover:bg-surface-hover hover:text-text')}>{label}</button>
              ))}
            </div>
          ))}
          {isOwner && (
            <>
              <div className="my-2 h-px bg-border" />
              <button type="button" onClick={() => setTab('delete')} className="flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-start font-medium text-danger-text hover:bg-surface-hover">
                {t('gs.deleteServer')} <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      </nav>
      <div className="relative min-w-0 flex-1 overflow-y-auto px-10 py-14">
        <div className="max-w-[740px]">
          {tab === 'overview' && <Overview guild={guild} />}
          {tab === 'roles' && <Roles guild={guild} />}
          {tab === 'emoji' && <Emoji guild={guild} />}
          {tab === 'members' && <Members guild={guild} />}
          {tab === 'bans' && <Bans guild={guild} />}
          {tab === 'invites' && <Invites guild={guild} />}
          {tab === 'audit' && <Audit guild={guild} />}
          {tab === 'delete' && <DeleteServer guild={guild} onDone={onClose} />}
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
const Label = ({ children }: { children: ReactNode }) => <span className="text-2xs font-bold uppercase tracking-wide text-muted">{children}</span>;
const Err = ({ e }: { e?: string | null }) => (e ? <p role="alert" className="text-sm text-danger-text">{e}</p> : null);

function SaveBar({ dirty, busy, onReset, onSave }: { dirty: boolean; busy: boolean; onReset: () => void; onSave: () => void }) {
  const { t } = useTranslation();
  if (!dirty) return null;
  return (
    <div className="anim-slide-up fixed bottom-6 start-1/2 z-50 flex w-[min(700px,90vw)] -translate-x-1/2 items-center gap-3 rounded-lg bg-popover p-3 shadow-pop rtl:translate-x-1/2">
      <span className="flex-1 font-medium">{t('gs.unsaved')}</span>
      <Button variant="ghost" onClick={onReset}>{t('gs.reset')}</Button>
      <Button variant="success" loading={busy} onClick={onSave}>{t('gs.save')}</Button>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-2">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-sm border border-border-input bg-surface-input px-3 text-text outline-none focus-visible:border-focus">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

// ── overview
function Overview({ guild }: { guild: Guild }) {
  const { t } = useTranslation();
  const init = { name: guild.name, description: guild.description ?? '', systemChannelId: guild.systemChannelId ?? '', defaultNotifications: guild.defaultNotifications, isDiscoverable: guild.isDiscoverable !== false };
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [iconBusy, setIconBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('PATCH', `/guilds/${guild.id}`, { name: v.name, description: v.description || null, systemChannelId: v.systemChannelId || null, defaultNotifications: v.defaultNotifications, isDiscoverable: v.isDiscoverable });
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  const uploadIcon = async (f: File) => {
    setIconBusy(true);
    try {
      const a = await uploadFile(f, () => {}, undefined, 'icon');
      await api('PATCH', `/guilds/${guild.id}`, { iconFileId: a.id });
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setIconBusy(false);
    }
  };
  return (
    <>
      <H>{t('gs.overview')}</H>
      <div className="mb-8 flex items-center gap-6">
        <div className="grid size-24 place-items-center overflow-hidden rounded-full bg-surface-raised font-display text-2xl font-bold">
          {guild.iconUrl ? <img src={guild.iconUrl} alt="" className="size-full object-cover" /> : [...guild.name][0]}
        </div>
        <div>
          <Label>{t('gs.icon')}</Label>
          <div className="mt-2"><Button variant="secondary" loading={iconBusy} icon={<Upload className="size-4" />} onClick={() => file.current?.click()}>{t('gs.uploadIcon')}</Button></div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && void uploadIcon(e.target.files[0])} />
        </div>
      </div>
      <div className="grid gap-5">
        <Input label={t('gs.name')} value={v.name} maxLength={100} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <label className="flex flex-col gap-2">
          <Label>{t('gs.description')}</Label>
          <textarea value={v.description} maxLength={300} rows={3} dir="auto" onChange={(e) => setV({ ...v, description: e.target.value })} className="resize-none rounded-sm border border-border-input bg-surface-input p-3 text-text outline-none focus-visible:border-focus" />
        </label>
        <Select label={t('gs.systemChannel')} value={v.systemChannelId} onChange={(x) => setV({ ...v, systemChannelId: x })}
          options={[['', t('gs.none')], ...guild.channels.filter((c) => c.type === 'text').map((c) => [c.id, `#${c.name}`] as [string, string])]} />
        <Select label={t('gs.notifications')} value={v.defaultNotifications} onChange={(x) => setV({ ...v, defaultNotifications: x as 'all' | 'mentions' })}
          options={[['all', t('gs.allMessages')], ['mentions', t('gs.onlyMentions')]]} />
        <Switch label={t('gs.discoverable')} description={t('gs.discoverableSub')} checked={v.isDiscoverable} onCheckedChange={(x) => setV({ ...v, isDiscoverable: x })} />
        <Err e={err} />
      </div>
      <SaveBar dirty={dirty} busy={busy} onReset={() => setV(init)} onSave={() => void save()} />
    </>
  );
}

// ── roles
function Roles({ guild }: { guild: Guild }) {
  const { t } = useTranslation();
  const roles = [...guild.roles].sort((a, b) => b.position - a.position);
  const [sel, setSel] = useState<string>(roles.find((r) => !r.isEveryone)?.id ?? roles[0]!.id);
  const role = guild.roles.find((r) => r.id === sel) ?? roles[0]!;
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    try {
      const r = await api<{ id: string }>('POST', `/guilds/${guild.id}/roles`, { name: t('gs.createRole') });
      setSel(r.id);
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    }
  };
  const move = async (r: Role, dir: 1 | -1) => {
    const ordered = roles.filter((x) => !x.isEveryone);
    const i = ordered.findIndex((x) => x.id === r.id);
    const other = ordered[i - dir];
    if (!other) return;
    try {
      await api('PATCH', `/guilds/${guild.id}/roles`, [{ id: r.id, position: other.position }, { id: other.id, position: r.position }]);
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    }
  };
  return (
    <>
      <H>{t('gs.roles')}</H>
      <Err e={err} />
      <div className="flex gap-6">
        <div className="w-56 shrink-0">
          <Button size="sm" className="mb-3 w-full justify-center" icon={<Plus className="size-4" />} onClick={() => void create()}>{t('gs.createRole')}</Button>
          <ul className="flex flex-col gap-0.5">
            {roles.map((r) => (
              <li key={r.id} className={cn('group flex items-center gap-2 rounded-sm px-2 py-1.5', sel === r.id ? 'bg-surface-selected' : 'hover:bg-surface-hover')}>
                <button type="button" onClick={() => setSel(r.id)} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: hex(r.color) }} />
                  <span className="truncate">{r.name}</span>
                </button>
                {!r.isEveryone && (
                  <span className="hidden gap-0.5 group-hover:flex">
                    <button type="button" aria-label={t('gs.moveUp')} onClick={() => void move(r, 1)} className="text-faint hover:text-text"><ChevronUp className="size-4" /></button>
                    <button type="button" aria-label={t('gs.moveDown')} onClick={() => void move(r, -1)} className="text-faint hover:text-text"><ChevronDown className="size-4" /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <RoleEditor key={role.id} guild={guild} role={role} onDeleted={() => setSel(roles.find((r) => r.isEveryone)!.id)} />
      </div>
    </>
  );
}

function RoleEditor({ guild, role, onDeleted }: { guild: Guild; role: Role; onDeleted: () => void }) {
  const { t } = useTranslation();
  const init = { name: role.name, color: role.color, hoist: role.hoist, mentionable: false, permissions: role.permissions };
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bits = BigInt(v.permissions);
  const dirty = v.name !== init.name || v.color !== init.color || v.hoist !== init.hoist || v.permissions !== init.permissions;
  const toggle = (name: PermissionName, on: boolean) => setV((x) => ({ ...x, permissions: (on ? BigInt(x.permissions) | P[name] : BigInt(x.permissions) & ~P[name]).toString() }));
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { permissions: v.permissions, color: v.color, hoist: v.hoist };
      if (!role.isEveryone) body.name = v.name;
      await api('PATCH', `/guilds/${guild.id}/roles/${role.id}`, body);
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-w-0 flex-1">
      {role.isEveryone ? <p className="mb-4 text-sm text-muted">{t('gs.everyoneHint')}</p> : (
        <div className="mb-6 grid gap-4">
          <Input label={t('gs.roleName')} value={v.name} maxLength={100} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <div>
            <Label>{t('gs.roleColor')}</Label>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
              {COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={hex(c)} onClick={() => setV({ ...v, color: c })}
                  className={cn('size-8 rounded-md border-2', v.color === c ? 'border-text' : 'border-transparent')} style={{ background: c ? hex(c) : 'var(--c-surface-selected)' }} />
              ))}
            </div>
          </div>
          <Switch label={t('gs.hoist')} description={t('gs.hoistSub')} checked={v.hoist} onCheckedChange={(x) => setV({ ...v, hoist: x })} />
        </div>
      )}
      <h2 className="mb-3 text-2xs font-bold uppercase tracking-wide text-muted">{t('gs.permissions')}</h2>
      {PERM_GROUPS.map((g) => (
        <section key={g.id} className="mb-6">
          <h3 className="mb-2 font-semibold">{t(`perm.${g.id}`)}</h3>
          <div className="flex flex-col divide-y divide-border">
            {g.perms.map((p) => (
              <div key={p} className="py-3">
                <Switch label={t(`perm.${p}`)} description={p === 'ADMINISTRATOR' ? t('perm.ADMINISTRATOR_SUB') : undefined} checked={has(bits, P[p])} onCheckedChange={(on) => toggle(p, on)} />
              </div>
            ))}
          </div>
        </section>
      ))}
      <Err e={err} />
      {!role.isEveryone && (
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void api('DELETE', `/guilds/${guild.id}/roles/${role.id}`).then(onDeleted, (e: ApiError) => setErr(errorText(e.code)))}>{t('gs.deleteRole')}</Button>
      )}
      <SaveBar dirty={dirty} busy={busy} onReset={() => setV(init)} onSave={() => void save()} />
    </div>
  );
}

// ── emoji
function Emoji({ guild }: { guild: Guild }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const add = async (f: File) => {
    const n = (name || f.name.replace(/\.\w+$/, '')).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
    setBusy(true);
    setErr(null);
    try {
      const a = await uploadFile(f, () => {}, undefined, 'emoji');
      await api('POST', `/guilds/${guild.id}/emojis`, { name: n.length >= 2 ? n : `emoji_${n}`, fileId: a.id });
      setName('');
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <H>{t('gs.emoji')}</H>
      <p className="mb-4 text-sm text-muted">{t('gs.emojiHint')}</p>
      <div className="mb-2 flex items-end gap-2">
        <Input label={t('gs.emojiName')} value={name} onChange={(e) => setName(e.target.value)} dir="ltr" className="flex-1" />
        <Button loading={busy} icon={<Upload className="size-4" />} onClick={() => file.current?.click()}>{t('gs.uploadEmoji')}</Button>
        <input ref={file} type="file" accept="image/png,image/gif,image/webp,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && void add(e.target.files[0])} />
      </div>
      <Err e={err} />
      <p className="mb-3 mt-4 text-2xs font-bold uppercase tracking-wide text-faint">{t('gs.slots', { n: guild.emojis.length })}</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
        {guild.emojis.map((e) => (
          <li key={e.id} className="group flex items-center gap-3 rounded-md bg-surface p-2">
            <img src={e.url} alt={e.name} className="size-8 object-contain" />
            <span className="flex-1 truncate font-mono text-sm" dir="ltr">:{e.name}:</span>
            <button type="button" aria-label={t('common.close')} onClick={() => void api('DELETE', `/guilds/${guild.id}/emojis/${e.id}`)} className="hidden text-danger-text group-hover:block"><X className="size-4" /></button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ── members
function Members({ guild }: { guild: Guild }) {
  const { t, i18n } = useTranslation();
  const me = useStore((s) => s.me);
  const perms = BigInt(guild.myGuildPermissions);
  const [list, setList] = useState<Member[]>([]);
  const [q, setQ] = useState('');
  const [act, setAct] = useState<{ kind: 'kick' | 'ban' | 'timeout' | 'roles'; m: Member } | null>(null);
  const load = () => void api<Member[]>('GET', `/guilds/${guild.id}/members`).then(setList);
  useEffect(load, [guild.id]);
  const roleById = useMemo(() => new Map(guild.roles.map((r) => [r.id, r])), [guild.roles]);
  const shown = list.filter((m) => `${m.user.username} ${m.user.displayName ?? ''} ${m.nick ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const when = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
  return (
    <>
      <H>{t('gs.members')} · {list.length}</H>
      <Input variant="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('gs.searchMembers')} aria-label={t('gs.searchMembers')} className="mb-4" />
      <ul className="flex flex-col divide-y divide-border">
        {shown.map((m) => {
          const owner = m.userId === guild.ownerId;
          const timedOut = m.timeoutUntil && new Date(m.timeoutUntil) > new Date();
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={m.nick ?? m.user.displayName ?? m.user.username} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.nick ?? m.user.displayName ?? m.user.username} {owner && <span className="text-xs text-accent-text">· {t('gs.owner')}</span>}</p>
                <p className="text-xs text-faint">@{m.user.username} · {t('gs.joined', { when: when(m.joinedAt) })}{timedOut ? ' · ⏳' : ''}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.roleIds.map((id) => roleById.get(id)).filter(Boolean).map((r) => (
                    <span key={r!.id} className="inline-flex h-5 items-center gap-1 rounded-xs bg-surface-raised px-1.5 text-xs"><span className="size-2 rounded-full" style={{ background: hex(r!.color) }} />{r!.name}</span>
                  ))}
                </div>
              </div>
              {!owner && m.userId !== me?.id && (
                <div className="flex gap-1">
                  {has(perms, P.MANAGE_ROLES) && <Button size="sm" variant="secondary" onClick={() => setAct({ kind: 'roles', m })}>{t('gs.editRoles')}</Button>}
                  {has(perms, P.TIMEOUT_MEMBERS) && (timedOut
                    ? <Button size="sm" variant="secondary" onClick={() => void api('PATCH', `/guilds/${guild.id}/members/${m.userId}`, { timeoutUntil: null }).then(load)}>{t('gs.removeTimeout')}</Button>
                    : <Button size="sm" variant="secondary" onClick={() => setAct({ kind: 'timeout', m })}>{t('gs.timeout')}</Button>)}
                  {has(perms, P.KICK_MEMBERS) && <Button size="sm" variant="secondary" onClick={() => setAct({ kind: 'kick', m })}>{t('gs.kick')}</Button>}
                  {has(perms, P.BAN_MEMBERS) && <Button size="sm" variant="danger" onClick={() => setAct({ kind: 'ban', m })}>{t('gs.ban')}</Button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {act && <ModAction guild={guild} kind={act.kind} m={act.m} onDone={() => { setAct(null); load(); }} />}
    </>
  );
}

function ModAction({ guild, kind, m, onDone }: { guild: Guild; kind: 'kick' | 'ban' | 'timeout' | 'roles'; m: Member; onDone: () => void }) {
  const { t } = useTranslation();
  const name = m.nick ?? m.user.displayName ?? m.user.username;
  const [reason, setReason] = useState('');
  const [del, setDel] = useState('0');
  const [dur, setDur] = useState(String(3600));
  const [roles, setRoles] = useState<string[]>(m.roleIds);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'kick') await api('DELETE', `/guilds/${guild.id}/members/${m.userId}?reason=${encodeURIComponent(reason)}`);
      if (kind === 'ban') await api('PUT', `/guilds/${guild.id}/bans/${m.userId}`, { reason: reason || undefined, deleteMessageSeconds: Number(del) });
      if (kind === 'timeout') await api('PATCH', `/guilds/${guild.id}/members/${m.userId}`, { timeoutUntil: new Date(Date.now() + Number(dur) * 1000).toISOString(), reason: reason || undefined });
      if (kind === 'roles') await api('PATCH', `/guilds/${guild.id}/members/${m.userId}`, { roleIds: roles });
      onDone();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  const title = { kick: t('gs.kickConfirm', { name }), ban: t('gs.banConfirm', { name }), timeout: `${t('gs.timeout')} · ${name}`, roles: `${t('gs.editRoles')} · ${name}` }[kind];
  return (
    <Modal open onOpenChange={(o) => !o && onDone()} title={title} closeLabel={t('common.close')}
      footer={<><Button variant="ghost" onClick={onDone}>{t('common.cancel')}</Button><Button variant={kind === 'roles' ? 'primary' : 'danger'} loading={busy} onClick={() => void run()}>{kind === 'roles' ? t('common.save') : t(`gs.${kind}`)}</Button></>}>
      <div className="flex flex-col gap-4">
        {kind === 'roles' ? (
          <ul className="max-h-72 overflow-y-auto">
            {[...guild.roles].filter((r) => !r.isEveryone).sort((a, b) => b.position - a.position).map((r) => (
              <li key={r.id}>
                <label className="flex h-10 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-surface-hover">
                  <input type="checkbox" className="size-4 accent-[var(--c-accent)]" checked={roles.includes(r.id)} onChange={(e) => setRoles((x) => (e.target.checked ? [...x, r.id] : x.filter((y) => y !== r.id)))} />
                  <span className="size-3 rounded-full" style={{ background: hex(r.color) }} />{r.name}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {kind === 'timeout' && <Select label={t('gs.timeoutFor')} value={dur} onChange={setDur} options={[['300', t('gs.m5')], ['3600', t('gs.h1')], ['86400', t('gs.d1')], ['604800', t('gs.w1')]]} />}
            {kind === 'ban' && <Select label={t('gs.deleteMessages')} value={del} onChange={setDel} options={[['0', t('gs.dontDelete')], ['3600', t('gs.lastHour')], ['86400', t('gs.lastDay')], ['604800', t('gs.lastWeek')]]} />}
            <Input label={t('gs.reason')} value={reason} maxLength={512} onChange={(e) => setReason(e.target.value)} />
          </>
        )}
        <Err e={err} />
      </div>
    </Modal>
  );
}

// ── bans / invites / audit
function Bans({ guild }: { guild: Guild }) {
  const { t } = useTranslation();
  const [list, setList] = useState<Ban[] | null>(null);
  const load = () => void api<Ban[]>('GET', `/guilds/${guild.id}/bans`).then(setList);
  useEffect(load, [guild.id]);
  return (
    <>
      <H>{t('gs.bans')}</H>
      {list?.length === 0 && <p className="text-muted">{t('gs.noBans')}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {list?.map((b) => (
          <li key={b.user.id} className="flex items-center gap-3 py-3">
            <Avatar name={b.user.displayName ?? b.user.username} size={36} />
            <div className="min-w-0 flex-1"><p className="font-semibold">{b.user.displayName ?? b.user.username}</p>{b.reason && <p className="truncate text-sm text-muted">{b.reason}</p>}</div>
            <Button size="sm" variant="secondary" onClick={() => void api('DELETE', `/guilds/${guild.id}/bans/${b.user.id}`).then(load)}>{t('gs.unban')}</Button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Invites({ guild }: { guild: Guild }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<InviteInfo[] | null>(null);
  const load = () => void api<InviteInfo[]>('GET', `/guilds/${guild.id}/invites`).then(setList);
  useEffect(load, [guild.id]);
  const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : t('gs.never'));
  return (
    <>
      <H>{t('gs.invites')}</H>
      {list?.length === 0 && <p className="text-muted">{t('gs.noInvites')}</p>}
      {!!list?.length && (
        <table className="w-full text-sm">
          <thead className="text-start text-2xs uppercase text-faint"><tr><th className="py-2 text-start">{t('gs.inviter')}</th><th className="text-start">{t('gs.code')}</th><th className="text-start">{t('gs.uses')}</th><th className="text-start">{t('gs.expires')}</th><th /></tr></thead>
          <tbody className="divide-y divide-border">
            {list.map((i) => (
              <tr key={i.code}>
                <td className="py-2">{i.inviter?.displayName ?? i.inviter?.username ?? '—'}</td>
                <td className="font-mono" dir="ltr">{i.code}</td>
                <td>{i.uses}{i.maxUses ? ` / ${i.maxUses}` : ''}</td>
                <td>{fmt(i.expiresAt)}</td>
                <td className="text-end"><Button size="sm" variant="ghost" onClick={() => void api('DELETE', `/invites/${i.code}`).then(load)}>{t('gs.revoke')}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Audit({ guild }: { guild: Guild }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<AuditEntry[] | null>(null);
  useEffect(() => void api<AuditEntry[]>('GET', `/guilds/${guild.id}/audit-log`).then(setList), [guild.id]);
  const fmt = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  return (
    <>
      <H>{t('gs.audit')}</H>
      {list?.length === 0 && <p className="text-muted">{t('gs.noAudit')}</p>}
      <ul className="flex flex-col gap-2">
        {list?.map((e) => (
          <li key={e.id} className="flex items-start gap-3 rounded-md bg-surface p-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-faint" />
            <div className="min-w-0 flex-1 text-sm">
              <p><strong>{e.actor?.displayName ?? e.actor?.username ?? '—'}</strong> {t(`audit.${e.action}`, { defaultValue: e.action })}</p>
              {e.reason && <p className="text-muted">“{e.reason}”</p>}
              {e.changes.length > 0 && <p className="truncate font-mono text-xs text-faint" dir="ltr">{e.changes.map((c) => `${c.key}: ${JSON.stringify(c.new ?? null)}`).join(' · ')}</p>}
            </div>
            <time className="shrink-0 text-xs text-faint">{fmt(e.createdAt)}</time>
          </li>
        ))}
      </ul>
    </>
  );
}

function DeleteServer({ guild, onDone }: { guild: Guild; onDone: () => void }) {
  const { t } = useTranslation();
  const mfa = useStore((s) => s.me?.mfaEnabled);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('DELETE', `/guilds/${guild.id}`, { password, code: mfa ? code : undefined });
      onDone();
    } catch (e) {
      setErr(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <H>{t('gs.deleteTitle', { name: guild.name })}</H>
      <p className="mb-6 text-muted">{t('gs.deleteSub')}</p>
      <div className="grid max-w-md gap-4">
        <Input label={t('settings.confirmPassword')} variant="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mfa && <Input label={t('settings.mfaCodeOrBackup')} value={code} dir="ltr" onChange={(e) => setCode(e.target.value)} />}
        <Err e={err} />
        <Button variant="danger" loading={busy} disabled={!password} onClick={() => void run()}>{t('gs.deleteConfirm')}</Button>
      </div>
    </>
  );
}
