import * as RC from '@radix-ui/react-context-menu';
import { Check, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

const panel = 'anim-pop z-50 min-w-[188px] rounded-md bg-popover p-1.5 text-sm text-muted shadow-pop';
const itemBase =
  'flex h-8 cursor-default select-none items-center justify-between gap-3 rounded-xs px-2 outline-none data-[highlighted]:bg-surface-selected data-[highlighted]:text-text data-[disabled]:opacity-50';

export const ContextMenu = RC.Root;
export const ContextMenuTrigger = RC.Trigger;

export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <RC.Portal>
      <RC.Content className={panel} collisionPadding={8}>{children}</RC.Content>
    </RC.Portal>
  );
}

export function MenuItem({ children, icon, danger, onSelect, shortcut }: {
  children: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  onSelect?: () => void;
  shortcut?: string;
}) {
  return (
    <RC.Item
      onSelect={onSelect}
      className={cn(itemBase, danger && 'text-danger-text data-[highlighted]:bg-danger-solid data-[highlighted]:text-on-danger')}
    >
      <span>{children}</span>
      {shortcut ? <kbd className="font-sans text-xs text-faint">{shortcut}</kbd> : icon}
    </RC.Item>
  );
}

export function MenuCheckbox({ children, checked, onCheckedChange }: { children: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <RC.CheckboxItem checked={checked} onCheckedChange={onCheckedChange} className={itemBase} onSelect={(e) => e.preventDefault()}>
      <span>{children}</span>
      <span className={cn('grid size-[18px] place-items-center rounded-xs border', checked ? 'border-accent bg-accent text-on-accent' : 'border-border-input')}>
        <RC.ItemIndicator><Check className="size-3" strokeWidth={3} /></RC.ItemIndicator>
      </span>
    </RC.CheckboxItem>
  );
}

export function MenuSub({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <RC.Sub>
      <RC.SubTrigger className={itemBase}>
        <span>{label}</span>
        <ChevronRight aria-hidden className="size-4 rtl:-scale-x-100" />
      </RC.SubTrigger>
      <RC.Portal>
        <RC.SubContent className={panel} sideOffset={6}>{children}</RC.SubContent>
      </RC.Portal>
    </RC.Sub>
  );
}

/** Free-form row inside a menu (e.g. the per-user volume slider). */
export function MenuSlot({ children }: { children: ReactNode }) {
  return <div className="px-2 py-1.5" onKeyDown={(e) => e.stopPropagation()}>{children}</div>;
}

export const MenuSeparator = () => <RC.Separator className="mx-1 my-1 h-px bg-border" />;
