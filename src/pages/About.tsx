import { Link } from 'react-router-dom';

export function About() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16">
      <section className="py-8">
        <h1 className="font-display text-4xl tracking-tight sm:text-[2.75rem]">About Batchwise</h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed opacity-80">
          A cake studio that checks a design can be built, and estimates the work.
        </p>
      </section>

      <section className="space-y-8 text-base leading-relaxed">
        <div>
          <h2 className="font-display text-2xl tracking-tight">Who it is for</h2>
          <p className="mt-2 opacity-80">
            Decorators and home bakers who quote custom cakes, and who want to know what a design
            takes before they name a price.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight">The problem</h2>
          <p className="mt-2 opacity-80">
            Inspiration pictures often show cakes that cannot be built. Quotes are made by
            guesswork, and the guess is usually optimistic.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight">How the estimate is calculated</h2>
          <p className="mt-2 opacity-80">
            Servings come from each tier's footprint area divided by the portion area. Price comes
            from the finish, the frosting-style surcharge and the decoration prices. Oven trays come
            from the total baked footprint divided by the tray area, rounded up. Prep minutes come
            from a base plus per tier, per layer and per decoration. See the full breakdown on the
            How page.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight">Honest limits</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 opacity-80">
            <li>All data on this site is fictional demo data.</li>
            <li>Estimates come from default baker settings, not your kitchen.</li>
            <li>Build rules are simple guidelines, not structural engineering.</li>
            <li>Not built yet: accounts, saved designs, share links, AI assistant.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight">Tools used</h2>
          <p className="mt-2 opacity-80">
            Bolt, Supabase, React, react-router, three.js with react-three-fiber, and Google Fonts.
          </p>
        </div>

        <div className="flex flex-wrap gap-6 pb-4">
          <Link
            to="/"
            className="min-h-[48px] rounded-lg px-1 font-slip text-sm font-medium text-[color:var(--teal)] underline underline-offset-4 hover:opacity-80"
          >
            Design a cake
          </Link>
          <Link
            to="/how"
            className="min-h-[48px] rounded-lg px-1 font-slip text-sm font-medium text-[color:var(--teal)] underline underline-offset-4 hover:opacity-80"
          >
            How the estimate works
          </Link>
        </div>
      </section>
    </main>
  );
}
