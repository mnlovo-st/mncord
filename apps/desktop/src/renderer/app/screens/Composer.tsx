// Message composer: autogrow, uploads (button, drag-and-drop, paste), reply bar, emoji, typing pings.
import type { Attachment } from '@mncord/shared';
import { EyeOff, FileText, PlusCircle, Smile, X } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmojiPicker } from '../../ui/EmojiPicker';
import { cn } from '../../ui/cn';
import { ApiError, uploadFile } from '../api';
import { errorText } from '../i18n';

interface Upload { key: string; file: File; pct: number; done?: Attachment; error?: string; spoiler: boolean; preview?: string; ctrl: AbortController }

export interface ComposerHandle {
  addFiles: (files: FileList | File[]) => void;
  focus: () => void;
  insert: (text: string) => void;
}

export interface SendPayload { content: string; attachmentIds: string[]; spoilerIds: string[]; preview: Attachment[] }

export const Composer = forwardRef<ComposerHandle, {
  placeholder: string;
  disabled: boolean;
  channelId: string;
  replyTo: { id: string; name: string } | null;
  onCancelReply: () => void;
  onSend: (p: SendPayload) => void;
  onTyping: () => void;
  onEditLast: () => void;
  customEmoji?: import('../../ui/EmojiPicker').CustomEmoji[];
}>(function Composer({ placeholder, disabled, channelId, replyTo, onCancelReply, onSend, onTyping, onEditLast, customEmoji = [] }, ref) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [emoji, setEmoji] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const drafts = useRef<Record<string, string>>({});

  // per-channel drafts
  useEffect(() => {
    setText(drafts.current[channelId] ?? '');
    setUploads((u) => {
      u.forEach((x) => x.ctrl.abort());
      return [];
    });
    ta.current?.focus();
  }, [channelId]);
  useEffect(() => {
    drafts.current[channelId] = text;
  }, [text, channelId]);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.5)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) ta.current?.focus();
  }, [replyTo]);

  const addFiles = (files: FileList | File[]) => {
    setErr(null);
    for (const file of Array.from(files).slice(0, 10)) {
      if (file.size > 500 * 1024 * 1024) {
        setErr(errorText('file_too_large'));
        continue;
      }
      const key = crypto.randomUUID();
      const ctrl = new AbortController();
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setUploads((u) => [...u, { key, file, pct: 0, spoiler: false, preview, ctrl }].slice(0, 10));
      uploadFile(file, (pct) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct } : x))), ctrl.signal)
        .then((att) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct: 100, done: att } : x))))
        .catch((e: ApiError) => e.code !== 'aborted' && setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: errorText(e.code) } : x))));
    }
  };

  useImperativeHandle(ref, () => ({
    addFiles,
    focus: () => ta.current?.focus(),
    insert: (s) => setText((x) => x + s),
  }));

  const ready = uploads.length === 0 || uploads.every((u) => u.done || u.error);
  const send = () => {
    const content = text.trim();
    const ok = uploads.filter((u) => u.done);
    if ((!content && !ok.length) || !ready) return;
    onSend({ content, attachmentIds: ok.map((u) => u.done!.id), spoilerIds: ok.filter((u) => u.spoiler).map((u) => u.done!.id), preview: ok.map((u) => ({ ...u.done!, spoiler: u.spoiler })) });
    uploads.forEach((u) => u.preview && URL.revokeObjectURL(u.preview));
    setUploads([]);
    setText('');
    lastTyping.current = 0;
  };

  return (
    <div className="relative px-4">
      {emoji && (
        <div className="absolute bottom-full end-4 z-20 mb-2">
          <EmojiPicker placeholder={t('msg.emoji')} custom={customEmoji} onClose={() => setEmoji(false)} onPick={(e) => { setText((x) => x + e); setEmoji(false); ta.current?.focus(); }} />
        </div>
      )}
      <div className={cn('overflow-hidden rounded-md bg-surface-raised', disabled && 'opacity-60')}>
        {replyTo && (
          <div className="flex items-center justify-between bg-surface-selected/60 px-4 py-1.5 text-sm text-muted">
            <span>{t('msg.replyingTo', { name: replyTo.name })}</span>
            <button type="button" aria-label={t('msg.cancelReply')} onClick={onCancelReply} className="text-faint hover:text-text"><X className="size-4" /></button>
          </div>
        )}
        {uploads.length > 0 && (
          <ul className="flex gap-3 overflow-x-auto border-b border-border p-3">
            {uploads.map((u) => (
              <li key={u.key} className="relative w-[164px] shrink-0 rounded-md bg-surface p-2">
                <div className="grid h-[110px] place-items-center overflow-hidden rounded-sm bg-bg-deep">
                  {u.preview ? <img src={u.preview} alt="" className={cn('size-full object-cover', u.spoiler && 'blur-xl')} /> : <FileText className="size-12 text-link" />}
                </div>
                <p className="mt-1 truncate text-xs" dir="auto" title={u.file.name}>{u.file.name}</p>
                {u.error ? (
                  <p className="text-2xs text-danger-text">{u.error}</p>
                ) : !u.done ? (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-selected" role="progressbar" aria-valuenow={u.pct} aria-label={t('msg.uploading', { pct: u.pct })}>
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${u.pct}%` }} />
                  </div>
                ) : null}
                <div className="absolute end-1 top-1 flex gap-1">
                  {u.preview && (
                    <button type="button" aria-label={t('msg.spoiler')} aria-pressed={u.spoiler} onClick={() => setUploads((x) => x.map((y) => (y.key === u.key ? { ...y, spoiler: !y.spoiler } : y)))}
                      className={cn('grid size-6 place-items-center rounded-xs bg-surface-raised shadow-card', u.spoiler ? 'text-accent-text' : 'text-muted hover:text-text')}><EyeOff className="size-3.5" /></button>
                  )}
                  <button type="button" aria-label={t('msg.removeFile')} onClick={() => { u.ctrl.abort(); setUploads((x) => x.filter((y) => y.key !== u.key)); }}
                    className="grid size-6 place-items-center rounded-xs bg-surface-raised text-danger-text shadow-card"><X className="size-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex min-h-11 items-start gap-3 px-4">
          <button type="button" aria-label={t('msg.attach')} disabled={disabled} onClick={() => fileInput.current?.click()} className="mt-2.5 text-muted hover:text-text disabled:pointer-events-none"><PlusCircle className="size-6" /></button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <textarea
            ref={ta}
            rows={1}
            dir="auto"
            value={text}
            disabled={disabled}
            maxLength={4000}
            aria-label={placeholder}
            placeholder={placeholder}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                addFiles(e.clipboardData.files);
              }
            }}
            onChange={(e) => {
              setText(e.target.value);
              if (Date.now() - lastTyping.current > 5000 && e.target.value) {
                lastTyping.current = Date.now();
                onTyping();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              } else if (e.key === 'ArrowUp' && !text) {
                e.preventDefault();
                onEditLast();
              } else if (e.key === 'Escape' && replyTo) onCancelReply();
            }}
            className="max-h-[50vh] flex-1 resize-none bg-transparent py-2.5 text-base leading-[22px] text-text outline-none placeholder:text-faint"
          />
          {text.length > 3800 && <span className="mt-3 text-xs text-danger-text tabular-nums">{4000 - text.length}</span>}
          <button type="button" aria-label={t('msg.emoji')} disabled={disabled} onClick={() => setEmoji((x) => !x)} className="mt-2.5 text-muted hover:text-text disabled:pointer-events-none"><Smile className="size-6" /></button>
        </div>
      </div>
      {err && <p role="alert" className="mt-1 text-xs text-danger-text">{err}</p>}
    </div>
  );
});
