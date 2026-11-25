// S31 quick switcher (Ctrl+K): jump to any channel, DM, server or friend. Prefixes: # channels, @ people, * servers, ! voice.
import { AtSign, Hash, Server, Users, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../ui/cn';
import { dmAsChannel, firstTextChannel, get, set } from '../store';
import { joinVoice } from '../voice';
import { openDm } from './Home';

interface Item { key: string; kind: 'channel' | 'voice' | 'dm' | 'guild' | 'friend'; label: string; hint: string; run: () => void }

const norm = (s: string) => s.toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ً-ْ]/g, '');
/** subsequence match with a small bonus for prefix/word starts */
function score(q: string, text: string) {
  const a = norm(q);
  const b = norm(text);
  if (!a) return 1;
  if (b.startsWith(a)) return 100 - b.length;
  if (b.includes(a)) return 60 - b.length;
  let i = 0;
  for (const ch of b) if (ch === a[i]) i++;
  return i === a.length ? 20 - b.length : -1;
}

export function QuickSwitcher() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQ('');
        setSel(0);
      } else if (e.key === 'Escape') setOpen(false);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus());
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const s = get();
    const out: Item[] = [];
    for (const g of Object.values(s.guilds)) {
      out.push({ key: `g${g.id}`, kind: 'guild', label: g.name, hint: '', run: () => set((x) => ({ selectedGuild: g.id, selectedChannel: { ...x.selectedChannel, [g.id]: x.selectedChannel[g.id] ?? firstTextChannel(g) ?? '' } })) });
      for (const c of g.channels) {
        if (c.type === 'text' || c.type === 'announcement') out.push({ key: c.id, kind: 'channel', label: c.name ?? '', hint: g.name, run: () => set((x) => ({ selectedGuild: g.id, selectedChannel: { ...x.selectedChannel, [g.id]: c.id } })) });
        if (c.type === 'voice') out.push({ key: c.id, kind: 'voice', label: c.name ?? '', hint: g.name, run: () => { set((x) => ({ selectedGuild: g.id, selectedChannel: { ...x.selectedChannel, [g.id]: c.id } })); void joinVoice(g.id, c.id); } });
      }
    }
    for (const pc of Object.values(s.privateChannels)) out.push({ key: pc.id, kind: 'dm', label: dmAsChannel(pc).name ?? '', hint: pc.type === 'group_dm' ? t('friends.dms') : '', run: () => set({ selectedGuild: null, selectedPrivate: pc.id }) });
    for (const r of Object.values(s.relationships)) {
      if (r.type !== 'friend') continue;
      if (Object.values(s.privateChannels).some((pc) => pc.type === 'dm' && pc.recipients[0]?.id === r.id)) continue;
      out.push({ key: `f${r.id}`, kind: 'friend', label: r.user.displayName ?? r.user.username, hint: `@${r.user.username}`, run: () => void openDm(r.id) });
    }
    return out;
  }, [open, t]);

  const shown = useMemo(() => {
    let term = q.trim();
    let kinds: Item['kind'][] | null = null;
    if (term.startsWith('#')) (kinds = ['channel']), (term = term.slice(1));
    else if (term.startsWith('@')) (kinds = ['dm', 'friend']), (term = term.slice(1));
    else if (term.startsWith('*')) (kinds = ['guild']), (term = term.slice(1));
    else if (term.startsWith('!')) (kinds = ['voice']), (term = term.slice(1));
    return items
      .filter((i) => !kinds || kinds.includes(i.kind))
      .map((i) => ({ i, s: score(term, `${i.label} ${i.hint}`) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.i);
  }, [items, q]);

  if (!open) return null;
  const go = (i: Item | undefined) => {
    if (!i) return;
    i.run();
    setOpen(false);
  };
  const Icon = { channel: Hash, voice: Volume2, dm: AtSign, guild: Server, friend: Users };
  return (
    <div className="anim-fade fixed inset-0 z-50 grid place-items-start justify-center bg-black/70 pt-[15vh]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-label={t('qs.title')} className="anim-pop w-[min(560px,92vw)] rounded-lg bg-bg p-4 shadow-modal">
        <p className="mb-2 font-display text-lg font-semibold">{t('qs.title')}</p>
        <input ref={input} value={q} dir="auto" placeholder={t('qs.placeholder')} aria-label={t('qs.placeholder')}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(x + 1, shown.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(x - 1, 0)); }
            if (e.key === 'Enter') go(shown[sel]);
          }}
          className="h-12 w-full rounded-md bg-bg-deep px-4 text-lg text-text outline-none placeholder:text-faint" />
        <ul role="listbox" className="mt-3 max-h-80 overflow-y-auto">
          {shown.map((i, n) => {
            const I = Icon[i.kind];
            return (
              <li key={i.key} role="option" aria-selected={n === sel}>
                <button type="button" onMouseEnter={() => setSel(n)} onClick={() => go(i)}
                  className={cn('flex h-10 w-full items-center gap-3 rounded-sm px-3 text-start', n === sel ? 'bg-surface-selected text-text' : 'text-muted')}>
                  <I aria-hidden className="size-4 shrink-0" />
                  <span className="truncate font-medium" dir="auto">{i.label}</span>
                  {i.hint && <span className="ms-auto truncate text-xs text-faint" dir="auto">{i.hint}</span>}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="py-6 text-center text-muted">{t('search.none')}</li>}
        </ul>
        <p className="mt-3 text-xs text-faint">{t('qs.tip')}</p>
      </div>
    </div>
  );
}
