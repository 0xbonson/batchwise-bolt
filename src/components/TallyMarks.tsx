import { cn } from '@/lib/cn';

/**
 * Pencil tally marks as the loading indicator.
 * Strokes draw themselves in, like tallying on paper.
 */
export function TallyMarks({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-flex items-end gap-1.5', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <svg
          key={i}
          width="4"
          height="18"
          viewBox="0 0 4 18"
          aria-hidden="true"
          className={i === count - 1 ? 'opacity-0' : undefined}
        >
          <line
            x1="2"
            y1="1"
            x2="2"
            y2="17"
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="24"
            style={{
              animation: 'tally-stroke 420ms ease-out both',
              animationDelay: `${i * 130}ms`,
            }}
          />
        </svg>
      ))}
      {/* the crossing diagonal of a bundle of five */}
      <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
        <line
          x1="1"
          y1="15"
          x2="15"
          y2="3"
          stroke="var(--ink)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="24"
          style={{
            animation: 'tally-stroke 420ms ease-out both',
            animationDelay: `${(count - 1) * 130 + 100}ms`,
          }}
        />
      </svg>
    </span>
  );
}

/** Small inline loading dots that breathe */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="anim-breathe block h-1.5 w-1.5 rounded-full bg-[color:var(--ink)]"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  );
}
