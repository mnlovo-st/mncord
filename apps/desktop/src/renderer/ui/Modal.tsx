import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Modal({ open, onOpenChange, title, description, children, footer, size = 'sm', closeLabel = 'Close' }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeLabel?: string;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-40 bg-black/70" />
        <RD.Content
          className={cn(
            'anim-pop fixed start-1/2 top-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2',
            'overflow-hidden rounded-lg bg-bg text-text shadow-modal',
            size === 'sm' ? 'max-w-[440px]' : size === 'md' ? 'max-w-[560px]' : 'max-w-[980px]',
          )}
        >
          <div className="relative px-4 pb-3 pt-5">
            <RD.Title className="font-display text-lg font-semibold">{title}</RD.Title>
            {description && <RD.Description className="mt-2 text-sm text-muted">{description}</RD.Description>}
            <RD.Close aria-label={closeLabel} className="absolute end-3 top-3 grid size-8 place-items-center rounded-sm text-muted hover:bg-surface-hover hover:text-text">
              <X className="size-5" />
            </RD.Close>
          </div>
          {children && <div className="px-4 pb-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 bg-surface px-4 py-4">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
