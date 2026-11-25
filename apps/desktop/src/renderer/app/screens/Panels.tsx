// Right-side panels: search (S26) and pinned messages (S27).
import type { Message } from '@mncord/shared';
import { Pin, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { Markdown } from '../../ui/Markdown';
import { api, ApiError } from '../api';
import { errorText } from '../i18n';
import { set, useStore } from '../store';
import { askOpenLink, Attachments } from './MessageParts';

const md = { isMention: () => null, onLink: askOpenLink };
const jump = (m: Message) => dispatchEvent(new CustomEvent('mncord:jump', { detail: { channelId: m.channelId, messageId: m.id } }));

export function RightPanel() {
  const panel = useStore((s) => s.rightPanel);
  if (!panel) return null;
  return (
    <aside className="anim-fade flex w-[400px] shrink-0 flex-col border-s border-border bg-surface">
      {panel.kind === 'search' ? <SearchPanel guildId={panel.guildId} channelId={panel.channelId} /> : <PinsPanel channelId={panel.channelId} />}
    </aside>
  );
}

function Result({ m, onJump, extra }: { m: Message; onJump: () => void; extra?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(m.createdAt));
  return (
    <li className="group relative rounded-md border border-border bg-bg p-3">
      <div className="flex items-center gap-2">
        <Avatar name={m.author?.displayName ?? m.author?.username ?? '?'} size={24} />
        <span className="font-medium">{m.author?.displayName ?? m.author?.username ?? '…'}</span>
        <time className="text-xs text-faint">{when}</time>
      </div>
      <div className="mt-1 break-words text-sm" dir="auto"><Markdown text={m.content} ctx={md} /></div>
      {m.attachments.length > 0 && <Attachments items={m.attachments} />}
      <div className="absolute end-2 top-2 hidden gap-1 group-hover:flex">
        {extra}
        <button type="button" onClick={onJump} className="rounded-xs bg-surface-raised px-2 py-0.5 text-xs font-semibold text-text hover:bg-surface-selected">{t('search.jump')}</button>
      </div>
    </li>
  );
}

function SearchPanel({ guildId, channelId }: { guildId: string | null; channelId: string }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Message[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scope = guildId ? `guildId=${guildId}` : `channelId=${channelId}`;

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults(null);
      return;
    }
    const id = setTimeout(() => {
      setBusy(true);
      api<{ messages: Message[] }>('GET', `/search?${scope}&q=${encodeURIComponent(term)}`)
        .then((r) => {
          setResults(r.messages);
          setErr(null);
        })
        .catch((e: ApiError) => setErr(errorText(e.code)))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(id);
  }, [q, scope]);

  const go = (m: Message) => {
    if (guildId) set((s) => ({ selectedChannel: { ...s.selectedChannel, [guildId]: m.channelId } }));
    setTimeout(() => jump(m), 300);
  };

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-sm bg-bg-deep px-2">
          <Search aria-hidden className="size-4 text-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} dir="auto" className="flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
        </div>
        <button type="button" aria-label={t('search.close')} onClick={() => set({ rightPanel: null })} className="text-faint hover:text-text"><X className="size-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {err && <p role="alert" className="text-sm text-danger-text">{err}</p>}
        {busy && <p className="text-sm text-faint">…</p>}
        {results && (
          <>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-faint">{t('search.results', { count: results.length })}</p>
            {results.length === 0 ? <p className="mt-10 text-center text-muted">{t('search.none')}</p> : <ul className="flex flex-col gap-2">{results.map((m) => <Result key={m.id} m={m} onJump={() => go(m)} />)}</ul>}
          </>
        )}
      </div>
    </>
  );
}

function PinsPanel({ channelId }: { channelId: string }) {
  const { t } = useTranslation();
  const [pins, setPins] = useState<Message[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // refresh when a pin changes in this channel
  const pinnedIds = useStore((s) => (s.messages[channelId] ?? []).filter((m) => m.pinned).map((m) => m.id).join(','));
  useEffect(() => {
    api<Message[]>('GET', `/channels/${channelId}/pins`).then(setPins, (e: ApiError) => setErr(errorText(e.code)));
  }, [channelId, pinnedIds]);
  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Pin className="size-5 text-faint" />
        <h2 className="flex-1 font-semibold">{t('pins.title')}</h2>
        <button type="button" aria-label={t('search.close')} onClick={() => set({ rightPanel: null })} className="text-faint hover:text-text"><X className="size-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {err && <p role="alert" className="text-sm text-danger-text">{err}</p>}
        {pins && pins.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted"><Pin className="size-10 text-faint" />{t('pins.none')}</div>
        )}
        <ul className="flex flex-col gap-2">
          {pins?.map((m) => (
            <Result key={m.id} m={m} onJump={() => jump(m)}
              extra={<button type="button" onClick={() => void api('DELETE', `/channels/${channelId}/pins/${m.id}`).then(() => setPins((p) => p?.filter((x) => x.id !== m.id) ?? null))} className="rounded-xs bg-surface-raised px-2 py-0.5 text-xs font-semibold text-danger-text hover:bg-surface-selected">{t('pins.unpin')}</button>} />
          ))}
        </ul>
      </div>
    </>
  );
}
