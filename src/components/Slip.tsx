import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SlipProps = {
  children: ReactNode;
  /** Stamp text, e.g. CONFIRMED, PAID (mock) */
  stamp?: string;
  stampTone?: 'teal' | 'tomato' | 'crust';
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
};

const stampToneMap = {
  teal: 'text-[color:var(--teal)] border-[color:var(--teal)]',
  tomato: 'text-[color:var(--tomato)] border-[color:var(--tomato)]',
  crust: 'text-[color:var(--crust)] border-[color:var(--crust)]',
} as const;

/**
 * An order as a thermal paper slip: perforated top and bottom edges,
 * mono type, a dashed rule, and a rotated stamp.
 */
export function Slip({
  children,
  stamp,
  stampTone = 'teal',
  animate = false,
  className,
  ariaLabel,
}: SlipProps) {
  return (
    <div
      className={cn('relative', animate && 'anim-slip', className)}
      aria-label={ariaLabel}
    >
      {/* perforation top */}
      <Perforation position="top" />
      <div
        className="bg-[color:var(--slip)] border-x border-b-0 border-t-0 border-[color:var(--ink)]/15 px-4 py-3"
        style={{ boxShadow: '0 1px 0 rgba(58,34,23,0.08), 0 6px 14px -8px rgba(58,34,23,0.25)' }}
      >
        {children}
        {stamp && (
          <div className="mt-2 flex justify-end">
            <span
              className={cn(
                'anim-stamp inline-block border-2 rounded px-2 py-0.5 font-slip text-xs font-semibold tracking-widest uppercase -rotate-3 select-none',
                stampToneMap[stampTone]
              )}
              style={{ borderStyle: 'double', borderWidth: 4 }}
            >
              {stamp}
            </span>
          </div>
        )}
      </div>
      {/* perforation bottom */}
      <Perforation position="bottom" />
    </div>
  );
}

function Perforation({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden="true"
      className="h-2.5 bg-[color:var(--slip)] border-x border-[color:var(--ink)]/15 overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(circle at 4px 4px, transparent 3.5px, var(--slip) 4px)',
        backgroundSize: '12px 12px',
        backgroundPosition: position === 'top' ? '-2px -6px' : '-2px -2px',
        transform: position === 'top' ? 'scaleY(-1)' : undefined,
      }}
    />
  );
}

/** The dashed rule used between sections of a slip */
export function SlipRule() {
  return <hr aria-hidden="true" className="my-2 border-0 border-t border-dashed border-[color:var(--ink)]/35" />;
}
