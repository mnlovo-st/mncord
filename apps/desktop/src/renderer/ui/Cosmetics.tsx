// Free profile cosmetics (everyone gets them): avatar decorations, profile effects, name styles and
// nameplates. All drawn with CSS (app.css → .deco-*, .fx-*, .name-*, .plate-*), no images to download.
import type { ProfileStyle } from '@mncord/shared';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn';

export const DECORATIONS = ['glow', 'rainbow', 'gold', 'neon', 'fire', 'frost', 'galaxy'] as const;
export const EFFECTS = ['sparkles', 'snow', 'hearts', 'embers', 'aurora', 'stars'] as const;
export const NAME_STYLES = ['aurora', 'sunset', 'gold', 'neon', 'ocean', 'candy', 'chrome'] as const;
export const NAMEPLATES = ['aurora', 'sunset', 'ocean', 'ember', 'galaxy', 'forest'] as const;

const known = (list: readonly string[], v?: string | null) => (v && list.includes(v) ? v : null);

/** Ring drawn around an avatar. Put it inside a relatively positioned box the size of the avatar. */
export function Decoration({ id, size }: { id?: string | null; size: number }) {
  const d = known(DECORATIONS, id);
  if (!d) return null;
  const pad = Math.max(3, Math.round(size * 0.1));
  return <span aria-hidden className={cn('deco pointer-events-none absolute rounded-full', `deco-${d}`)} style={{ inset: -pad, '--deco-w': `${Math.max(2, Math.round(size * 0.06))}px` } as CSSProperties} />;
}

/** Animated layer over a profile card. */
export function ProfileEffect({ id }: { id?: string | null }) {
  const e = known(EFFECTS, id);
  if (!e) return null;
  return (
    <span aria-hidden className={cn('fx pointer-events-none absolute inset-0 z-10 overflow-hidden', `fx-${e}`)}>
      {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
    </span>
  );
}

/** A display name in the person's chosen style. */
export function StyledName({ style, children, className }: { style?: ProfileStyle | null; children: ReactNode; className?: string }) {
  const n = known(NAME_STYLES, style?.nameStyle);
  return <span className={cn(n && `name-styled name-${n}`, className)}>{children}</span>;
}

export const nameplateClass = (style?: ProfileStyle | null) => {
  const p = known(NAMEPLATES, style?.nameplate);
  return p ? `plate plate-${p}` : '';
};
