import { cn } from '@/lib/cn';

export type CavityState = 'empty' | 'filled';

export type TrayRowProps = {
  /** Total cavities (tray capacity for the day) */
  total: number;
  /** How many are taken */
  filled: number;
  /** Indexes of newly filled cavities get the spring animation; omit to animate all filled */
  newlyFilledFrom?: number;
  /** Label shown to the left, e.g. "Sat 18" */
  label: string;
  /** Small secondary label, e.g. "10 trays" */
  sublabel?: string;
  /** Optional segment fills: a filled cavity can be split across two orders */
  segments?: (string | null)[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: 14,
  md: 20,
  lg: 26,
} as const;

/**
 * A day's capacity drawn as an actual tray of round cavities.
 * Cavities fill with a spring animation, tinted per order.
 * Always paired with the number ("5/8 trays") so color is never the only signal.
 */
export function TrayRow({
  total,
  filled,
  newlyFilledFrom = 0,
  label,
  sublabel,
  segments,
  size = 'md',
  className,
}: TrayRowProps) {
  const d = sizeMap[size];
  const gap = Math.round(d * 0.28);
  const cavities = Array.from({ length: total }, (_, i) => i);
  const full = filled >= total;

  return (
    <div
      className={cn('flex items-center gap-3 min-w-0', className)}
      role="img"
      aria-label={`${label}: ${filled} of ${total} trays taken${full ? ', full' : ''}`}
    >
      <div className="w-20 shrink-0 text-right">
        <div className="font-slip text-sm font-medium leading-tight">{label}</div>
        {sublabel && (
          <div className="font-slip text-[10px] opacity-60 leading-tight">{sublabel}</div>
        )}
      </div>
      <div
        className={cn(
          'flex items-center rounded-lg px-2.5 py-2 shrink-0',
          full ? 'bg-[color:var(--tomato)]/10' : 'bg-[color:var(--flour)]'
        )}
        style={{ gap }}
      >
        {cavities.map((i) => {
          const isFilled = i < filled;
          const isNew = isFilled && i >= newlyFilledFrom;
          const tint = segments?.[i] ?? 'var(--crust)';
          return (
            <span
              key={i}
              className={cn(
                'block rounded-full border',
                isNew && 'anim-cavity'
              )}
              style={{
                width: d,
                height: d,
                background: isFilled ? tint : 'transparent',
                borderColor: isFilled ? 'transparent' : 'color-mix(in srgb, var(--ink) 30%, transparent)',
                borderStyle: isFilled ? 'solid' : 'dashed',
                borderWidth: 1.5,
              }}
            />
          );
        })}
      </div>
      <div
        className={cn(
          'font-slip text-xs shrink-0',
          full ? 'text-[color:var(--tomato)] font-semibold' : 'text-[color:var(--teal)] font-medium'
        )}
      >
        {filled}/{total}
      </div>
    </div>
  );
}
