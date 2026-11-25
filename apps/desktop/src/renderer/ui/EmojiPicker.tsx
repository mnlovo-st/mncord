// Compact emoji picker (unicode). Search works on English and Arabic keywords. Custom server emoji come in M5.
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from './cn';

type E = [emoji: string, keywords: string];
const GROUPS: { id: string; icon: string; items: E[] }[] = [
  { id: 'recent', icon: '🕘', items: [] },
  { id: 'smileys', icon: '😀', items: [
    ['😀', 'grin smile ابتسامة'], ['😂', 'joy laugh ضحك'], ['🤣', 'rofl ضحك'], ['😊', 'blush happy سعيد'], ['😍', 'love heart eyes حب'], ['😘', 'kiss بوسة'], ['😎', 'cool نظارة'],
    ['🤔', 'think تفكير'], ['😅', 'sweat محرج'], ['😭', 'cry sob بكاء'], ['😡', 'angry غضب'], ['😱', 'scream shock صدمة'], ['🥲', 'tear smile'], ['🙃', 'upside'], ['😴', 'sleep نوم'],
    ['🤯', 'mind blown'], ['🥳', 'party حفلة'], ['😇', 'angel ملاك'], ['🤐', 'zip'], ['🤫', 'shh سكوت'], ['🙄', 'eyeroll'], ['😬', 'grimace'], ['🤡', 'clown'], ['💀', 'skull dead'], ['👀', 'eyes عيون'],
  ] },
  { id: 'people', icon: '👍', items: [
    ['👍', 'thumbs up like تمام'], ['👎', 'thumbs down'], ['👏', 'clap تصفيق'], ['🙌', 'raise hands'], ['🙏', 'pray thanks شكرا دعاء'], ['🤝', 'handshake'], ['💪', 'strong muscle قوة'], ['👋', 'wave hello مرحبا'],
    ['✌️', 'peace victory'], ['🤞', 'fingers crossed'], ['👌', 'ok'], ['🫡', 'salute تحية'], ['🫶', 'heart hands'], ['🤌', 'pinched'],
  ] },
  { id: 'hearts', icon: '❤️', items: [
    ['❤️', 'red heart love قلب'], ['🧡', 'orange heart'], ['💛', 'yellow heart'], ['💚', 'green heart'], ['💙', 'blue heart'], ['💜', 'purple heart'], ['🖤', 'black heart'], ['🤍', 'white heart'], ['💔', 'broken heart'], ['💯', 'hundred'], ['✨', 'sparkles'], ['🔥', 'fire lit نار'], ['⭐', 'star نجمة'], ['🎉', 'tada party'],
  ] },
  { id: 'gaming', icon: '🎮', items: [
    ['🎮', 'game controller gaming ألعاب'], ['🕹️', 'joystick'], ['🏆', 'trophy win فوز'], ['🥇', 'gold'], ['⚔️', 'swords'], ['🛡️', 'shield'], ['🎯', 'target'], ['🎧', 'headphones سماعة'], ['🎤', 'mic مايك'], ['📺', 'tv stream بث'], ['💻', 'pc laptop'], ['🖥️', 'desktop'], ['⌨️', 'keyboard'], ['🖱️', 'mouse'],
  ] },
  { id: 'uae', icon: '🇦🇪', items: [
    ['🇦🇪', 'uae emirates الإمارات'], ['🌙', 'moon ramadan رمضان هلال'], ['🕌', 'mosque مسجد'], ['🐪', 'camel جمل'], ['🌴', 'palm نخلة'], ['☕', 'coffee قهوة'], ['🏜️', 'desert صحراء'], ['🌅', 'sunrise'], ['🏙️', 'city دبي'], ['⛵', 'boat'], ['🦅', 'falcon صقر'], ['🫖', 'tea شاي'],
  ] },
];
const ALL = GROUPS.flatMap((g) => g.items);
const RECENT_KEY = 'mncord.recentEmoji';

function recent(): E[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    return list.map((e) => ALL.find((x) => x[0] === e) ?? ([e, ''] as E));
  } catch {
    return [];
  }
}
function remember(e: string) {
  try {
    const list = [e, ...(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]).filter((x) => x !== e)].slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export interface CustomEmoji { id: string; name: string; url: string; guild: string }

export function EmojiPicker({ onPick, onClose, placeholder = 'Search emoji', custom = [] }: { onPick: (e: string, custom?: CustomEmoji) => void; onClose: () => void; placeholder?: string; custom?: CustomEmoji[] }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(custom.length ? 'server' : 'smileys');
  const customShown = q ? custom.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : group === 'server' ? custom : [];
  const ref = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => GROUPS.map((g) => (g.id === 'recent' ? { ...g, items: recent() } : g)), []);
  const shown = q ? ALL.filter((e) => e[1].toLowerCase().includes(q.toLowerCase())) : (groups.find((g) => g.id === group)?.items ?? []);

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) onClose();
    };
    setTimeout(() => {
      addEventListener('mousedown', close);
      addEventListener('keydown', close);
    });
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="dialog" aria-label={placeholder} className="anim-pop w-[320px] overflow-hidden rounded-lg bg-popover shadow-pop">
      <div className="p-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="h-8 w-full rounded-xs bg-surface-input px-2 text-sm text-text outline-none placeholder:text-faint" />
      </div>
      {!q && (
        <div className="flex gap-1 border-b border-border px-2 pb-1" role="tablist">
          {custom.length > 0 && (
            <button type="button" role="tab" aria-selected={group === 'server'} aria-label="server" onClick={() => setGroup('server')}
              className={cn('grid size-8 place-items-center rounded-xs', group === 'server' ? 'bg-surface-selected' : 'hover:bg-surface-hover')}><img src={custom[0]!.url} alt="" className="size-5 object-contain" /></button>
          )}
          {groups.filter((g) => g.id !== 'recent' || g.items.length).map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={group === g.id} aria-label={g.id} onClick={() => setGroup(g.id)}
              className={cn('grid size-8 place-items-center rounded-xs text-lg', group === g.id ? 'bg-surface-selected' : 'hover:bg-surface-hover')}>{g.icon}</button>
          ))}
        </div>
      )}
      <div className="grid h-56 grid-cols-8 content-start gap-0.5 overflow-y-auto p-2">
        {customShown.map((c) => (
          <button key={c.id} type="button" title={`:${c.name}:`} aria-label={c.name} onClick={() => onPick(`<:${c.name}:${c.id}>`, c)}
            className="grid size-9 place-items-center rounded-xs transition-transform hover:scale-110 hover:bg-surface-hover"><img src={c.url} alt={c.name} className="size-7 object-contain" /></button>
        ))}
        {(group !== 'server' || q) && shown.map(([e, kw]) => (
          <button key={e} type="button" title={kw.split(' ')[0]} aria-label={kw.split(' ')[0] || e} onClick={() => { remember(e); onPick(e); }}
            className="grid size-9 place-items-center rounded-xs text-2xl transition-transform hover:scale-110 hover:bg-surface-hover">{e}</button>
        ))}
      </div>
    </div>
  );
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '🙏'];
