import { Link } from 'react-router-dom';
import { defaultDesign } from '@/lib/cakeModel';
import { DEFAULT_SETTINGS, estimate, fmtMoney } from '@/lib/estimate';

const EXAMPLE_DESIGN = defaultDesign();
const EXAMPLE = estimate(EXAMPLE_DESIGN, DEFAULT_SETTINGS);

export function How() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16">
      <section className="py-8">
        <h1 className="font-display text-4xl tracking-tight sm:text-[2.75rem]">
          How the estimate works
        </h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed opacity-80">
          Every cake design is turned into four numbers as you build: servings, price, oven trays
          and prep minutes. Here is exactly how each one is calculated.
        </p>
      </section>

      <section className="space-y-8 text-base leading-relaxed">
        <div>
          <h2 className="font-display text-2xl tracking-tight">Servings</h2>
          <p className="mt-2 opacity-80">
            Each tier has a footprint area in square centimetres, worked out from its shape. Round
            tiers use the area of a circle (π × radius²); hexagon tiers use the regular-hexagon
            formula; square and rectangle tiers use width × depth; a heart tier is approximated as a
            square of its width minus 20% for the dip. That footprint is divided by the portion area
            (25 cm² per serving by default) and rounded down to a whole number, with at least one
            serving per tier. The servings from every tier are added together.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight">Price</h2>
          <p className="mt-2 opacity-80">
            Each tier is priced per serving. The base price per serving depends on the tier finish —
            fondant $1.20, ganache $1.50, sponge $1.00 — and a frosting-style surcharge is added on
            top per serving: smooth $0, rustic $0.10, textured $0.15, ruffles $0.20, drip $0.20,
            striped $0.25. The per-serving price is then multiplied by a finish factor (fondant 1,
            buttercream 1.05, ganache 1.15) and by the tier's servings. Each decoration adds a flat
            price on top, for example pearls $6, a sugar flower $6, gold flakes $12, a candle $1.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight">Oven trays</h2>
          <p className="mt-2 opacity-80">
            The footprint area of every tier is added up. That total baked footprint is divided by
            the usable area of one oven tray (1200 cm² by default) and rounded up to a whole number
            of trays, with a minimum of one tray. So trays is the smallest whole number of oven
            trays that could hold the whole cake's footprint, not a per-tier count.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight">Prep minutes</h2>
          <p className="mt-2 opacity-80">
            Prep time starts at a base of 30 minutes. For each tier it adds 8 minutes plus 4 minutes
            per sponge layer in that tier. For each decoration it adds another 2 minutes. The
            default settings are the starting point; the baker can change any of these numbers in the
            studio's Settings panel.
          </p>
        </div>

        <div className="rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--flour)] p-4 font-slip text-sm">
          <div className="font-medium">A worked example</div>
          <p className="mt-2 leading-relaxed">
            Take the default three-tier round cake: tiers of 30, 22 and 14 cm across, all fondant
            with a smooth finish, two sponge layers each, and no decorations.
          </p>
          <ul className="mt-2 space-y-1 leading-relaxed">
            <li>
              Footprints: 707, 380 and 154 cm². Divided by 25 cm² per serving and rounded down, that
              is 28, 15 and 6 servings — <strong>{EXAMPLE.servings} servings</strong> in total.
            </li>
            <li>
              At $1.20 per serving for fondant with a smooth finish (no surcharge), the cake comes to{' '}
              <strong>{fmtMoney(EXAMPLE.price)}</strong>.
            </li>
            <li>
              Total footprint 1241 cm² ÷ 1200 cm² per tray, rounded up ={' '}
              <strong>{EXAMPLE.trays} oven trays</strong>.
            </li>
            <li>
              30 base + 3 tiers × 8 + 6 layers × 4 = <strong>{EXAMPLE.prepMinutes} prep minutes</strong>.
            </li>
          </ul>
        </div>
      </section>

      <section className="mt-12" aria-label="How the buildability check works">
        <h2 className="font-display text-2xl tracking-tight">How the buildability check works</h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed opacity-80">
          While you design, the studio runs a set of simple stacking rules against the tiers and
          decorations. These are guidelines, not structural engineering. The default thresholds are:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 opacity-80">
          <li>
            Support: at least 60% of each upper tier's footprint must rest on the tier below,
            measured with bounding boxes (so hexagons and hearts are slightly conservative).
          </li>
          <li>
            Overhang: an upper tier may not overhang the tier below by more than 25% of its own
            width.
          </li>
          <li>
            Slenderness: the total stack height must stay at most 1.6× the widest tier, or the cake
            gets tippy.
          </li>
          <li>A heart-shaped tier cannot have another tier stacked on it.</li>
          <li>At most 8 decorations may sit on any one tier.</li>
          <li>
            Heavy decorations (sugar flowers, signs, star/heart/text toppers) must not sit at the
            edge of an overhanging tier.
          </li>
        </ul>
        <p className="mt-3 max-w-xl text-base leading-relaxed opacity-80">
          When a rule is broken the studio flags it in plain language and, where it can, offers a
          one-click fix such as centering the tier, lowering the heights, or moving a decoration
          inward.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-6 pb-4">
        <Link
          to="/"
          className="min-h-[48px] rounded-lg px-1 font-slip text-sm font-medium text-[color:var(--teal)] underline underline-offset-4 hover:opacity-80"
        >
          Design a cake
        </Link>
        <Link
          to="/about"
          className="min-h-[48px] rounded-lg px-1 font-slip text-sm font-medium text-[color:var(--teal)] underline underline-offset-4 hover:opacity-80"
        >
          About Batchwise
        </Link>
      </div>
    </main>
  );
}
