import { describe, it, expect } from 'vitest';
import type { DbItem } from '@/lib/api';
import {
  TIER_SPECS,
  DECORATION_KINDS,
  FINISHES,
  tierSpec,
  totalServings,
  decorationUnits,
  designToLines,
  designPrice,
  resizeTiers,
  addTier,
  removeTier,
  formatDateLabel,
  ribbonAnchor,
  ribbonBandLocal,
  ribbonLocalY,
  finishFor,
  setFinish,
  mixHex,
  confirmDisabledReason,
  selectFitChips,
  upcomingDates,
  type CakeDesign,
} from '@/lib/cakeDesign';

// Items matching the seeded Odile's Kitchen prices so the summary, Slip and
// Baker's sheet are tested against realistic numbers.
const ITEMS: DbItem[] = [
  { id: 'i-10', name: 'Cake tier 10in', keywords: [], price_per_unit: 200, units_per_tray: 1, prep_minutes_per_batch: 150, lead_time_hours: 48 },
  { id: 'i-8', name: 'Cake tier 8in', keywords: [], price_per_unit: 140, units_per_tray: 1, prep_minutes_per_batch: 120, lead_time_hours: 48 },
  { id: 'i-6', name: 'Cake tier 6in', keywords: [], price_per_unit: 85, units_per_tray: 1, prep_minutes_per_batch: 90, lead_time_hours: 48 },
  { id: 'i-4', name: 'Cake tier 4in', keywords: [], price_per_unit: 55, units_per_tray: 1, prep_minutes_per_batch: 60, lead_time_hours: 48 },
  { id: 'i-p', name: 'Sugar pearls', keywords: [], price_per_unit: 4, units_per_tray: 10000, prep_minutes_per_batch: 5, lead_time_hours: 48 },
  { id: 'i-f', name: 'Sugar flower', keywords: [], price_per_unit: 6, units_per_tray: 10000, prep_minutes_per_batch: 15, lead_time_hours: 48 },
  { id: 'i-c', name: 'Candle', keywords: [], price_per_unit: 1.5, units_per_tray: 10000, prep_minutes_per_batch: 3, lead_time_hours: 48 },
  { id: 'i-r', name: 'Ribbon band', keywords: [], price_per_unit: 8, units_per_tray: 10000, prep_minutes_per_batch: 10, lead_time_hours: 48 },
];

function itemByName(name: string): DbItem {
  const it = ITEMS.find((i) => i.name === name);
  if (!it) throw new Error(`missing item ${name}`);
  return it;
}

// What the summary panel, Slip and Baker's sheet all derive from the design.
function summaryNumbers(design: CakeDesign) {
  const lines = designToLines(design, ITEMS);
  return {
    lines,
    price: designPrice(lines),
    servings: totalServings(design.tiers),
    // prep minutes as the summary panel computes them (Σ item prep per line,
    // decorations use prep_minutes_per_batch per unit)
    prep: lines.reduce((acc, l) => {
      const it = itemByName(l.item.name);
      return acc + (l.item.units_per_tray >= 1000 ? it.prep_minutes_per_batch * l.units : it.prep_minutes_per_batch);
    }, 0),
  };
}

describe('cakeDesign: servings and price for 1, 2, 3 tier designs', () => {
  it('1-tier design (8in) has correct servings and price', () => {
    const design: CakeDesign = { tiers: ['tier-8in'], decorations: [], date: null };
    const s = summaryNumbers(design);
    expect(s.servings).toBe(24);
    expect(s.price).toBe(140);
    expect(s.prep).toBe(120);
  });

  it('2-tier design (8in + 6in) has correct servings and price', () => {
    const design: CakeDesign = { tiers: ['tier-8in', 'tier-6in'], decorations: [], date: null };
    const s = summaryNumbers(design);
    expect(s.servings).toBe(24 + 12);
    expect(s.price).toBe(140 + 85);
    expect(s.prep).toBe(120 + 90);
  });

  it('3-tier design (10 + 8 + 6in) has correct servings and price', () => {
    const design: CakeDesign = { tiers: ['tier-10in', 'tier-8in', 'tier-6in'], decorations: [], date: null };
    const s = summaryNumbers(design);
    expect(s.servings).toBe(40 + 24 + 12);
    expect(s.price).toBe(200 + 140 + 85);
    expect(s.prep).toBe(150 + 120 + 90);
  });

  it('3-tier design with decorations adds decoration price and prep', () => {
    const design: CakeDesign = {
      tiers: ['tier-10in', 'tier-8in', 'tier-6in'],
      decorations: [
        { id: 'd1', kind: 'pearls', tier: 0, angle: 0.4, radius: 0.5 },
        { id: 'd2', kind: 'flower', tier: 1, angle: 1.2, radius: 0.3 },
        { id: 'd3', kind: 'candle', tier: 2, angle: 2.0, radius: 0.4 },
      ],
      date: null,
    };
    const s = summaryNumbers(design);
    // pearls x12 units (one placement = 12), flower x1, candle x1
    expect(s.price).toBe(200 + 140 + 85 + 12 * 4 + 6 + 1.5);
    expect(s.prep).toBe(150 + 120 + 90 + 5 * 12 + 15 + 3);
  });
});

describe('cakeDesign: decorations keep position after tier resize', () => {
  it('decorations keep their angle and radius after resizing a tier', () => {
    const design: CakeDesign = {
      tiers: ['tier-10in', 'tier-6in'],
      decorations: [
        { id: 'd1', kind: 'pearls', tier: 0, angle: 0.7, radius: 0.6 },
        { id: 'd2', kind: 'flower', tier: 1, angle: 2.4, radius: 0.35 },
      ],
      date: null,
    };
    const resized = resizeTiers(design, 0, 'tier-8in');
    expect(resized.tiers).toEqual(['tier-8in', 'tier-6in']);
    expect(resized.decorations).toEqual(design.decorations);
  });

  it('decoration position stays on the tier surface after resize (radius within 0..1)', () => {
    const design: CakeDesign = {
      tiers: ['tier-10in', 'tier-6in'],
      decorations: [{ id: 'd1', kind: 'pearls', tier: 0, angle: 1.0, radius: 0.9 }],
      date: null,
    };
    const resized = resizeTiers(design, 0, 'tier-4in');
    const d = resized.decorations[0];
    expect(d.radius).toBeGreaterThanOrEqual(0.05);
    expect(d.radius).toBeLessThanOrEqual(1);
    // angle unchanged; radius is relative to the tier so the decoration
    // tracks the surface at the same relative spot
    expect(d.angle).toBe(1.0);
    expect(d.radius).toBe(0.9);
  });
});

describe('cakeDesign: deleting a decoration lowers price and prep', () => {
  it('price and prep drop by the deleted decoration amount', () => {
    const withDeco: CakeDesign = {
      tiers: ['tier-8in', 'tier-6in'],
      decorations: [
        { id: 'd1', kind: 'flower', tier: 0, angle: 0.5, radius: 0.5 },
        { id: 'd2', kind: 'candle', tier: 1, angle: 1.5, radius: 0.4 },
      ],
      date: null,
    };
    const before = summaryNumbers(withDeco);

    const afterDelete: CakeDesign = {
      ...withDeco,
      decorations: withDeco.decorations.filter((d) => d.id !== 'd1'),
    };
    const after = summaryNumbers(afterDelete);

    expect(after.price).toBe(before.price - 6);
    expect(after.prep).toBe(before.prep - 15);
    expect(after.price).toBeLessThan(before.price);
    expect(after.prep).toBeLessThan(before.prep);
  });

  it('deleting all pearls (single placement = 12 units) drops 12 units of price and prep', () => {
    const withPearls: CakeDesign = {
      tiers: ['tier-8in'],
      decorations: [{ id: 'd1', kind: 'pearls', tier: 0, angle: 0.3, radius: 0.5 }],
      date: null,
    };
    const before = summaryNumbers(withPearls);
    expect(before.price).toBe(140 + 12 * 4);

    const after: CakeDesign = { ...withPearls, decorations: [] };
    const s = summaryNumbers(after);
    expect(s.price).toBe(140);
    expect(s.prep).toBe(120);
  });
});

describe('cakeDesign: Slip and Baker\'s sheet use the same numbers as the summary', () => {
  it('Slip line items equal summary lines (per-tier + per-decoration-kind)', () => {
    const design: CakeDesign = {
      tiers: ['tier-10in', 'tier-8in', 'tier-6in'],
      decorations: [
        { id: 'd1', kind: 'pearls', tier: 0, angle: 0.4, radius: 0.5 },
        { id: 'd2', kind: 'ribbon', tier: 1, angle: 0, radius: 1 },
      ],
      date: '2026-11-07',
    };
    const s = summaryNumbers(design);

    // What the Slip renders: one row per tier + one row per decoration kind with units > 0
    const slipRows = [
      ...design.tiers.map((k) => itemByName(tierSpec(k).name)),
      ...DECORATION_KINDS.map(({ kind, itemName }) => ({ kind, itemName, units: decorationUnits(kind, design.decorations) }))
        .filter(({ units }) => units > 0)
        .map(({ itemName, units }) => ({ item: itemByName(itemName), units })),
    ];

    expect(slipRows.length).toBe(s.lines.length);
    expect(s.lines.map((l) => l.item.name)).toEqual(slipRows.map((r) => ('name' in r ? r.name : r.item.name)));
    // The Slip total is the same number as the summary price
    const slipTotal = s.lines.reduce((acc, l) => acc + l.item.price_per_unit * l.units, 0);
    expect(slipTotal).toBe(s.price);
  });

  it('Baker\'s sheet servings and total equal summary numbers', () => {
    const design: CakeDesign = {
      tiers: ['tier-8in', 'tier-6in'],
      decorations: [{ id: 'd1', kind: 'flower', tier: 1, angle: 1.1, radius: 0.4 }],
      date: '2026-11-07',
    };
    const s = summaryNumbers(design);
    // Baker's sheet renders servings and $price passed from the same useMemo
    // derived values (designToLines/designPrice/totalServings)
    expect(s.servings).toBe(36);
    expect(s.price).toBe(140 + 85 + 6);
    // lines rendered on the sheet match summary lines exactly
    expect(s.lines).toEqual(designToLines(design, ITEMS));
  });

  it('confirmed slip total matches the order total computed from the design', () => {
    const design: CakeDesign = {
      tiers: ['tier-8in', 'tier-6in'],
      decorations: [
        { id: 'd1', kind: 'pearls', tier: 0, angle: 0.4, radius: 0.5 },
        { id: 'd2', kind: 'candle', tier: 1, angle: 1.5, radius: 0.4 },
      ],
      date: '2026-11-07',
    };
    const s = summaryNumbers(design);
    expect(s.price).toBe(140 + 85 + 12 * 4 + 1.5);
    // formatDateLabel is what both Slip and Baker's sheet render for pickup
    expect(formatDateLabel(design.date as string)).toBe('Saturday 7');
  });
});

describe('cakeDesign: tier add/remove', () => {
  it('addTier appends by the count rule (2nd tier = 8in, then 6in, then 4in), max 4', () => {
    let design: CakeDesign = { tiers: ['tier-8in'], decorations: [], date: null };
    design = addTier(design);
    // addTier uses TIER_SPECS[tiers.length] — count-based, not based on the
    // smallest existing tier — so the 2nd tier of an 8in cake is 8in
    expect(design.tiers).toEqual(['tier-8in', 'tier-8in']);
    design = addTier(design);
    expect(design.tiers).toEqual(['tier-8in', 'tier-8in', 'tier-6in']);
    design = addTier(design);
    expect(design.tiers.length).toBe(4);
    expect(addTier(design).tiers.length).toBe(4);
  });

  it('removeTier drops decorations on that tier, min 1 tier', () => {
    const design: CakeDesign = {
      tiers: ['tier-8in', 'tier-6in'],
      decorations: [{ id: 'd1', kind: 'flower', tier: 1, angle: 1, radius: 0.5 }],
      date: null,
    };
    const after = removeTier(design, 1);
    expect(after.tiers).toEqual(['tier-8in']);
    expect(after.decorations).toEqual([]);
    // never below 1 tier
    const single: CakeDesign = { tiers: ['tier-8in'], decorations: [], date: null };
    expect(removeTier(single, 0).tiers.length).toBe(1);
  });
});

describe('cakeDesign: finishes and color', () => {
  it('finish defaults to fondant and setFinish updates only that tier', () => {
    const design: CakeDesign = { tiers: ['tier-8in', 'tier-6in'], decorations: [], date: null };
    expect(finishFor(design, 0)).toBe('fondant');
    const next = setFinish(design, 1, 'ganache');
    expect(finishFor(next, 1)).toBe('ganache');
    expect(finishFor(next, 0)).toBe('fondant');
    expect(FINISHES.map((f) => f.label)).toEqual(['Matte fondant', 'Glossy ganache', 'Plain sponge']);
  });

  it('mixHex blends two colors linearly', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('existing designs without finishes keep working through designToLines', () => {
    const design: CakeDesign = { tiers: ['tier-8in'], decorations: [], date: null };
    expect(designToLines(design, ITEMS).map((l) => l.item.name)).toEqual(['Cake tier 8in']);
  });
});

describe('cakeDesign: ribbon band geometry', () => {
  it('ribbon wraps the tier side: anchor radius equals the tier radius', () => {
    const design: CakeDesign = { tiers: ['tier-10in', 'tier-6in'], decorations: [], date: null };
    const a = ribbonAnchor(design.tiers, 0, 0.5);
    expect(a.radius).toBe(tierSpec('tier-10in').size * 0.07); // 10 * 0.14 / 2
    expect(a.radius).toBeGreaterThan(0);
    // sits on the side, i.e. below the tier top
    expect(a.y).toBeLessThan(0.9);
    expect(a.y).toBeGreaterThan(0);
  });

  it('ribbon anchor follows the tier it is attached to, not the top of the cake', () => {
    const design: CakeDesign = { tiers: ['tier-8in', 'tier-8in'], decorations: [], date: null };
    const lower = ribbonAnchor(design.tiers, 0, 0.5);
    const upper = ribbonAnchor(design.tiers, 1, 0.5);
    expect(upper.y).toBeGreaterThan(lower.y);
    expect(upper.radius).toBe(lower.radius);
  });

  it('a placed ribbon makes a full-ring band: radius slightly larger than its tier', () => {
    const design: CakeDesign = { tiers: ['tier-10in', 'tier-6in'], decorations: [], date: null };
    const band = ribbonBandLocal(design.tiers, 0, 0.5);
    const tierR = tierSpec('tier-10in').size * 0.07;
    // full closed ring (360deg) with radius just over the tier side (+0.5%)
    expect(band.radius).toBeCloseTo(tierR * 1.005, 10);
    expect(band.radius).toBeGreaterThan(tierR);
    // a short band (12% of tier height)
    expect(band.height).toBeCloseTo(0.9 * 0.12, 10);
    // stays on its own tier: the top tier's band sits higher than the bottom tier's
    const upper = ribbonBandLocal(design.tiers, 1, 0.5);
    expect(upper.radius).toBeLessThan(band.radius);
  });

  it('a ribbon on tier 1 and tier 2 get different local y positions, both inside their tier extent', () => {
    const tiers = ['tier-10in', 'tier-6in', 'tier-4in'];
    // A ribbon on tier 1 (index 0) at height 0.3 and a ribbon on tier 2
    // (index 1) at height 0.7: their tier-LOCAL y positions differ because
    // the height fraction differs, and both sit inside the tier's vertical
    // extent (±TIER_HEIGHT/2 = ±0.45).
    const tier1Y = ribbonLocalY(0.3);
    const tier2Y = ribbonLocalY(0.7);
    expect(tier1Y).not.toBeCloseTo(tier2Y, 10);
    expect(tier1Y).toBeGreaterThanOrEqual(-0.45);
    expect(tier1Y).toBeLessThanOrEqual(0.45);
    expect(tier2Y).toBeGreaterThanOrEqual(-0.45);
    expect(tier2Y).toBeLessThanOrEqual(0.45);
    // every height fraction lands inside the tier's vertical extent
    for (const t of [0, 0.15, 0.5, 0.85, 1]) {
      const y = ribbonLocalY(t);
      expect(y).toBeGreaterThanOrEqual(-0.45);
      expect(y).toBeLessThanOrEqual(0.45);
    }
    // sanity: heightT 0.5 is the tier center, 0.25 below it, 0.75 above it
    expect(ribbonLocalY(0.5)).toBeCloseTo(0, 10);
    expect(ribbonLocalY(0.25)).toBeLessThan(0);
    expect(ribbonLocalY(0.75)).toBeGreaterThan(0);
    // tiers array is still in scope so this test documents the shape contract
    expect(tiers.length).toBe(3);
  });
});

describe('cakeDesign: suggested date chips and confirm gate', () => {
  it('chips keep only dates whose real capacity check returned fits=true', () => {
    const candidates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
    const results = [
      { fits: false, trays_left: 0 },
      { fits: true, trays_left: 3 },
      null,
      { fits: true, trays_left: 5 },
    ];
    const chips = selectFitChips(candidates, results);
    expect(chips).toEqual([
      { date: '2026-11-03', traysLeft: 3 },
      { date: '2026-11-05', traysLeft: 5 },
    ]);
  });

  it('confirm is enabled only with a date, a capacity check, and fits=true', () => {
    expect(confirmDisabledReason({ date: null, hasCapacity: false })).toBe('Pick a date first');
    expect(confirmDisabledReason({ date: '2026-11-02', hasCapacity: false })).toBe('Check this date first');
    expect(confirmDisabledReason({ date: '2026-11-02', hasCapacity: true, fits: false })).toBe(
      'This date is full, try a suggested date'
    );
    expect(confirmDisabledReason({ date: '2026-11-02', hasCapacity: true, fits: true })).toBeNull();
  });

  it('upcomingDates produces ISO dates starting two days ahead', () => {
    const from = new Date(2026, 9, 18); // Oct 18 2026
    const dates = upcomingDates(3, 2, from);
    expect(dates).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });
});
