import { useEffect } from 'react';
import { CakeDesigner } from '@/components/CakeDesigner';

export function Studio() {
  useEffect(() => {
    document.title = 'Cake Studio — Batchwise';
    return () => {
      document.title = 'Batchwise — never promise more than the oven can bake';
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16">
      <section className="py-8">
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-[2.75rem]">
          Design a cake that can actually be built.
        </h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed opacity-80">
          Build it tier by tier, place the decorations, and see servings, price and the work it
          takes.
        </p>
      </section>

      <CakeDesigner />

      <p className="mt-8 font-slip text-xs opacity-60">
        Demo data for the fictional Odile's Kitchen. No orders are taken.
      </p>
    </main>
  );
}
