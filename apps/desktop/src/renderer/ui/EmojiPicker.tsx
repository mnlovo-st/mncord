// Emoji picker: every Unicode emoji + the server's own. Search works on English names and Arabic keywords.
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from './cn';
import { EMOJI_GROUPS } from './emojiData';

type E = [emoji: string, keywords: string];
// Arabic + extra keywords for common emoji, merged into the full Unicode list below
const EXTRA: Record<string, string> = {"😀": "grin smile ابتسامة", "😂": "joy laugh ضحك", "🤣": "rofl ضحك", "😊": "blush happy سعيد", "😍": "love heart eyes حب", "😘": "kiss بوسة", "😎": "cool نظارة", "🤔": "think تفكير", "😅": "sweat محرج", "😭": "cry sob بكاء", "😡": "angry غضب", "😱": "scream shock صدمة", "🥲": "tear smile", "🙃": "upside", "😴": "sleep نوم", "🤯": "mind blown", "🥳": "party حفلة", "😇": "angel ملاك", "🤐": "zip", "🤫": "shh سكوت", "🙄": "eyeroll", "😬": "grimace", "🤡": "clown", "💀": "skull dead", "👀": "eyes عيون", "👍": "thumbs up like تمام", "👎": "thumbs down", "👏": "clap تصفيق", "🙌": "raise hands", "🙏": "pray thanks شكرا دعاء", "🤝": "handshake", "💪": "strong muscle قوة", "👋": "wave hello مرحبا", "✌️": "peace victory", "🤞": "fingers crossed", "👌": "ok", "🫡": "salute تحية", "🫶": "heart hands", "🤌": "pinched", "❤️": "red heart love قلب", "🧡": "orange heart", "💛": "yellow heart", "💚": "green heart", "💙": "blue heart", "💜": "purple heart", "🖤": "black heart", "🤍": "white heart", "💔": "broken heart", "💯": "hundred", "✨": "sparkles", "🔥": "fire lit نار", "⭐": "star نجمة", "🎉": "tada party", "🎮": "game controller gaming ألعاب", "🕹️": "joystick", "🏆": "trophy win فوز", "🥇": "gold", "⚔️": "swords", "🛡️": "shield", "🎯": "target", "🎧": "headphones سماعة", "🎤": "mic مايك", "📺": "tv stream بث", "💻": "pc laptop", "🖥️": "desktop", "⌨️": "keyboard", "🖱️": "mouse", "🇦🇪": "uae emirates الإمارات", "🌙": "moon ramadan رمضان هلال", "🕌": "mosque مسجد", "🐪": "camel جمل", "🌴": "palm نخلة", "☕": "coffee قهوة", "🏜️": "desert صحراء", "🌅": "sunrise", "🏙️": "city دبي", "⛵": "boat", "🦅": "falcon صقر", "🫖": "tea شاي"};
const withExtra = (items: [string, string][]): E[] => items.map(([e, n]) => [e, EXTRA[e] ? `${n} ${EXTRA[e]}` : n]);
const GROUPS: { id: string; icon: string; items: E[] }[] = [
  { id: 'recent', icon: '🕘', items: [] },
  ...EMOJI_GROUPS.slice(0, 1).map((g) => ({ ...g, items: withExtra(g.items) })),
  { id: 'uae', icon: '🇦🇪', items: [
    ['🇦🇪', 'uae emirates الإمارات'], ['🌙', 'moon ramadan رمضان هلال'], ['🕌', 'mosque مسجد'], ['🐪', 'camel جمل'], ['🌴', 'palm نخلة'], ['☕', 'coffee قهوة'], ['🏜️', 'desert صحراء'], ['🌅', 'sunrise'], ['🏙️', 'city دبي'], ['⛵', 'boat'], ['🦅', 'falcon صقر'], ['🫖', 'tea شاي'],
  ] },
  ...EMOJI_GROUPS.slice(1).map((g) => ({ ...g, items: withExtra(g.items) })),
];
const seen = new Set<string>();
const ALL = GROUPS.flatMap((g) => g.items).filter((e) => !seen.has(e[0]) && !!seen.add(e[0]));
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
  const shown = q ? ALL.filter((e) => e[1].toLowerCase().includes(q.toLowerCase()) || e[0] === q.trim()).slice(0, 300) : (groups.find((g) => g.id === group)?.items ?? []);

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
    <div ref={ref} role="dialog" aria-label={placeholder} className="anim-pop w-[384px] overflow-hidden rounded-lg bg-popover shadow-pop">
      <div className="p-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="h-8 w-full rounded-xs bg-surface-input px-2 text-sm text-text outline-none placeholder:text-faint" />
      </div>
      {!q && (
        <div className="flex gap-0.5 overflow-x-auto border-b border-border px-2 pb-1 [scrollbar-width:none]" role="tablist">
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
      <div className="grid h-72 grid-cols-9 content-start gap-0.5 overflow-y-auto p-2">
        {customShown.map((c) => (
          <button key={c.id} type="button" title={`:${c.name}:`} aria-label={c.name} onClick={() => onPick(`<:${c.name}:${c.id}>`, c)}
            className="grid size-9 place-items-center rounded-xs transition-transform hover:scale-110 hover:bg-surface-hover"><img src={c.url} alt={c.name} className="size-7 object-contain" /></button>
        ))}
        {(group !== 'server' || q) && shown.map(([e, kw]) => (
          <button key={e} type="button" title={kw.replace(/ [؀-ۿ].*$/, '')} aria-label={kw || e} onClick={() => { remember(e); onPick(e); }}
            className="grid size-9 place-items-center rounded-xs text-2xl transition-transform hover:scale-110 hover:bg-surface-hover">{e}</button>
        ))}
      </div>
    </div>
  );
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '🙏'];
