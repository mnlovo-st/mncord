import { AlertTriangle, CheckCircle2, Info, WifiOff, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'info' | 'success' | 'warning' | 'error';
const icons: Record<Tone, ReactNode> = {
  info: <Info className="size-5 text-link" />,
  success: <CheckCircle2 className="size-5 text-success" />,
  warning: <AlertTriangle className="size-5 text-warning" />,
  error: <WifiOff className="size-5 text-danger-text" />,
};

export function Toast({ tone = 'info', title, body, action, onClose, closeLabel = 'Dismiss' }: {
  tone?: Tone;
  title: string;
  body?: string;
  action?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="anim-slide-up flex w-[360px] max-w-full items-start gap-3 rounded-md border border-border bg-popover p-3 shadow-pop"
    >
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        {body && <p className="mt-0.5 text-sm text-muted">{body}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={closeLabel} className="grid size-6 place-items-center rounded-xs text-faint hover:text-text">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function NoticeBar({ tone = 'info', children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex h-9 items-center justify-center gap-3 px-4 text-sm font-medium',
        tone === 'info' && 'bg-surface-selected text-text',
        tone === 'success' && 'bg-success-solid text-on-success',
        tone === 'warning' && 'bg-accent text-on-accent',
        tone === 'error' && 'bg-danger-solid text-on-danger',
      )}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}
