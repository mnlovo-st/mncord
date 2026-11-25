// S10 text channel / DM: history paging, new-messages divider, read acks, actions (react, reply, edit, pin,
// copy, delete), inline edit, drag-and-drop uploads, markdown, attachments.
import { has, P, type Channel, type Guild, type Message as Msg } from '@mncord/shared';
import { AtSign, Copy, Hash, Pencil, Pin, PinOff, Search, SmilePlus, Trash2, Upload, Users } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../ui/Button';
import { EmojiPicker, QUICK_REACTIONS } from '../../ui/EmojiPicker';
import { isJumbo, Markdown, type MdContext } from '../../ui/Markdown';
import { Message, ReplyIcon, TypingIndicator, type MessageAction } from '../../ui/Message';
import { Modal } from '../../ui/Modal';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuItem, MenuSeparator } from '../../ui/ContextMenu';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { api, ApiError, avatarUrl } from '../api';
import { errorText } from '../i18n';
import { send } from '../gateway';
import { usePrefs } from '../prefs';
import { dropMessage, openProfile, patchMessage, putMessage, set, useStore, type PendingMessage } from '../store';
import { Composer, type ComposerHandle, type SendPayload } from './Composer';
import { askOpenLink, Attachments } from './MessageParts';

const EMPTY: PendingMessage[] = [];
const GROUP_MS = 7 * 60 * 1000;
const PAGE = 50;

export function ChatView({ guild, channel, headerExtra }: { guild?: Guild; channel: Channel; headerExtra?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const messages = useStore((s) => s.messages[channel.id] ?? EMPTY);
  const loaded = useStore((s) => s.loaded[channel.id]);
  const hasMore = useStore((s) => s.hasMore[channel.id] ?? true);
  const me = useStore((s) => s.me);
  const names = useStore((s) => s.names);
  const typing = useStore((s) => s.typing[channel.id]);
  const lastRead = useStore((s) => s.readStates[channel.id]?.lastReadMessageId ?? null);
  const knownUsers = useStore(useShallow((s) => Object.values(s.relationships).map((r) => `${r.user.username}|${r.id}`)));
  const compact = usePrefs((p) => p.density === 'compact');
  const allEmoji = useStore(useShallow((s) => Object.values(s.guilds).flatMap((g) => g.emojis.map((e) => ({ ...e, guild: g.name })))));
  const emojiById = useMemo(() => new Map(allEmoji.map((e) => [e.id, e])), [allEmoji]);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [reactFor, setReactFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PendingMessage | null>(null);
  const [dragging, setDragging] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const composer = useRef<ComposerHandle>(null);
  const dividerAt = useRef<string | null>(null);

  const isDm = !guild;
  const dmPartner = useStore((s) => (channel.type === 'dm' ? s.privateChannels[channel.id]?.recipients[0]?.id : undefined));
  const iBlocked = useStore((s) => (dmPartner ? s.relationships[dmPartner]?.type === 'blocked' : false));
  const perms = guild ? BigInt(guild.myPermissions[channel.id] ?? '0') : iBlocked ? P.VIEW_CHANNEL : P.SEND_MESSAGES | P.VIEW_CHANNEL | P.ADD_REACTIONS | P.ATTACH_FILES;
  const canSend = has(perms, P.SEND_MESSAGES);
  const canManage = guild ? has(perms, P.MANAGE_MESSAGES) : false;
  const canPin = isDm || canManage;

  // remember where "new messages" starts when the channel opens
  useEffect(() => {
    dividerAt.current = lastRead;
    setEditing(null);
    setReplyTo(null);
    atBottom.current = true;
  }, [channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // first page
  useEffect(() => {
    if (loaded) return;
    setError(null);
    api<Msg[]>('GET', `/channels/${channel.id}/messages?limit=${PAGE}`)
      .then((list) => set((s) => ({
        messages: { ...s.messages, [channel.id]: list },
        loaded: { ...s.loaded, [channel.id]: true },
        hasMore: { ...s.hasMore, [channel.id]: list.length === PAGE },
        names: { ...s.names, ...Object.fromEntries(list.filter((m) => m.author).map((m) => [m.author!.id, m.author!.displayName ?? m.author!.username])) },
      })))
      .catch((e: ApiError) => setError(errorText(e.code)));
  }, [channel.id, loaded]);

  // older pages, keeping the scroll position steady
  const loadOlder = useCallback(async () => {
    const first = messages.find((m) => !m.pending);
    if (!first || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    try {
      const older = await api<Msg[]>('GET', `/channels/${channel.id}/messages?limit=${PAGE}&before=${first.id}`);
      set((s) => ({ messages: { ...s.messages, [channel.id]: [...older, ...(s.messages[channel.id] ?? [])] }, hasMore: { ...s.hasMore, [channel.id]: older.length === PAGE } }));
      requestAnimationFrame(() => el && (el.scrollTop += el.scrollHeight - before));
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, loadingOlder, hasMore, channel.id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, channel.id]);

  // read acks: when you're looking at the bottom of the channel
  const newest = [...messages].reverse().find((m) => !m.pending);
  useEffect(() => {
    if (!newest || (lastRead && newest.id <= lastRead)) return;
    const id = setTimeout(() => {
      if (!document.hasFocus() || !atBottom.current) return;
      set((s) => ({ readStates: { ...s.readStates, [channel.id]: { channelId: channel.id, lastReadMessageId: newest.id, mentionCount: 0 } } }));
      void api('POST', `/channels/${channel.id}/ack`, { messageId: newest.id }).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [newest?.id, lastRead, channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // jump requests from search / pins / reply previews
  useEffect(() => {
    const onJump = (e: Event) => {
      const { channelId, messageId } = (e as CustomEvent<{ channelId: string; messageId: string }>).detail;
      if (channelId !== channel.id) return;
      const el = document.getElementById(`m-${messageId}`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setFlash(messageId);
        setTimeout(() => setFlash(null), 1600);
      }
    };
    addEventListener('mncord:jump', onJump);
    return () => removeEventListener('mncord:jump', onJump);
  }, [channel.id]);

  const fmt = useMemo(() => {
    const loc = i18n.language === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB';
    const time = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' });
    const date = new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short' });
    return (iso: string) => {
      const d = new Date(iso);
      return new Date().toDateString() === d.toDateString() ? t('chat.today', { time: time.format(d) }) : date.format(d);
    };
  }, [i18n.language, t]);

  const usernames = useMemo(() => {
    const m = new Map<string, string>(knownUsers.map((x) => x.split('|') as [string, string]));
    for (const x of messages) if (x.author) m.set(x.author.username.toLowerCase(), x.author.id);
    if (me) m.set(me.username.toLowerCase(), me.id);
    return m;
  }, [knownUsers, messages, me]);

  const md: MdContext = useMemo(() => ({
    isMention: (u) => (me && u === me.username.toLowerCase() ? 'me' : usernames.has(u) ? 'other' : null),
    onMentionClick: (u, e) => {
      const id = usernames.get(u.toLowerCase());
      if (id) openProfile(id, e);
    },
    onLink: askOpenLink,
    emojiUrl: (id) => emojiById.get(id)?.url,
  }), [me, usernames, emojiById]);
  const renderEmoji = (e: string) => {
    const c = /^[0-9a-f-]{36}$/.test(e) ? emojiById.get(e) : undefined;
    return c ? <img src={c.url} alt={c.name} className="size-4 object-contain" /> : e;
  };

  const typingNames = Object.entries(typing ?? {}).filter(([uid, until]) => uid !== me?.id && until > Date.now()).map(([uid]) => names[uid] ?? '…');

  const sendMessage = async (p: SendPayload, nonce: string = crypto.randomUUID()) => {
    if (!me) return;
    const reply = replyTo;
    setReplyTo(null);
    putMessage({
      id: nonce, channelId: channel.id, content: p.content, nonce, type: reply ? 'reply' : 'default', replyToId: reply?.id ?? null, editedAt: null, createdAt: new Date().toISOString(),
      author: { id: me.id, username: me.username, displayName: me.displayName, avatarKey: me.avatarKey, status: me.status },
      attachments: p.preview, reactions: [], pinned: false, mentionIds: [], mentionEveryone: false, pending: 'sending',
    });
    atBottom.current = true;
    try {
      putMessage(await api<Msg>('POST', `/channels/${channel.id}/messages`, { content: p.content, nonce, attachmentIds: p.attachmentIds, spoilerIds: p.spoilerIds, replyToId: reply?.id }));
    } catch {
      set((s) => ({ messages: { ...s.messages, [channel.id]: (s.messages[channel.id] ?? []).map((x) => (x.nonce === nonce ? { ...x, pending: 'failed' as const } : x)) } }));
    }
  };

  const toggleReaction = (m: PendingMessage, emoji: string, mine: boolean) => {
    const path = `/channels/${channel.id}/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`;
    void api(mine ? 'DELETE' : 'PUT', path).catch(() => {});
  };

  const saveEdit = async (m: PendingMessage, content: string) => {
    setEditing(null);
    if (!content.trim() || content === m.content) return;
    patchMessage(channel.id, m.id, (x) => ({ ...x, content, editedAt: new Date().toISOString() }));
    await api('PATCH', `/channels/${channel.id}/messages/${m.id}`, { content }).catch(() => patchMessage(channel.id, m.id, () => m));
  };

  const doDelete = async (m: PendingMessage) => {
    setConfirmDelete(null);
    dropMessage(channel.id, m.id);
    await api('DELETE', `/channels/${channel.id}/messages/${m.id}`).catch(() => putMessage(m));
  };

  const actionsFor = (m: PendingMessage): MessageAction[] => {
    const mine = m.author?.id === me?.id;
    const list: MessageAction[] = [];
    if (canSend) list.push({ key: 'react', icon: <SmilePlus className="size-[18px]" />, label: t('msg.react'), onClick: (e) => setReactFor({ id: m.id, x: e.clientX, y: e.clientY }) });
    if (canSend) list.push({ key: 'reply', icon: <ReplyIcon />, label: t('msg.reply'), onClick: () => setReplyTo({ id: m.id, name: m.author?.displayName ?? m.author?.username ?? '…' }) });
    if (mine && (m.type === 'default' || m.type === 'reply')) list.push({ key: 'edit', icon: <Pencil className="size-[18px]" />, label: t('msg.edit'), onClick: () => setEditing(m.id) });
    if (canPin) list.push({ key: 'pin', icon: m.pinned ? <PinOff className="size-[18px]" /> : <Pin className="size-[18px]" />, label: m.pinned ? t('msg.unpin') : t('msg.pin'), onClick: () => void api(m.pinned ? 'DELETE' : 'PUT', `/channels/${channel.id}/pins/${m.id}`).catch(() => {}) });
    list.push({ key: 'copy', icon: <Copy className="size-[18px]" />, label: t('msg.copy'), onClick: () => void navigator.clipboard.writeText(m.content) });
    if (mine || canManage) list.push({ key: 'del', icon: <Trash2 className="size-[18px]" />, label: t('msg.del'), danger: true, onClick: (e) => (e.shiftKey ? void doDelete(m) : setConfirmDelete(m)) });
    return list;
  };

  const editLast = () => {
    const last = [...messages].reverse().find((m) => m.author?.id === me?.id && !m.pending && (m.type === 'default' || m.type === 'reply'));
    if (last) setEditing(last.id);
  };

  const placeholder = canSend ? (isDm ? t('dm.placeholder', { name: channel.name }) : t('chat.placeholder', { name: channel.name })) : isDm ? t('dm.blocked') : t('chat.noSend');

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (canSend && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (canSend && e.dataTransfer.files.length) composer.current?.addFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 shadow-low">
        {channel.type === 'group_dm' ? <Users aria-hidden className="size-6 text-faint" /> : isDm ? <AtSign aria-hidden className="size-6 text-faint" /> : <Hash aria-hidden className="size-6 text-faint" />}
        <h1 className="truncate font-semibold">{channel.name}</h1>
        {channel.topic && <p className="truncate border-s border-border ps-3 text-sm text-muted">{channel.topic}</p>}
        <div className="ms-auto flex items-center gap-3">
          {headerExtra}
          <Tooltip content={t('pins.title')} side="bottom">
            <button type="button" aria-label={t('pins.title')} onClick={() => set((s) => ({ rightPanel: s.rightPanel?.kind === 'pins' ? null : { kind: 'pins', channelId: channel.id, guildId: guild?.id ?? null } }))} className="text-muted hover:text-text"><Pin className="size-5" /></button>
          </Tooltip>
          <button type="button" onClick={() => set({ rightPanel: { kind: 'search', channelId: channel.id, guildId: guild?.id ?? null } })} className="flex h-6 w-36 items-center rounded-xs bg-bg-deep px-1.5 text-sm text-faint hover:text-muted">
            {t('search.placeholder')}<Search className="ms-auto size-4" />
          </button>
        </div>
      </header>

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          if (el.scrollTop < 300 && loaded) void loadOlder();
        }}
        className="flex-1 overflow-y-auto pb-6"
      >
        {loaded && !hasMore && (
          <div className="px-4 pb-2 pt-12">
            <div className="mb-3 grid size-16 place-items-center rounded-full bg-surface-raised">{isDm ? <AtSign className="size-9 text-text" /> : <Hash className="size-9 text-text" />}</div>
            <h2 className="font-display text-display font-bold">{isDm ? channel.name : t('chat.welcome', { name: channel.name })}</h2>
            <p className="text-muted">{channel.type === 'dm' ? t('dm.start', { name: channel.name }) : channel.type === 'group_dm' ? t('dm.groupStart', { name: channel.name }) : t('chat.welcomeSub', { name: channel.name })}</p>
          </div>
        )}
        {(loadingOlder || (!loaded && !error)) && <MessageSkeleton />}
        {error && <p role="alert" className="px-4 pt-4 text-sm text-danger-text">{error}</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDivider = !!dividerAt.current && !m.pending && m.id > dividerAt.current && (!prev || !!prev.pending || prev.id <= dividerAt.current) && m.author?.id !== me?.id;
          const divider = showDivider ? (
            <div className="mx-4 my-2 flex items-center gap-2 text-2xs font-bold uppercase text-danger-text" role="separator">
              <span className="h-px flex-1 bg-danger" />{t('msg.newMessages')}
            </div>
          ) : null;
          if (m.type === 'system_join' || m.type === 'system_pin') {
            const who = m.author?.displayName ?? m.author?.username ?? '…';
            return (
              <div key={m.id} id={`m-${m.id}`}>
                {divider}
                <div className="mt-4 flex items-center gap-3 ps-[72px] text-sm text-muted">
                  {m.type === 'system_pin' ? <Pin aria-hidden className="size-4 text-faint" /> : <span aria-hidden className="text-success">→</span>}
                  <span>{m.type === 'system_pin' ? t('msg.pinned', { name: who }) : t('chat.joined', { name: who })}</span>
                  <time className="text-xs text-faint">{fmt(m.createdAt)}</time>
                </div>
              </div>
            );
          }
          const grouped = !showDivider && !!prev && prev.type !== 'system_join' && prev.type !== 'system_pin' && !m.replyToId && prev.author?.id === m.author?.id && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_MS;
          const mentioned = !!me && (m.mentionIds.includes(me.id) || (m.mentionEveryone && m.author?.id !== me.id));
          const replyName = m.replyTo?.author ? (m.replyTo.author.displayName ?? m.replyTo.author.username) : null;
          return (
            <ContextMenu key={m.nonce ?? m.id}>
            <ContextMenuTrigger asChild disabled={!!m.pending || editing === m.id}>
            <div id={`m-${m.id}`}>
              {divider}
              <Message
                author={m.author?.displayName ?? m.author?.username ?? 'Deleted user'}
                authorColor={guild && m.author?.id === guild.ownerId ? 'var(--c-accent-text)' : undefined}
                onAuthorClick={m.author ? (e) => openProfile(m.author!.id, e) : undefined}
                avatarSrc={avatarUrl(m.author?.avatarKey)}
                time={fmt(m.createdAt)}
                grouped={grouped}
                compact={compact}
                highlighted={mentioned}
                flash={flash === m.id}
                edited={!!m.editedAt}
                state={m.pending === 'failed' ? 'failed' : m.pending === 'sending' ? 'sending' : 'sent'}
                reply={m.replyTo && replyName ? { author: replyName, text: m.replyTo.content } : null}
                onReplyClick={() => m.replyTo && dispatchEvent(new CustomEvent('mncord:jump', { detail: { channelId: channel.id, messageId: m.replyTo.id } }))}
                reactions={m.reactions}
                renderEmoji={renderEmoji}
                onReactionClick={(emoji, mine) => toggleReaction(m, emoji, mine)}
                actions={actionsFor(m)}
                labels={{ failed: t('chat.failed'), edited: t('chat.edited'), toolbar: t('msg.toolbar') }}
                editing={editing === m.id ? <InlineEdit initial={m.content} hint={t('msg.editHint')} onSave={(c) => void saveEdit(m, c)} onCancel={() => setEditing(null)} /> : undefined}
              >
                {m.content && (isJumbo(m.content) ? <span className="text-5xl leading-[56px]">{m.content}</span> : <Markdown text={m.content} ctx={md} />)}
                {m.attachments.length > 0 && <Attachments items={m.attachments} />}
              </Message>
              {m.pending === 'failed' && (
                <div className="flex gap-3 ps-[72px] text-xs">
                  <button type="button" className="font-semibold text-link hover:underline" onClick={() => { dropMessage(channel.id, m.nonce!); void sendMessage({ content: m.content, attachmentIds: m.attachments.map((a) => a.id), spoilerIds: [], preview: m.attachments }, m.nonce!); }}>{t('chat.retry')}</button>
                  <button type="button" className="font-semibold text-link hover:underline" onClick={() => dropMessage(channel.id, m.nonce!)}>{t('chat.del')}</button>
                </div>
              )}
            </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {actionsFor(m).map((a) => (
                <MenuItem key={a.key} danger={a.danger} icon={a.icon} onSelect={() => a.onClick({ clientX: innerWidth / 2, clientY: innerHeight / 2, shiftKey: false } as React.MouseEvent)}>{a.label}</MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={() => void navigator.clipboard.writeText(m.id)}>{t('ctx.copyId')}</MenuItem>
            </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      <Composer
        ref={composer}
        placeholder={placeholder}
        disabled={!canSend}
        channelId={channel.id}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={(p) => void sendMessage(p)}
        onTyping={() => send({ op: 'typing', channelId: channel.id })}
        onEditLast={editLast}
        customEmoji={allEmoji}
      />
      <div className="h-6 px-4">{typingNames.length > 0 && <TypingIndicator text={t('chat.typing', { count: typingNames.length, names: typingNames.slice(0, 3).join(i18n.language === 'ar' ? '، ' : ', ') })} />}</div>

      {reactFor && (
        <div className="fixed z-50" style={{ left: Math.max(8, Math.min(reactFor.x, innerWidth - 336)), top: Math.max(8, Math.min(reactFor.y - 300, innerHeight - 360)) }}>
          <div className="mb-1 flex gap-1 rounded-lg bg-popover p-1 shadow-pop">
            {QUICK_REACTIONS.map((e) => {
              const m = messages.find((x) => x.id === reactFor.id);
              return (
                <button key={e} type="button" className="grid size-9 place-items-center rounded-sm text-xl hover:bg-surface-hover" onClick={() => { if (m) toggleReaction(m, e, !!m.reactions.find((r) => r.emoji === e)?.me); setReactFor(null); }}>{e}</button>
              );
            })}
          </div>
          <EmojiPicker placeholder={t('msg.emoji')} custom={allEmoji} onClose={() => setReactFor(null)} onPick={(e, c) => { const key = c ? c.id : e; const m = messages.find((x) => x.id === reactFor.id); if (m) toggleReaction(m, key, !!m.reactions.find((r) => r.emoji === key)?.me); setReactFor(null); }} />
        </div>
      )}

      {confirmDelete && (
        <Modal open onOpenChange={(o) => !o && setConfirmDelete(null)} title={t('msg.deleteTitle')} description={t('msg.deleteSub')} closeLabel={t('common.close')}
          footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void doDelete(confirmDelete)}>{t('msg.deleteConfirm')}</Button></>}>
          <div className="max-h-40 overflow-hidden rounded-md border border-border p-3 text-sm" dir="auto">{confirmDelete.content}</div>
        </Modal>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-bg/90">
          <div className="flex flex-col items-center gap-2 text-center"><Upload className="size-12 text-accent-text" /><p className="text-lg font-semibold">{t('msg.dropHere', { name: channel.name })}</p></div>
        </div>
      )}
    </div>
  );
}

function InlineEdit({ initial, hint, onSave, onCancel }: { initial: string; hint: string; onSave: (s: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  return (
    <div className="mt-1">
      <textarea ref={ref} value={v} dir="auto" rows={1} maxLength={4000} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave(v);
          }
        }}
        className="w-full resize-none rounded-md bg-surface-raised px-3 py-2 text-base leading-[22px] text-text outline-none" />
      <p className="text-xs text-faint">{hint}</p>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-4 py-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-surface-raised" />
          <div className="flex-1 space-y-2">
            <div className={cn('h-3 animate-pulse rounded-full bg-surface-raised', i === 1 ? 'w-24' : 'w-32')} />
            <div className={cn('h-3 animate-pulse rounded-full bg-surface-raised', i === 0 ? 'w-3/4' : i === 1 ? 'w-1/2' : 'w-2/3')} />
          </div>
        </div>
      ))}
    </div>
  );
}
