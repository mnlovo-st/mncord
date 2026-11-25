import * as RT from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RT.Provider delayDuration={300} skipDelayDuration={0}>{children}</RT.Provider>
);

export function Tooltip({ content, side = 'top', children }: {
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="anim-pop z-50 max-w-64 rounded-sm bg-popover px-3 py-2 text-sm font-semibold text-text shadow-pop"
        >
          {content}
          <RT.Arrow className="fill-popover" width={10} height={5} />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
