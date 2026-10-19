import { describe, it, expect } from 'vitest';
import {
  LIMITS,
  clampTier,
  defaultDesign,
  depthRange,
  isTierWithinLimits,
  makeTier,
  migrateLegacyDesign,
  widthRange,
  type CakeTier,
} from '@/lib/cakeModel';

describe('cakeModel: width/depth ranges per shape', () => {
  it('round and hexagon span 10 to 50 cm', () => {
    expect(widthRange('round')).toEqual({ min: 10, max: 50 });
    expect(widthRange('hexagon')).toEqual({ min: 10, max: 50 });
  });

  it('square spans 10 to 50 cm', () => {
    expect(widthRange('square')).toEqual({ min: 10, max: 50 });
  });

  it('rectangle is 15 to 60 cm wide and 10 to 40 cm deep', () => {
    expect(widthRange('rectangle')).toEqual({ min: 15, max: 60 });
    expect(depthRange('rectangle')).toEqual({ min: 10, max: 40 });
  });

  it('heart spans 15 to 40 cm', () => {
    expect(widthRange('heart')).toEqual({ min: 15, max: 40 });
  });

  it('non-rectangle depth matches its width range', () => {
    expect(depthRange('round')).toEqual(widthRange('round'));
    expect(depthRange('heart')).toEqual(widthRange('heart'));
  });
});

describe('cakeModel: height, layer and tier-count limits', () => {
  it('height is clamped into 4 to 20 cm', () => {
    expect(clampTier(makeTier({ heightCm: 1 })).heightCm).toBe(LIMITS.heightMin);
    expect(clampTier(makeTier({ heightCm: 99 })).heightCm).toBe(LIMITS.heightMax);
    expect(clampTier(makeTier({ heightCm: 12 })).heightCm).toBe(12);
  });

  it('layers are clamped into 2 to 6', () => {
    expect(clampTier(makeTier({ layers: 0 })).layers).toBe(LIMITS.layersMin);
    expect(clampTier(makeTier({ layers: 9 })).layers).toBe(LIMITS.layersMax);
    expect(clampTier(makeTier({ layers: 4 })).layers).toBe(4);
  });

  it('default design has 1 to 4 tiers', () => {
    expect(defaultDesign().tiers.length).toBeGreaterThanOrEqual(LIMITS.tiersMin);
    expect(defaultDesign().tiers.length).toBeLessThanOrEqual(LIMITS.tiersMax);
  });
});

describe('cakeModel: clamping and limit checks', () => {
  it('clamps width into the shape range', () => {
    expect(clampTier(makeTier({ shape: 'round', widthCm: 5 })).widthCm).toBe(10);
    expect(clampTier(makeTier({ shape: 'round', widthCm: 80 })).widthCm).toBe(50);
    expect(clampTier(makeTier({ shape: 'rectangle', widthCm: 5 })).widthCm).toBe(15);
    expect(clampTier(makeTier({ shape: 'rectangle', widthCm: 80 })).widthCm).toBe(60);
  });

  it('clamps rectangle depth into 10 to 40 cm', () => {
    expect(clampTier(makeTier({ shape: 'rectangle', widthCm: 40, depthCm: 5 })).depthCm).toBe(10);
    expect(clampTier(makeTier({ shape: 'rectangle', widthCm: 40, depthCm: 90 })).depthCm).toBe(40);
  });

  it('a clamped tier is always within limits', () => {
    const odd: CakeTier = {
      shape: 'heart',
      widthCm: 100,
      depthCm: 1,
      heightCm: 0,
      layers: 12,
      finish: 'fondant',
      spongeColor: '#fff',
      fillingColor: '#000',
      frostingColor: '#123456',
      frostingStyle: 'striped',
      offsetXCm: 999,
      offsetZCm: -999,
    };
    expect(isTierWithinLimits(clampTier(odd))).toBe(true);
  });

  it('reports an out-of-range tier as not within limits', () => {
    const raw: CakeTier = { ...makeTier(), widthCm: 5 };
    expect(isTierWithinLimits(raw)).toBe(false);
    expect(isTierWithinLimits(makeTier({ widthCm: 20 }))).toBe(true);
  });
});

describe('cakeModel: migration from the legacy design', () => {
  it('maps legacy inch keys to cm inside the limits', () => {
    const migrated = migrateLegacyDesign({
      tiers: ['tier-10in', 'tier-8in', 'tier-6in', 'tier-4in'],
      decorations: [],
      date: null,
    });
    expect(migrated.tiers.map((t) => t.widthCm)).toEqual([25.4, 20.32, 15.24, 10.16]);
    for (const t of migrated.tiers) expect(isTierWithinLimits(t)).toBe(true);
  });

  it('keeps the legacy cake color as the frosting color', () => {
    const migrated = migrateLegacyDesign({
      tiers: ['tier-8in'],
      decorations: [],
      date: null,
      color: '#E8B4B8',
    });
    expect(migrated.tiers[0].frostingColor).toBe('#e8b4b8');
  });

  it('keeps decorations and drops the order date', () => {
    const dec = { id: 'd1', kind: 'candle' as const, tier: 0, angle: 1, radius: 0.5 };
    const migrated = migrateLegacyDesign({
      tiers: ['tier-8in', 'tier-6in'],
      decorations: [dec],
      date: '2026-11-02',
    });
    expect(migrated.decorations).toEqual([dec]);
    expect('date' in migrated).toBe(false);
  });

  it('defaults offsets to centered and produces a tiered cake', () => {
    const migrated = migrateLegacyDesign({
      tiers: ['tier-8in'],
      decorations: [],
      date: null,
    });
    expect(migrated.type).toBe('tiered');
    for (const t of migrated.tiers) {
      expect(t.offsetXCm).toBe(0);
      expect(t.offsetZCm).toBe(0);
    }
  });

  it('keeps an empty legacy design loadable by falling back to defaults', () => {
    const migrated = migrateLegacyDesign({ tiers: [], decorations: [], date: null });
    expect(migrated.tiers.length).toBeGreaterThanOrEqual(LIMITS.tiersMin);
  });
});
