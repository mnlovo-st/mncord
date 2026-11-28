// S19 create server · S20 join via invite · invite people
import { CreateGuildInput, type Guild, type Invite } from '@mncord/shared';
import { Check, Copy, Gamepad2, Heart, Sparkles, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { cn } from '../../ui/cn';
import { api, ApiError, avatarUrl } from '../api';
import { errorText } from '../i18n';
import { firstTextChannel, upsertGuild, useStore } from '../store';

type Template = 'friends' | 'gaming' | 'community' | 'blank';
const TEMPLATES: { id: Template; icon: typeof Heart }[] = [
  { id: 'friends', icon: Heart },
  { id: 'gaming', icon: Gamepad2 },
  { id: 'community', icon: Users },
  { id: 'blank', icon: Sparkles },
];

export function CreateGuildModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (g: Guild) => void }) {
  const { t, i18n } = useTranslation();
  const me = useStore((s) => s.me);
  const [template, setTemplate] = useState<Template>('friends');
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(t('createGuild.defaultName', { name: me?.displayName ?? me?.username ?? '' }));
      setError(undefined);
    }
  }, [open, me, t]);

  async function create() {
    const parsed = CreateGuildInput.safeParse({ name, template, locale: i18n.language });
    if (!parsed.success) return setError(errorText(parsed.error.issues[0]?.message));
    setBusy(true);
    try {
      const g = await api<Guild>('POST', '/guilds', parsed.data);
      upsertGuild(g);
      onCreated(g);
      onClose();
    } catch (e) {
      setError(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={t('createGuild.title')}
      description={t('createGuild.sub')}
      closeLabel={t('common.close')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} onClick={() => void create()}>{t('createGuild.create')}</Button></>}
    >
      <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">{t('createGuild.template')}</p>
      <div role="radiogroup" aria-label={t('createGuild.template')} className="mb-4 grid grid-cols-2 gap-2">
        {TEMPLATES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={template === id}
            onClick={() => setTemplate(id)}
            className={cn('flex h-14 items-center gap-3 rounded-md border px-3 text-start font-semibold transition-colors', template === id ? 'border-accent bg-mention text-text' : 'border-border bg-surface hover:bg-surface-hover')}
          >
            <Icon aria-hidden className="size-5 text-accent-text" />
            {t(`createGuild.${id}`)}
          </button>
        ))}
      </div>
      <Input label={t('createGuild.name')} value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={100} onKeyDown={(e) => e.key === 'Enter' && void create()} />
    </Modal>
  );
}

/** Accepts a raw code or any link ending in /<code>. */
const parseCode = (s: string) => s.trim().split(/[/\s]/).filter(Boolean).pop() ?? '';

export function JoinGuildModal({ open, onClose, onJoined }: { open: boolean; onClose: () => void; onJoined: (g: Guild) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<Invite | null>(null);
  // typing a server's name finds it (servers that allow being found)
  const [found, setFound] = useState<{ id: string; name: string; iconKey: string | null; memberCount: number; joined: boolean }[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setValue('');
      setPreview(null);
      setFound(null);
      setError(undefined);
    }
  }, [open]);
  useEffect(() => {
    const q = value.trim();
    setFound(null);
    if (q.length < 2 || /^https?:|\//.test(q)) return;
    const id = setTimeout(() => {
      api<NonNullable<typeof found>>('GET', `/guilds/search?q=${encodeURIComponent(q)}`).then(setFound, () => setFound([]));
    }, 300);
    return () => clearTimeout(id);
  }, [value]);
  async function joinById(id: string) {
    setJoining(id);
    setError(undefined);
    try {
      const g = await api<Guild>('POST', `/guilds/${id}/join`);
      upsertGuild(g);
      onJoined(g);
      onClose();
    } catch (e) {
      setError(errorText((e as ApiError).code));
    } finally {
      setJoining(null);
    }
  }
  useEffect(() => {
    const code = parseCode(value);
    setPreview(null);
    if (code.length < 8) return;
    const id = setTimeout(() => {
      api<Invite>('GET', `/invites/${encodeURIComponent(code)}`).then(setPreview, () => setPreview(null));
    }, 350);
    return () => clearTimeout(id);
  }, [value]);

  async function join() {
    const code = parseCode(value);
    if (!code) return;
    setBusy(true);
    setError(undefined);
    try {
      const g = await api<Guild>('POST', `/invites/${encodeURIComponent(code)}`);
      upsertGuild(g);
      onJoined(g);
      onClose();
    } catch (e) {
      setError(errorText((e as ApiError).code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={t('joinGuild.title')}
      description={t('joinGuild.sub')}
      closeLabel={t('common.close')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} disabled={!parseCode(value)} onClick={() => void join()}>{t('joinGuild.join')}</Button></>}
    >
      <Input label={t('joinGuild.code')} value={value} onChange={(e) => setValue(e.target.value)} error={error} dir="ltr" autoFocus onKeyDown={(e) => e.key === 'Enter' && void join()} />
      {found && found.length > 0 && !preview && (
        <div className="anim-fade mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
          <p className="text-2xs font-bold uppercase tracking-wide text-muted">{t('joinGuild.found')}</p>
          {found.map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-md bg-surface p-2.5">
              {g.iconKey ? <img src={avatarUrl(g.iconKey)} alt="" className="size-10 rounded-guild object-cover" /> : <div className="grid size-10 place-items-center rounded-guild bg-accent font-display font-bold text-on-accent">{[...g.name][0]}</div>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" dir="auto">{g.name}</p>
                <p className="text-xs text-muted">{t('joinGuild.preview', { count: g.memberCount })}</p>
              </div>
              <Button size="sm" variant={g.joined ? 'secondary' : 'primary'} loading={joining === g.id} onClick={() => void joinById(g.id)}>{g.joined ? t('joinGuild.open') : t('joinGuild.joinShort')}</Button>
            </div>
          ))}
        </div>
      )}
      {found && found.length === 0 && !preview && value.trim().length >= 2 && parseCode(value).length < 8 && <p className="mt-3 text-sm text-muted">{t('joinGuild.none')}</p>}
      {preview && (
        <div className="anim-fade mt-3 flex items-center gap-3 rounded-md bg-surface p-3">
          <div className="grid size-12 place-items-center rounded-guild bg-accent font-display font-bold text-on-accent">{[...preview.guild.name][0]}</div>
          <div>
            <p className="font-semibold">{preview.guild.name}</p>
            <p className="text-sm text-muted">{t('joinGuild.preview', { count: preview.guild.memberCount })}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function InviteModal({ open, onClose, guild }: { open: boolean; onClose: () => void; guild: Guild }) {
  const { t } = useTranslation();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    setCode(null);
    setCopied(false);
    setError(undefined);
    const ch = firstTextChannel(guild);
    if (!ch) return;
    api<{ code: string }>('POST', `/channels/${ch}/invites`, {}).then((r) => setCode(r.code), (e: ApiError) => setError(errorText(e.code)));
  }, [open, guild]);

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={t('invite.title', { name: guild.name })} description={t('invite.sub')} closeLabel={t('common.close')}>
      {error ? (
        <p role="alert" className="text-sm text-danger-text">{error}</p>
      ) : (
        <div className="flex items-center gap-2 rounded-sm border border-border-input bg-surface-input p-1 ps-3" dir="ltr">
          <code className="min-w-0 flex-1 truncate font-mono text-sm">{code ?? '…'}</code>
          <Button
            size="sm"
            variant={copied ? 'success' : 'primary'}
            disabled={!code}
            icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            onClick={() => {
              if (!code) return;
              void navigator.clipboard.writeText(code);
              setCopied(true);
            }}
          >
            {copied ? t('invite.copied') : t('invite.copy')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
