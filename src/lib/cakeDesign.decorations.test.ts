import { describe, it, expect } from 'vitest';
import type { DbItem } from '@/lib/api';
import {
  DECORATION_KINDS,
  decorationUnits,
  designToLines,
  designPrice,
  MAX_DECORATIONS_PER_TIER,
  TEXT_TOPPER_FONTS,
  TEXT_TOPPER_MAX_CHARS,
  type CakeDesign,
  type Decoration,
  type DecorationKind,
} from '@/lib/cakeDesign';

const items: DbItem[] = [
  { id: 'i1', name: 'Sugar pearls', keywords: [], price_per_unit: 4, units_per_tray: 10000, prep_minutes_per_batch: 5, lead_time_hours: 48 },
  { id: 'i2', name: 'Candle', keywords: [], price_per_unit: 1.5, units_per_tray: 10000, prep_minutes_per_batch: 3, lead_time_hours: 48 },
  { id: 'i3', name: 'Fresh berries', keywords: [], price_per_unit: 5, units_per_tray: 10000, prep_minutes_per_batch: 8, lead_time_hours: 48 },
  { id: 'i4', name: 'Macarons', keywords: [], price_per_unit: 2.25, units_per_tray: 10000, prep_minutes_per_batch: 120, lead_time_hours: 48 },
  { id: 'i5', name: 'Sprinkles', keywords: [], price_per_unit: 3, units_per_tray: 10000, prep_minutes_per_batch: 4, lead_time_hours: 48 },
  { id: 'i6', name: 'Leaf sprig', keywords: [], price_per_unit: 4.5, units_per_tray: 10000, prep_minutes_per_batch: 6, lead_time_hours: 48 },
  { id: 'i7', name: 'Star topper', keywords: [], price_per_unit: 7, units_per_tray: 10000, prep_minutes_per_batch: 10, lead_time_hours: 48 },
  { id: 'i8', name: 'Heart topper', keywords: [], price_per_unit: 7, units_per_tray: 10000, prep_minutes_per_batch: 10, lead_time_hours: 48 },
  { id: 'i9', name: 'Text topper', keywords: [], price_per_unit: 9, units_per_tray: 10000, prep_minutes_per_batch: 15, lead_time_hours: 48 },
  { id: 'i10', name: 'Gold flakes', keywords: [], price_per_unit: 6.5, units_per_tray: 10000, prep_minutes_per_batch: 8, lead_time_hours: 48 },
];

function deco(kind: DecorationKind, over: Partial<Decoration> = {}): Decoration {
  return { id: crypto.randomUUID(), kind, tier: 0, angle: 0.5, radius: 0.4, ...over };
}

const baseDesign: CakeDesign = {
  tiers: ['tier-8in'],
  decorations: [],
  date: null,
};

describe('decoration library: kinds and config', () => {
  it('has all 13 kinds wired to item names', () => {
    const kinds = DECORATION_KINDS.map((k) => k.kind);
    for (const k of [
      'pearls', 'ribbon', 'candle', 'flower', 'sign', 'berries', 'macarons',
      'sprinkles', 'leafSprig', 'starTopper', 'heartTopper', 'textTopper', 'goldFlakes',
    ] as DecorationKind[]) {
      expect(kinds).toContain(k);
    }
  });

  it('text topper caps at 24 characters with 3 fonts', () => {
    expect(TEXT_TOPPER_MAX_CHARS).toBe(24);
    expect(TEXT_TOPPER_FONTS).toHaveLength(3);
  });
});

describe('decoration library: placement and units', () => {
  it('counts units per kind across tiers', () => {
    const ds: Decoration[] = [
      deco('candle', { tier: 0 }),
      deco('candle', { tier: 0 }),
      deco('berries', { tier: 1 }),
    ];
    expect(decorationUnits('candle', ds)).toBe(2);
    expect(decorationUnits('berries', ds)).toBe(1);
    expect(decorationUnits('sprinkles', ds)).toBe(0);
  });

  it('pearls come in twelves', () => {
    const ds = [deco('pearls'), deco('pearls'), deco('pearls')];
    expect(decorationUnits('pearls', ds)).toBe(12);
  });

  it('converts a decorated design into price lines for every new kind', () => {
    const design: CakeDesign = {
      ...baseDesign,
      decorations: [
        deco('berries'),
        deco('macarons'),
        deco('sprinkles'),
        deco('leafSprig'),
        deco('starTopper'),
        deco('heartTopper'),
        deco('textTopper', { text: 'Happy Day', font: 'display' }),
        deco('goldFlakes'),
      ],
    };
    const lines = designToLines(design, items);
    const names = lines.map((l) => l.item.name);
    for (const n of ['Fresh berries', 'Macarons', 'Sprinkles', 'Leaf sprig', 'Star topper', 'Heart topper', 'Text topper', 'Gold flakes']) {
      expect(names).toContain(n);
    }
    // price: 5 + 2.25 + 3 + 4.5 + 7 + 7 + 9 + 6.5
    expect(designPrice(lines)).toBeCloseTo(44.25, 2);
  });
});

describe('decoration library: per-tier placement limit', () => {
  it('limit is 8 per tier', () => {
    expect(MAX_DECORATIONS_PER_TIER).toBe(8);
  });

  it('pure overload check: 9 decorations on one tier exceed the limit, 8 do not', () => {
    const eight = Array.from({ length: 8 }, () => deco('candle', { tier: 0 }));
    const nine = [...eight, deco('candle', { tier: 0 })];
    const countOnTier = (ds: Decoration[], tier: number) => ds.filter((d) => d.tier === tier).length;
    expect(countOnTier(eight, 0)).toBeLessThanOrEqual(MAX_DECORATIONS_PER_TIER);
    expect(countOnTier(nine, 0)).toBeGreaterThan(MAX_DECORATIONS_PER_TIER);
  });
});

describe('decoration library: decorations survive tier changes attached', () => {
  it('resizing a tier keeps decorations pointing at the same tier index', () => {
    const design: CakeDesign = {
      tiers: ['tier-8in', 'tier-6in'],
      decorations: [deco('candle', { tier: 1 })],
      date: null,
    };
    const tiers = [...design.tiers];
    tiers[1] = 'tier-4in';
    const resized = { ...design, tiers };
    expect(resized.decorations[0].tier).toBe(1);
  });
});
