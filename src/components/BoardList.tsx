import { useId } from 'react';
import { cn } from '@/lib/cn';
import { TrayRow } from '@/components/TrayRow';
import { TallyMarks } from '@/components/TallyMarks';
import { labelForDate, isWeekendDate, type DayLoad } from '@/lib/api';

type BoardListProps = {
  week: DayLoad[] | null;
  error?: string | null;
  onRetry?: () => void;
  size?: 'sm' | 'md' | 'lg';
  newlyFilledIndex?: number;
  className?: string;
};

/** The shared tray board: loading, empty, error and live states in one place. */
export function BoardList({ week, error, onRetry, size = 'md', newlyFilledIndex, className }: BoardListProps) {
  const headingId = useId();

  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          'rounded-lg border border-[color:var(--tomato)]/40 bg-[color:var(--tomato)]/10 px-4 py-3 font-slip text-sm text-[color:var(--tomato)]',
          className
        )}
      >
        {error}{' '}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 min-h-[44px] rounded px-2 underline underline-offset-2 hover:opacity-80"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!week) {
    return (
      <div className={cn('flex min-h-[240px] items-center justify-center', className)} aria-hidden="true">
        <TallyMarks />
      </div>
    );
  }

  if (week.length === 0) {
    return (
      <p className={cn('py-8 text-center font-slip text-sm opacity-60', className)}>
        No capacity has been set up for this week yet.
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', className)} aria-labelledby={headingId} role="list">
      <h3 id={headingId} className="sr-only">Days and how full their trays are</h3>
      {week.map((day, idx) => (
        <TrayRow
          key={day.date}
          label={labelForDate(day.date)}
          sublabel={isWeekendDate(day.date) ? 'weekend' : undefined}
          total={day.trays}
          filled={day.trays_used}
          newlyFilledFrom={idx === newlyFilledIndex ? 0 : undefined}
          size={size}
        />
      ))}
    </div>
  );
}
