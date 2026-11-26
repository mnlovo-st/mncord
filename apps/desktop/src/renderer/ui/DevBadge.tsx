// The "DEV" badge: mncord's developer only (user flag bit 1). Purple, a soft glow and a slow shine.
import { USER_FLAG_DEV, USER_FLAG_DEV_GREEN } from '@mncord/shared';
import { Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

export const isDev = (flags?: number | null) => !!flags && (flags & (USER_FLAG_DEV | USER_FLAG_DEV_GREEN)) !== 0;
const isGreen = (flags?: number | null) => !!flags && (flags & USER_FLAG_DEV) === 0 && (flags & USER_FLAG_DEV_GREEN) !== 0;

export function DevBadge({ flags, size = 'sm', className }: { flags?: number | null; size?: 'sm' | 'md'; className?: string }) {
  const { t } = useTranslation();
  if (!isDev(flags)) return null;
  return (
    <Tooltip content={t('badges.dev')} side="top">
      <span
        aria-label={t('badges.dev')}
        className={cn(
          isGreen(flags) && 'dev-badge-green',
          'dev-badge relative inline-flex shrink-0 select-none items-center gap-[3px] overflow-hidden rounded-[5px] font-display font-extrabold uppercase leading-none tracking-[0.08em] text-white',
          size === 'md' ? 'h-[22px] px-2 text-[11px]' : 'h-[17px] px-[5px] text-[9.5px]',
          className,
        )}
      >
        <Code2 aria-hidden className={size === 'md' ? 'size-3.5' : 'size-[11px]'} strokeWidth={2.75} />
        Dev
      </span>
    </Tooltip>
  );
}
