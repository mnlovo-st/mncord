// Chat markdown → React nodes. Never produces raw HTML (no dangerouslySetInnerHTML anywhere), so message
// text can't inject markup or scripts. Supports: ```code```, `inline`, **bold**, *italic* / _italic_,
// __underline__, ~~strike~~, ||spoiler||, > quote, # headings, - lists, links (auto + [text](url)), @mentions.
import { Fragment, useState, type ReactNode } from 'react';
import { cn } from './cn';

export interface MdContext {
  isMention: (username: string) => 'me' | 'other' | null;
  onMentionClick?: (username: string, e: React.MouseEvent) => void;
  onLink?: (url: string) => void;
  emojiUrl?: (id: string) => string | undefined;
}

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(true)}
      className={cn('rounded-xs px-0.5 transition-colors', open ? 'bg-surface-selected' : 'cursor-pointer bg-text text-transparent [&_*]:invisible')}
    >
      {children}
    </span>
  );
}

// ── inline
type Rule = { re: RegExp; render: (m: RegExpExecArray, ctx: MdContext, key: string) => ReactNode };
const inlineRules: Rule[] = [
  {
    re: /<a?:([A-Za-z0-9_]{2,32}):([0-9a-f-]{36})>/y,
    render: (m, c, k) => {
      const url = c.emojiUrl?.(m[2]!);
      return url ? <img key={k} src={url} alt={`:${m[1]}:`} title={`:${m[1]}:`} className="inline-block size-[1.375em] object-contain align-bottom" draggable={false} /> : `:${m[1]}:`;
    },
  },
  { re: /`([^`\n]+)`/y, render: (m, _c, k) => <code key={k} className="rounded-xs bg-surface-input px-1 py-0.5 font-mono text-[0.85em]" dir="ltr">{m[1]}</code> },
  { re: /\|\|([\s\S]+?)\|\|/y, render: (m, c, k) => <Spoiler key={k}>{inline(m[1]!, c, k)}</Spoiler> },
  { re: /\*\*([\s\S]+?)\*\*/y, render: (m, c, k) => <strong key={k} className="font-bold">{inline(m[1]!, c, k)}</strong> },
  { re: /__([\s\S]+?)__/y, render: (m, c, k) => <u key={k}>{inline(m[1]!, c, k)}</u> },
  { re: /~~([\s\S]+?)~~/y, render: (m, c, k) => <s key={k}>{inline(m[1]!, c, k)}</s> },
  { re: /\*([^*\n]+?)\*/y, render: (m, c, k) => <em key={k}>{inline(m[1]!, c, k)}</em> },
  { re: /_([^_\n]+?)_(?![\w])/y, render: (m, c, k) => <em key={k}>{inline(m[1]!, c, k)}</em> },
  {
    re: /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/y,
    render: (m, c, k) => <Link key={k} url={m[2]!} ctx={c}>{inline(m[1]!, c, k)}</Link>,
  },
  { re: /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/y, render: (m, c, k) => <Link key={k} url={m[0]} ctx={c}>{m[0]}</Link> },
  {
    re: /@([a-zA-Z0-9_.]{2,32})/y,
    render: (m, c, k) => {
      const who = c.isMention(m[1]!.toLowerCase());
      if (!who) return m[0];
      return (
        <button
          key={k}
          type="button"
          onClick={(e) => c.onMentionClick?.(m[1]!, e)}
          className={cn('rounded-xs px-0.5 font-medium', who === 'me' ? 'bg-accent/30 text-accent-text' : 'bg-link/15 text-link hover:bg-link/30')}
        >
          @{m[1]}
        </button>
      );
    },
  },
];

function Link({ url, ctx, children }: { url: string; ctx: MdContext; children: ReactNode }) {
  if (!SAFE_URL.test(url)) return <>{children}</>;
  return (
    <a
      href={url}
      onClick={(e) => {
        e.preventDefault();
        ctx.onLink?.(url);
      }}
      className="text-link hover:underline"
      rel="noreferrer noopener"
      dir="ltr"
    >
      {children}
    </a>
  );
}

function inline(text: string, ctx: MdContext, keyBase = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  let n = 0;
  outer: while (i < text.length) {
    // escapes: \* etc
    if (text[i] === '\\' && i + 1 < text.length && /[*_`~|\\[\]@]/.test(text[i + 1]!)) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    for (const rule of inlineRules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(text);
      if (m) {
        if (buf) out.push(buf), (buf = '');
        out.push(rule.render(m, ctx, `${keyBase}.${n++}`));
        i += m[0].length;
        continue outer;
      }
    }
    buf += text[i];
    i++;
  }
  if (buf) out.push(buf);
  return out;
}

// ── blocks
export function Markdown({ text, ctx }: { text: string; ctx: MdContext }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = /^```(\w{0,20})\s*$/.exec(line) ?? /^```(\w{0,20})(.+)$/.exec(line);
    if (fence) {
      const body: string[] = [];
      // single-line ```code```
      if (fence[2] && fence[2].endsWith('```')) {
        body.push(fence[2].slice(0, -3));
        i++;
      } else {
        if (fence[2]) body.push(fence[2]);
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i]!)) body.push(lines[i++]!);
        i++; // closing fence
      }
      blocks.push(
        <pre key={k++} dir="ltr" className="my-1 max-w-full overflow-x-auto rounded-md border border-border bg-surface-input p-3 font-mono text-[0.85em] leading-5 text-text">
          {fence[1] && <span className="mb-1 block text-2xs uppercase text-faint">{fence[1]}</span>}
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) q.push(lines[i++]!.replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={k++} className="my-0.5 border-s-4 border-border-input ps-3">
          {q.map((l, j) => <Fragment key={j}>{inline(l, ctx, `q${k}.${j}`)}{j < q.length - 1 && <br />}</Fragment>)}
        </blockquote>,
      );
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const size = h[1]!.length === 1 ? 'text-xl' : h[1]!.length === 2 ? 'text-lg' : 'text-base';
      blocks.push(<div key={k++} role="heading" aria-level={h[1]!.length} className={cn('mt-1 font-display font-bold', size)}>{inline(h[2]!, ctx, `h${k}`)}</div>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ''));
      blocks.push(<ul key={k++} className="my-0.5 list-disc ps-6">{items.map((it, j) => <li key={j}>{inline(it, ctx, `l${k}.${j}`)}</li>)}</ul>);
      continue;
    }
    // plain paragraph line(s)
    const para: string[] = [];
    while (i < lines.length && !/^(```|>\s?|#{1,3}\s|\s*[-*]\s+)/.test(lines[i]!)) para.push(lines[i++]!);
    if (para.length) {
      blocks.push(<Fragment key={k++}>{para.map((l, j) => <Fragment key={j}>{inline(l, ctx, `p${k}.${j}`)}{j < para.length - 1 && <br />}</Fragment>)}</Fragment>);
    } else i++;
  }
  return <>{blocks}</>;
}

/** Emoji-only messages (1–27 emoji, nothing else) render jumbo. */
export const isJumbo = (text: string) => {
  const t = text.trim();
  if (!t || t.length > 120) return false;
  const stripped = t.replace(/\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Regional_Indicator}|‍|️|\s/gu, '');
  return stripped.length === 0 && [...t.matchAll(/\p{Extended_Pictographic}/gu)].length <= 27;
};
