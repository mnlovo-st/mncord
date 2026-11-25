import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  variant?: 'text' | 'password' | 'search';
  onClear?: () => void;
  /** i18n labels for the icon buttons */
  showLabel?: string;
  hideLabel?: string;
  clearLabel?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, variant = 'text', onClear, className, id, type, showLabel = 'Show password', hideLabel = 'Hide password', clearLabel = 'Clear', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  const [show, setShow] = useState(false);
  const realType = variant === 'password' ? (show ? 'text' : 'password') : variant === 'search' ? 'search' : type;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <label htmlFor={inputId} className={cn('text-2xs font-bold uppercase tracking-wide', error ? 'text-danger-text' : 'text-muted')}>
          {label}
          {error && <span className="font-medium normal-case tracking-normal"> · {error}</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {variant === 'search' && <Search aria-hidden className="pointer-events-none absolute start-2.5 size-4 text-faint" />}
        <input
          ref={ref}
          id={inputId}
          type={realType}
          aria-invalid={!!error || undefined}
          aria-describedby={hint || error ? msgId : undefined}
          className={cn(
            'h-10 w-full rounded-sm border bg-surface-input px-3 text-base text-text placeholder:text-faint',
            'transition-colors duration-(--motion-fast) outline-none',
            'focus-visible:border-focus focus-visible:outline-none',
            error ? 'border-danger' : 'border-border-input hover:border-muted',
            variant === 'search' && 'ps-8',
            (variant === 'password' || (variant === 'search' && onClear)) && 'pe-9',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          {...rest}
        />
        {variant === 'password' && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? hideLabel : showLabel}
            className="absolute end-1.5 grid size-7 place-items-center rounded-xs text-muted hover:text-text"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
        {variant === 'search' && onClear && rest.value ? (
          <button type="button" onClick={onClear} aria-label={clearLabel} className="absolute end-1.5 grid size-7 place-items-center text-muted hover:text-text">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {hint && !error && <p id={msgId} className="text-xs text-faint">{hint}</p>}
      {error && <p id={msgId} role="alert" className={cn('text-xs text-danger-text', label && 'sr-only')}>{error}</p>}
    </div>
  );
});
