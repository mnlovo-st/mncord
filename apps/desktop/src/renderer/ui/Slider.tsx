import * as RSl from '@radix-ui/react-slider';
import { cn } from './cn';

/** Slider. `level` (0–100) draws a live meter behind the track, used for mic sensitivity. */
export function Slider({ label, value, onValueChange, min = 0, max = 100, step = 1, format = String, level, className }: {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  level?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</span>
        <span className="text-xs font-semibold text-text tabular-nums">{format(value)}</span>
      </div>
      <RSl.Root
        value={[value]}
        onValueChange={(v) => onValueChange(v[0] ?? value)}
        min={min}
        max={max}
        step={step}
        className="relative flex h-5 touch-none select-none items-center"
      >
        <RSl.Track className="relative h-2 grow overflow-hidden rounded-full bg-surface-selected">
          {level !== undefined && (
            <div
              aria-hidden
              className="absolute inset-y-0 start-0 bg-online transition-[width] duration-75"
              style={{ width: `${Math.min(100, Math.max(0, level))}%`, opacity: 0.55 }}
            />
          )}
          <RSl.Range className={cn('absolute h-full bg-accent', level !== undefined && 'opacity-40')} />
        </RSl.Track>
        <RSl.Thumb
          aria-label={label}
          aria-valuetext={format(value)}
          className="block h-5 w-2.5 rounded-xs bg-chrome shadow-card transition-transform duration-(--motion-fast) hover:scale-110"
        />
      </RSl.Root>
    </div>
  );
}
