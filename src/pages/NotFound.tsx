import { Link } from 'react-router-dom';
import { TallyMarks } from '@/components/TallyMarks';

export function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-20 text-center">
      <div className="flex justify-center" aria-hidden="true">
        <TallyMarks />
      </div>
      <h1 className="mt-6 font-display text-4xl tracking-tight">Nothing on this tray</h1>
      <p className="mt-3 font-slip text-sm opacity-70">
        The page you asked for is not on the menu. Try the cake studio instead.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-[48px] items-center rounded-lg bg-[color:var(--ink)] px-5 font-slip text-sm font-medium text-[color:var(--parchment)]"
      >
        Back to the studio
      </Link>
    </main>
  );
}
