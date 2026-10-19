import type { Decoration, StudioDesign } from '@/lib/cakeModel';
import {
  HEAVY_DECORATIONS,
  MAX_DECORATIONS_PER_TIER,
  bboxOverlapArea,
  tierBBox,
} from '@/lib/cakeModel';

export type BuildThresholds = {
  /** min fraction of the upper tier's area that must sit on the tier below */
  minSupportFraction: number;
  /** max overhang as a fraction of the upper tier's own width */
  maxOverhangFraction: number;
  /** total height as a multiple of the widest tier */
  maxSlenderness: number;
};

export const DEFAULT_THRESHOLDS: BuildThresholds = {
  minSupportFraction: 0.6,
  maxOverhangFraction: 0.25,
  maxSlenderness: 1.6,
};

export type BuildFlag = {
  id: string;
  /** plain-language summary of the problem */
  message: string;
  /** why it matters */
  why: string;
  /** optional one-click fix label; null = no automatic fix */
  fixLabel: string | null;
  /** tier index the flag is about, when relevant */
  tier?: number;
};

export type BuildCheck = {
  flags: BuildFlag[];
  /** helper payloads keyed by flag id, used by one-click fixes */
  fixes: Record<string, () => StudioDesign>;
};

/**
 * Approximate each tier's footprint with an axis-aligned box (bounding boxes)
 * and check stacking. Pure function: same design and thresholds, same flags.
 */
export function checkBuildability(design: StudioDesign, th: BuildThresholds = DEFAULT_THRESHOLDS): BuildCheck {
  const flags: BuildFlag[] = [];
  const fixes: Record<string, () => StudioDesign> = {};
  if (design.type !== 'tiered' || design.tiers.length === 0) return { flags, fixes };

  const tiers = design.tiers;

  for (let i = 1; i < tiers.length; i++) {
    const upper = tiers[i];
    const lower = tiers[i - 1];
    const upBox = tierBBox(upper);
    const loBox = tierBBox(lower);
    const upperArea = upBox.w * upBox.d;
    const support = bboxOverlapArea(upBox, loBox);
    const fraction = upperArea > 0 ? support / upperArea : 1;

    if (fraction < th.minSupportFraction) {
      const fixId = `support-${i}`;
      flags.push({
        id: fixId,
        message: `Tier ${i + 1} sits mostly off the tier below — only about ${Math.round(fraction * 100)}% rests on it.`,
        why: `At least ${Math.round(th.minSupportFraction * 100)}% of the upper tier needs to rest on the tier underneath, or it can tip or sink. (This is estimated with bounding boxes, so hexagons and hearts are slightly conservative.)`,
        fixLabel: 'Center this tier',
        tier: i,
      });
      fixes[fixId] = () => centerTier(design, i);
    }

    // overhang: how far the upper tier's edge extends past the lower one
    const overhangX = Math.max(0, Math.abs(upper.offsetXCm - lower.offsetXCm) + (upBox.w - loBox.w) / 2);
    const overhangZ = Math.max(0, Math.abs(upper.offsetZCm - lower.offsetZCm) + (upBox.d - loBox.d) / 2);
    const overhang = Math.max(overhangX, overhangZ);
    const overhangFraction = upBox.w > 0 ? overhang / upBox.w : 0;
    if (overhangFraction > th.maxOverhangFraction) {
      const fixId = `overhang-${i}`;
      flags.push({
        id: fixId,
        message: `Tier ${i + 1} overhangs the tier below by about ${Math.round(overhangFraction * 100)}% of its width.`,
        why: `An upper tier may not overhang the one below by more than ${Math.round(th.maxOverhangFraction * 100)}% of its width — beyond that the edge has nothing under it.`,
        fixLabel: 'Center this tier',
        tier: i,
      });
      fixes[fixId] = () => centerTier(design, i);
    }
  }

  // slenderness: total height vs widest tier
  const widest = Math.max(...tiers.map((t) => Math.max(t.widthCm, t.depthCm)));
  const totalHeight = tiers.reduce((acc, t) => acc + t.heightCm, 0);
  if (totalHeight > widest * th.maxSlenderness) {
    const fixId = 'slender';
    flags.push({
      id: fixId,
      message: `The stack is ${totalHeight} cm tall on a ${widest} cm base — over ${th.maxSlenderness}x the widest tier.`,
      why: `Total height should stay at most ${th.maxSlenderness}x the widest tier, or the cake gets tippy.`,
      fixLabel: 'Lower the heights',
    });
    fixes[fixId] = () => lowerHeights(design);
  }

  // heart cannot support another tier
  for (let i = 0; i < tiers.length - 1; i++) {
    if (tiers[i].shape === 'heart') {
      const fixId = `heart-${i}`;
      flags.push({
        id: fixId,
        message: `Tier ${i + 1} is a heart shape with a tier stacked on it.`,
        why: 'A heart cannot support another tier — the dip in the top makes the tier above unstable.',
        fixLabel: 'Remove the tier above',
        tier: i,
      });
      fixes[fixId] = () => removeTierAbove(design, i);
    }
  }

  // decorations per tier
  const perTier = new Map<number, number>();
  for (const d of design.decorations) perTier.set(d.tier, (perTier.get(d.tier) ?? 0) + 1);
  for (const [tier, count] of perTier) {
    if (count > MAX_DECORATIONS_PER_TIER) {
      const fixId = `deco-${tier}`;
      flags.push({
        id: fixId,
        message: `Tier ${tier + 1} has ${count} decorations — the limit is ${MAX_DECORATIONS_PER_TIER}.`,
        why: `More than ${MAX_DECORATIONS_PER_TIER} items on one tier gets crowded and hard to pipe around.`,
        fixLabel: 'Remove the extras',
        tier,
      });
      fixes[fixId] = () => trimDecorations(design, tier);
    }
  }

  // heavy items on an overhanging edge
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const lower = i > 0 ? tiers[i - 1] : null;
    for (const d of design.decorations.filter((x) => x.tier === i)) {
      if (!HEAVY_DECORATIONS.includes(d.kind) || d.radius < 0.85) continue;
      const overhangs = !lower
        ? d.radius > 0.95
        : Math.abs(tier.offsetXCm - lower.offsetXCm) + (tierBBox(tier).w - tierBBox(lower).w) / 2 > 0 ||
          Math.abs(tier.offsetZCm - lower.offsetZCm) + (tierBBox(tier).d - tierBBox(lower).d) / 2 > 0;
      if (overhangs) {
        const fixId = `heavy-${d.id}`;
        flags.push({
          id: fixId,
          message: `A heavy decoration on tier ${i + 1} is right at the edge${lower ? ' of an overhanging tier' : ''}.`,
          why: 'Heavy items (flowers, toppers) should not sit on an overhanging edge — they can slide or tip the edge down.',
          fixLabel: 'Move it inward',
          tier: i,
        });
        fixes[fixId] = () => moveDecorationInward(design, d.id);
      }
    }
  }

  return { flags, fixes };
}

// ---- one-click fixes (pure: design in, design out) ----

export function centerTier(design: StudioDesign, tierIndex: number): StudioDesign {
  return {
    ...design,
    tiers: design.tiers.map((t, i) => (i === tierIndex ? { ...t, offsetXCm: 0, offsetZCm: 0 } : t)),
  };
}

export function lowerHeights(design: StudioDesign): StudioDesign {
  // scale heights down so the stack meets the slenderness guideline
  const widest = Math.max(...design.tiers.map((t) => Math.max(t.widthCm, t.depthCm)));
  const maxTotal = widest * DEFAULT_THRESHOLDS.maxSlenderness;
  const total = design.tiers.reduce((acc, t) => acc + t.heightCm, 0);
  if (total <= maxTotal) return design;
  const k = maxTotal / total;
  return {
    ...design,
    tiers: design.tiers.map((t) => ({ ...t, heightCm: Math.max(4, Math.round(t.heightCm * k)) })),
  };
}

export function removeTierAbove(design: StudioDesign, tierIndex: number): StudioDesign {
  if (tierIndex + 1 >= design.tiers.length) return design;
  return {
    ...design,
    tiers: design.tiers.filter((_, i) => i !== tierIndex + 1),
    decorations: design.decorations
      .filter((d) => d.tier !== tierIndex + 1)
      .map((d) => (d.tier > tierIndex + 1 ? { ...d, tier: d.tier - 1 } : d)),
  };
}

export function trimDecorations(design: StudioDesign, tier: number): StudioDesign {
  const kept: Decoration[] = [];
  let count = 0;
  for (const d of design.decorations) {
    if (d.tier === tier) {
      count += 1;
      if (count > MAX_DECORATIONS_PER_TIER) continue;
    }
    kept.push(d);
  }
  return { ...design, decorations: kept };
}

export function moveDecorationInward(design: StudioDesign, id: string): StudioDesign {
  return {
    ...design,
    decorations: design.decorations.map((d) =>
      d.id === id ? { ...d, radius: Math.min(d.radius, 0.8) } : d
    ),
  };
}
