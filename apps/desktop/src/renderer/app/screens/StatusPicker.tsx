// S37 status picker: online / idle / do not disturb / invisible + a custom status line.
import type { SelfUser } from '@mncord/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../ui/cn';
import { api } from '../api';
import { set, useStore } from '../store';

const STATUSES = [
  { id: 'online', color: 'bg-online' },
  { id: 'idle', color: 'bg-idle' },
  { id: 'dnd', color: 'bg-dnd' },
  { id: 'invisible', color: 'bg-offline' },
] as const;

export function StatusPicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const [text, setText] = useState(me?.customStatus?.text ?? '');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) && onClose();
    setTimeout(() => {
      addEventListener('mousedown', close);
      addEventListener('keydown', close);
    });
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [onClose]);
  const patch = async (body: Record<string, unknown>) => {
    const u = await api<SelfUser>('PATCH', '/users/@me', body).catch(() => null);
    if (u) set({ me: u });
  };
  return (
    <div ref={ref} role="menu" aria-label={t('status.online')} className="anim-pop fixed bottom-16 start-[80px] z-50 w-64 rounded-lg bg-popover p-2 shadow-pop">
      <form onSubmit={(e) => { e.preventDefault(); void patch({ customStatus: text.trim() ? { text: text.trim() } : null }); onClose(); }}>
        <input value={text} maxLength={128} onChange={(e) => setText(e.target.value)} dir="auto" placeholder={t('status.custom')} aria-label={t('status.custom')}
          className="mb-2 h-9 w-full rounded-sm bg-surface-input px-2 text-sm text-text outline-none placeholder:text-faint" />
      </form>
      {STATUSES.map((s) => (
        <button key={s.id} type="button" role="menuitemradio" aria-checked={me?.status === s.id} onClick={() => { void patch({ status: s.id }); onClose(); }}
          className={cn('flex h-9 w-full items-center gap-3 rounded-xs px-2 text-sm hover:bg-surface-selected', me?.status === s.id ? 'text-text' : 'text-muted')}>
          <span className={cn('size-2.5 rounded-full', s.color)} />
          {t(`status.${s.id}`)}
        </button>
      ))}
    </div>
  );
}
