import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'link';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'sheen bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface-raised text-text hover:bg-surface-selected border border-border',
  ghost: 'bg-transparent text-muted hover:bg-surface-hover hover:text-text',
  danger: 'bg-danger-solid text-on-danger hover:brightness-110',
  success: 'bg-success-solid text-on-success hover:brightness-110',
  link: 'bg-transparent text-link hover:underline !px-0 !h-auto',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-[38px] px-4 text-sm',
  lg: 'h-11 px-6 text-base',
  icon: 'h-8 w-8 p-0 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center gap-2 rounded-sm font-semibold whitespace-nowrap',
        'transition-[background-color,color,filter,transform] duration-(--motion-fast) ease-out',
        'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
