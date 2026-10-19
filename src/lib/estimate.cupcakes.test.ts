import { describe, it, expect } from 'vitest';
import { estimate, DEFAULT_SETTINGS } from '@/lib/estimate';
import { cupcakeDesign, type StudioDesign } from '@/lib/cakeModel';

function cc(quantity: number, topper: StudioDesign['cupcakeTopper'] = 'none'): StudioDesign {
  const d = cupcakeDesign(quantity, 'board');
  return { ...d, cupcakeTopper: topper };
}

describe('cupcake estimate: servings and trays', () => {
  it('servings equal the quantity', () => {
    expect(estimate(cc(1), DEFAULT_SETTINGS).servings).toBe(1);
    expect(estimate(cc(6), DEFAULT_SETTINGS).servings).toBe(6);
    expect(estimate(cc(12), DEFAULT_SETTINGS).servings).toBe(12);
    expect(estimate(cc(24), DEFAULT_SETTINGS).servings).toBe(24);
    expect(estimate(cc(48), DEFAULT_SETTINGS).servings).toBe(48);
  });

  it('trays equal quantity divided by 12 rounded up, minimum 1', () => {
    expect(estimate(cc(1), DEFAULT_SETTINGS).trays).toBe(1);
    expect(estimate(cc(6), DEFAULT_SETTINGS).trays).toBe(1);
    expect(estimate(cc(12), DEFAULT_SETTINGS).trays).toBe(1);
    expect(estimate(cc(13), DEFAULT_SETTINGS).trays).toBe(2);
    expect(estimate(cc(24), DEFAULT_SETTINGS).trays).toBe(2);
    expect(estimate(cc(25), DEFAULT_SETTINGS).trays).toBe(3);
    expect(estimate(cc(36), DEFAULT_SETTINGS).trays).toBe(3);
    expect(estimate(cc(48), DEFAULT_SETTINGS).trays).toBe(4);
  });
});

describe('cupcake estimate: prep minutes', () => {
  it('uses base + per tier + per layer from settings', () => {
    const r = estimate(cc(12), DEFAULT_SETTINGS);
    // base 30 + perTier 8 + perLayer * 2 layers = 30 + 8 + 8 = 46
    expect(r.prepMinutes).toBe(46);
  });

  it('prep does not scale with quantity (one design, one prep batch)', () => {
    const r6 = estimate(cc(6), DEFAULT_SETTINGS).prepMinutes;
    const r48 = estimate(cc(48), DEFAULT_SETTINGS).prepMinutes;
    expect(r6).toBe(r48);
  });
});

describe('cupcake estimate: price', () => {
  it('price scales with quantity', () => {
    const r6 = estimate(cc(6), DEFAULT_SETTINGS).price;
    const r12 = estimate(cc(12), DEFAULT_SETTINGS).price;
    expect(r12).toBeCloseTo(r6 * 2, 5);
  });

  it('adds the topper price per cupcake when a topper is chosen', () => {
    const none = estimate(cc(12, 'none'), DEFAULT_SETTINGS).price;
    const candle = estimate(cc(12, 'candle'), DEFAULT_SETTINGS).price;
    // candle decoration price is 1 per cupcake
    expect(candle - none).toBeCloseTo(12 * 1, 5);
  });

  it('no topper adds nothing', () => {
    const none = estimate(cc(12, 'none'), DEFAULT_SETTINGS).price;
    const star = estimate(cc(12, 'starTopper'), DEFAULT_SETTINGS).price;
    expect(star).toBeGreaterThan(none);
  });
});

describe('cupcake estimate: sanity', () => {
  it('no result is NaN, undefined or negative', () => {
    for (const q of [1, 6, 12, 24, 48]) {
      const r = estimate(cc(q), DEFAULT_SETTINGS);
      for (const v of [r.servings, r.price, r.trays, r.prepMinutes]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('changing price per serving changes the result', () => {
    const base = estimate(cc(12), DEFAULT_SETTINGS).price;
    const higher = estimate(cc(12), {
      ...DEFAULT_SETTINGS,
      pricePerServing: { ...DEFAULT_SETTINGS.pricePerServing, fondant: 5 },
    }).price;
    expect(higher).toBeGreaterThan(base);
  });
});
