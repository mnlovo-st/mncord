// "Playing X · 12m" text for profiles and member lists.
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';

/** "Playing Valorant · 12m" (minutes tick while you look) */
export function useActivityText(userId: string) {
  const { t } = useTranslation();
  const a = useStore((s) => s.activities[userId]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!a) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [a]);
  if (!a) return null;
  return { name: a.name, line: t('activity.playing', { name: a.name }), since: formatElapsed(Date.now() - a.startedAt, t) };
}
export function formatElapsed(ms: number, t: TFunction) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return t('activity.justNow');
  if (m < 60) return t('activity.minutes', { count: m });
  const h = Math.floor(m / 60);
  return t('activity.hours', { h, m: m % 60 });
}
