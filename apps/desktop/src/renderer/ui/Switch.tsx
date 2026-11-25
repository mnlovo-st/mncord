import * as RS from '@radix-ui/react-switch';
import { Check, X } from 'lucide-react';
import { useId } from 'react';
import { cn } from './cn';

export function Switch({ label, description, checked, onCheckedChange, disabled }: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <label htmlFor={id} className="block text-base font-medium text-text">{label}</label>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <RS.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-6 w-10 shrink-0 rounded-full bg-border-input transition-colors duration-(--motion-base) data-[state=checked]:bg-accent disabled:cursor-not-allowed"
      >
        <RS.Thumb
          className={cn(
            'grid size-[18px] place-items-center rounded-full bg-chrome text-on-chrome shadow-low',
            'transition-transform duration-(--motion-base) ease-spring',
            'translate-x-[3px] data-[state=checked]:translate-x-[19px]',
            'rtl:-translate-x-[3px] rtl:data-[state=checked]:-translate-x-[19px]',
          )}
        >
          {checked ? <Check aria-hidden className="size-3" strokeWidth={3} /> : <X aria-hidden className="size-3" strokeWidth={3} />}
        </RS.Thumb>
      </RS.Root>
    </div>
  );
}
