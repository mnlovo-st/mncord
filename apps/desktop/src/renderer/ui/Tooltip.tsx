import * as RT from '@radix-ui/react-tooltip';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RT.Provider delayDuration={300} skipDelayDuration={150} disableHoverableContent>{children}</RT.Provider>
);

/**
 * Hover label. Radix opens tooltips on focus too, and Electron re-focuses the last clicked button whenever
 * the window regains focus or a modal closes, which left labels stuck on screen. So a tooltip only opens
 * while the pointer is really over its button (or keyboard focus is visible), and it closes as soon as that
 * stops being true: pointer gone, window blurred, a click, a scroll, or the button covered by a panel.
 */
export function Tooltip({ content, side = 'top', children }: {
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const wanted = () => {
    const el = ref.current;
    return !!el && el.isConnected && (el.matches(':hover') || el.matches(':focus-visible'));
  };

  useEffect(() => {
    if (!open) return;
    const check = () => {
      if (!wanted()) setOpen(false);
    };
    const close = () => setOpen(false);
    const id = setInterval(check, 200); // covers "a panel opened on top and the mouse never moved"
    addEventListener('pointermove', check, { passive: true });
    addEventListener('pointerdown', close, true);
    addEventListener('wheel', close, { passive: true });
    addEventListener('blur', close);
    addEventListener('keydown', close, true);
    return () => {
      clearInterval(id);
      removeEventListener('pointermove', check);
      removeEventListener('pointerdown', close, true);
      removeEventListener('wheel', close);
      removeEventListener('blur', close);
      removeEventListener('keydown', close, true);
    };
  }, [open]);

  return (
    <RT.Root open={open} onOpenChange={(o) => setOpen(o && wanted())}>
      <RT.Trigger asChild ref={ref as never}>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="anim-pop pointer-events-none z-50 max-w-64 select-none rounded-sm bg-popover px-3 py-2 text-sm font-semibold text-text shadow-pop"
        >
          {content}
          <RT.Arrow className="fill-popover" width={10} height={5} />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
