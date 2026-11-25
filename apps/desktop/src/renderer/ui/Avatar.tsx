import { cn } from './cn';
import { Decoration } from './Cosmetics';

export type Status = 'online' | 'idle' | 'dnd' | 'offline' | 'streaming';

const statusColor: Record<Status, string> = {
  online: 'bg-online',
  idle: 'bg-idle',
  dnd: 'bg-dnd',
  offline: 'bg-offline',
  streaming: 'bg-streaming',
};

/** Stable hue from a name, for initials avatars until the user uploads one. */
function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ name, src, size = 40, status, speaking, self, statusLabel, cutout = 'border-surface', decoration }: {
  name: string;
  src?: string;
  size?: number;
  status?: Status;
  speaking?: boolean;
  /** your own avatar: speaking ring is gold instead of green */
  self?: boolean;
  statusLabel?: string;
  /** border colour class matching the background behind the avatar */
  cutout?: string;
  /** free avatar decoration id (ring) */
  decoration?: string | null;
}) {
  const dot = Math.max(10, Math.round(size * 0.32));
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span
        className={cn(
          'grid size-full place-items-center overflow-hidden rounded-full font-semibold text-white transition-shadow duration-(--motion-fast)',
          speaking && 'ring-2 ring-offset-2 ring-offset-bg',
          speaking && (self ? 'ring-accent' : 'ring-online'),
        )}
        style={!src ? { background: `hsl(${hue(name)} 42% 40%)`, fontSize: Math.round(size * 0.42) } : undefined}
      >
        {src ? (
          <img src={src} alt={name} className="size-full object-cover" draggable={false} />
        ) : (
          <>
            <span aria-hidden>{[...name][0]?.toUpperCase()}</span>
            <span className="sr-only">{name}</span>
          </>
        )}
      </span>
      <Decoration id={decoration} size={size} />
      {status && (
        <span
          role="img"
          aria-label={statusLabel ?? status}
          className={cn('absolute -bottom-0.5 -end-0.5 overflow-hidden rounded-full border-[3px]', cutout, statusColor[status])}
          style={{ width: dot + 6, height: dot + 6 }}
        >
          {status === 'idle' && <span className="absolute -start-[2px] -top-[2px] size-[62%] rounded-full bg-surface" />}
          {status === 'dnd' && <span className="absolute inset-x-[20%] top-1/2 h-[26%] -translate-y-1/2 rounded-full bg-surface" />}
          {status === 'offline' && <span className="absolute inset-[24%] rounded-full bg-surface" />}
        </span>
      )}
    </span>
  );
}
