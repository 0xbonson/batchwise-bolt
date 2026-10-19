import type { DbItem } from '@/lib/api';

export type DecorationKind =
  | 'pearls'
  | 'ribbon'
  | 'candle'
  | 'flower'
  | 'sign'
  | 'berries'
  | 'macarons'
  | 'sprinkles'
  | 'leafSprig'
  | 'starTopper'
  | 'heartTopper'
  | 'textTopper'
  | 'goldFlakes';

export type Decoration = {
  id: string;
  kind: DecorationKind;
  /** tier index the decoration sits on */
  tier: number;
  /** angle around the tier, radians */
  angle: number;
  /** 0..1 from center to edge */
  radius: number;
  /** ribbon only: height on the tier side as a fraction of the tier height, 0..1 */
  heightT?: number;
  /** textTopper only: typed text, up to 24 characters */
  text?: string;
  /** textTopper only: font key, one of TEXT_TOPPER_FONTS */
  font?: string;
  /** flower only: 'rose' or 'daisy' */
  variant?: string;
};

export type CakeDesign = {
  /** tier size keys, bottom to top */
  tiers: string[];
  decorations: Decoration[];
  date: string | null;
  /** per-tier finish, bottom to top; missing entries fall back to fondant */
  finishes?: FinishKind[];
  /** cake color as hex, e.g. "#e8b4b8" */
  color?: string;
};

export type FinishKind = 'fondant' | 'ganache' | 'sponge';

export const FINISHES: { kind: FinishKind; label: string }[] = [
  { kind: 'fondant', label: 'Matte fondant' },
  { kind: 'ganache', label: 'Glossy ganache' },
  { kind: 'sponge', label: 'Plain sponge' },
];

export const DEFAULT_CAKE_COLOR = '#F2C6C2';

export const CAKE_SWATCHES = [
  '#F2C6C2',
  '#F3E7D3',
  '#F2D98D',
  '#E8B4B8',
  '#C97B5A',
  '#A8C6A0',
  '#8FA9B8',
  '#8A6B52',
];

export type TierSpec = {
  key: string;
  name: string;
  /** inches */
  size: number;
  servings: number;
};

export const TIER_SPECS: TierSpec[] = [
  { key: 'tier-10in', name: 'Cake tier 10in', size: 10, servings: 40 },
  { key: 'tier-8in', name: 'Cake tier 8in', size: 8, servings: 24 },
  { key: 'tier-6in', name: 'Cake tier 6in', size: 6, servings: 12 },
  { key: 'tier-4in', name: 'Cake tier 4in', size: 4, servings: 6 },
];

export const DECORATION_KINDS: { kind: DecorationKind; label: string; itemName: string }[] = [
  { kind: 'pearls', label: 'Pearls (x12)', itemName: 'Sugar pearls' },
  { kind: 'ribbon', label: 'Ribbon band', itemName: 'Ribbon band' },
  { kind: 'candle', label: 'Candle', itemName: 'Candle' },
  { kind: 'flower', label: 'Sugar flower', itemName: 'Sugar flower' },
  { kind: 'sign', label: 'Text sign', itemName: 'Text sign' },
  { kind: 'berries', label: 'Berries', itemName: 'Fresh berries' },
  { kind: 'macarons', label: 'Macarons', itemName: 'Macarons' },
  { kind: 'sprinkles', label: 'Sprinkles', itemName: 'Sprinkles' },
  { kind: 'leafSprig', label: 'Leaf sprig', itemName: 'Leaf sprig' },
  { kind: 'starTopper', label: 'Star topper', itemName: 'Star topper' },
  { kind: 'heartTopper', label: 'Heart topper', itemName: 'Heart topper' },
  { kind: 'textTopper', label: 'Text topper', itemName: 'Text topper' },
  { kind: 'goldFlakes', label: 'Gold flakes', itemName: 'Gold flakes' },
];

/** Max decorations placed on any single tier (the buildability rule). */
export const MAX_DECORATIONS_PER_TIER = 8;

export const TEXT_TOPPER_FONTS = [
  { key: 'slip', label: 'Handwritten', css: 'var(--font-slip, cursive)' },
  { key: 'display', label: 'Display', css: 'var(--font-display, serif)' },
  { key: 'mono', label: 'Typewriter', css: 'var(--font-mono, monospace)' },
] as const;

export const TEXT_TOPPER_MAX_CHARS = 24;

export function tierSpec(key: string): TierSpec {
  return TIER_SPECS.find((t) => t.key === key) ?? TIER_SPECS[3];
}

export function totalServings(tiers: string[]): number {
  return tiers.reduce((acc, k) => acc + tierSpec(k).servings, 0);
}

/** A ribbon band decorates one whole tier; pearls come in twelves. */
export function decorationUnits(kind: DecorationKind, placements: Decoration[]): number {
  const count = placements.filter((d) => d.kind === kind).length;
  if (kind === 'pearls') return Math.ceil(count / 12) * 12;
  if (kind === 'ribbon') return count;
  return count;
}

export type DesignLine = { item: DbItem; units: number };

/** Convert a design into order lines: one per tier, one per decoration type. */
export function designToLines(design: CakeDesign, items: DbItem[]): DesignLine[] {
  const byName = new Map(items.map((i) => [i.name, i]));
  const lines: DesignLine[] = [];

  for (const key of design.tiers) {
    const item = byName.get(tierSpec(key).name);
    if (item) lines.push({ item, units: 1 });
  }

  for (const { kind, itemName } of DECORATION_KINDS) {
    const units = decorationUnits(kind, design.decorations);
    if (units > 0) {
      const item = byName.get(itemName);
      if (item) lines.push({ item, units });
    }
  }

  return lines;
}

export function designPrice(lines: DesignLine[]): number {
  return lines.reduce((acc, l) => acc + l.item.price_per_unit * l.units, 0);
}

/** Pure placement math: resize a tier and decorations keep their relative spot. */
export function resizeTiers(design: CakeDesign, tierIndex: number, newKey: string): CakeDesign {
  const tiers = [...design.tiers];
  tiers[tierIndex] = newKey;
  return { ...design, tiers };
}

export function addTier(design: CakeDesign): CakeDesign {
  if (design.tiers.length >= 4) return design;
  const nextSmaller = TIER_SPECS[Math.min(TIER_SPECS.length - 1, design.tiers.length)];
  return { ...design, tiers: [...design.tiers, nextSmaller.key] };
}

export function removeTier(design: CakeDesign, tierIndex: number): CakeDesign {
  if (design.tiers.length <= 1) return design;
  return {
    ...design,
    tiers: design.tiers.filter((_, i) => i !== tierIndex),
    decorations: design.decorations
      .filter((d) => d.tier !== tierIndex)
      // reindex decorations that lived above the removed tier so they stay
      // attached to the tier they were placed on
      .map((d) => (d.tier > tierIndex ? { ...d, tier: d.tier - 1 } : d)),
  };
}

export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dt = new Date(y, m - 1, d);
  return `${names[dt.getDay()]} ${d}`;
}

// ---- scene geometry (shared with the canvas so logic tests can check it) ----

export const SCENE = { INCH: 0.14, TIER_HEIGHT: 0.9 } as const;

export function tierRadius(size: number): number {
  return (size * SCENE.INCH) / 2;
}

export function tierBaseY(tiers: string[], index: number): number {
  return index * SCENE.TIER_HEIGHT;
}

export function tierTopY(tiers: string[], index: number): number {
  return tierBaseY(tiers, index) + SCENE.TIER_HEIGHT;
}

/** Where a ribbon band wraps its tier: side radius, at a height on the side. */
export function ribbonAnchor(tiers: string[], index: number, heightT = 0.5): { y: number; radius: number } {
  return {
    y: tierBaseY(tiers, index) + SCENE.TIER_HEIGHT * heightT,
    radius: tierRadius(tierSpec(tiers[index]).size),
  };
}

/**
 * TIER-LOCAL placement helpers: a tier group is centered at the tier's
 * mid-height, so decorations are positioned relative to that center.
 */

/** Ribbon band center y in tier-local space for a height fraction (default 0.5). */
export function ribbonLocalY(heightT = 0.5): number {
  const t = Math.max(0, Math.min(1, heightT));
  return SCENE.TIER_HEIGHT * t - SCENE.TIER_HEIGHT / 2;
}

/** Full-ring ribbon band geometry in tier-local space. */
export function ribbonBandLocal(
  tiers: string[],
  index: number,
  heightT = 0.5
): { radius: number; height: number } {
  const anchor = ribbonAnchor(tiers, index, heightT);
  return {
    radius: anchor.radius * 1.005,
    height: SCENE.TIER_HEIGHT * 0.12,
  };
}

/** Top-face decorations (pearls, candle, flower, sign) sit just above the top. */
export function topDecorationLocalY(): number {
  return SCENE.TIER_HEIGHT / 2 + 0.02;
}

export function finishFor(design: CakeDesign, index: number): FinishKind {
  return design.finishes?.[index] ?? 'fondant';
}

export function setFinish(design: CakeDesign, index: number, finish: FinishKind): CakeDesign {
  const finishes = [...(design.finishes ?? design.tiers.map(() => 'fondant' as FinishKind))];
  finishes[index] = finish;
  return { ...design, finishes };
}

/** Mix two hex colors; t=0 returns a, t=1 returns b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const chan = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const mix = (i: number) => Math.round(chan(pa, i) * (1 - t) + chan(pb, i) * t);
  return `#${[0, 2, 4].map((i) => mix(i).toString(16).padStart(2, '0')).join('')}`;
}

// ---- order gate: a disabled button always has a plain reason ----

export type ConfirmGate = {
  date: string | null;
  hasCapacity: boolean;
  fits?: boolean;
};

export function confirmDisabledReason(g: ConfirmGate): string | null {
  if (!g.date) return 'Pick a date first';
  if (!g.hasCapacity) return 'Check this date first';
  if (!g.fits) return 'This date is full, try a suggested date';
  return null;
}

// ---- suggested date chips (fed by real check_capacity results) ----

export type FitChip = { date: string; traysLeft: number };

/** Pair candidate dates with capacity results, keep the first three that fit. */
export function selectFitChips(candidates: string[], results: (unknown | null)[]): FitChip[] {
  const chips: FitChip[] = [];
  for (let i = 0; i < candidates.length && chips.length < 3; i++) {
    const r = results[i] as { fits?: boolean; trays_left?: number } | null;
    if (r && typeof r === 'object' && r.fits === true) {
      chips.push({ date: candidates[i], traysLeft: Number(r.trays_left ?? 0) });
    }
  }
  return chips;
}

/** The next `count` pickup dates starting `minDaysAhead` days from `from`. */
export function upcomingDates(count: number, minDaysAhead = 2, from = new Date()): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(from.getFullYear(), from.getMonth(), from.getDate() + minDaysAhead + i);
    dates.push(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    );
  }
  return dates;
}
