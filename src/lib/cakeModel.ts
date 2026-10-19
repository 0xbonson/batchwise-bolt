// The studio design model: shapes, free sizes, cake types, decorations.

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
  /** tier (or cupcake / slab) index the decoration sits on */
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

export type FinishKind = 'fondant' | 'ganache' | 'sponge' | 'buttercream';

export const FINISHES: { kind: FinishKind; label: string }[] = [
  { kind: 'fondant', label: 'Matte fondant' },
  { kind: 'ganache', label: 'Glossy ganache' },
  { kind: 'buttercream', label: 'Buttercream' },
  { kind: 'sponge', label: 'Plain sponge' },
];

export type FrostingStyle = 'smooth' | 'textured' | 'striped' | 'rustic' | 'ruffles' | 'drip';

export const FROSTING_STYLES: { kind: FrostingStyle; label: string }[] = [
  { kind: 'smooth', label: 'Smooth' },
  { kind: 'textured', label: 'Textured ridges' },
  { kind: 'rustic', label: 'Rustic swipe' },
  { kind: 'ruffles', label: 'Ruffles' },
  { kind: 'drip', label: 'Drip' },
];

/** Metallic accent finish for the board and toppers. */
export type MetallicKind = 'none' | 'gold' | 'silver' | 'roseGold';

export const METALLICS: { kind: MetallicKind; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'gold', label: 'Gold' },
  { kind: 'silver', label: 'Silver' },
  { kind: 'roseGold', label: 'Rose gold' },
];

export const METALLIC_COLORS: Record<Exclude<MetallicKind, 'none'>, string> = {
  gold: '#C9A227',
  silver: '#C9CDD6',
  roseGold: '#B76E79',
};

export type TierShape = 'round' | 'square' | 'rectangle' | 'heart' | 'hexagon';

export const SHAPE_LABELS: { kind: TierShape; label: string }[] = [
  { kind: 'round', label: 'Round' },
  { kind: 'square', label: 'Square' },
  { kind: 'rectangle', label: 'Rectangle' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'heart', label: 'Heart' },
];

export type CakeType = 'tiered' | 'sheet' | 'cupcakes';

export const CAKE_TYPES: { kind: CakeType; label: string; hint: string }[] = [
  { kind: 'tiered', label: 'Tiered', hint: '1-4 stacked tiers, offsets allowed' },
  { kind: 'sheet', label: 'Sheet', hint: 'one or two rectangular slabs' },
  { kind: 'cupcakes', label: 'Cupcakes', hint: '6, 12 or 24 on a board or tower' },
];

export type CakeTier = {
  shape: TierShape;
  /** diameter for round and hexagon, side length for square */
  widthCm: number;
  /** rectangle depth (second side); set from the shape for others */
  depthCm: number;
  heightCm: number;
  /** 2 to 6 sponge layers */
  layers: number;
  finish: FinishKind;
  spongeColor: string;
  fillingColor: string;
  frostingColor: string;
  frostingStyle: FrostingStyle;
  /** horizontal offset from the stack center, cm; 0 = centered */
  offsetXCm: number;
  /** depth offset from the stack center, cm; 0 = centered */
  offsetZCm: number;
  /** naked style: exposed sponge and filling bands instead of full frosting */
  naked?: boolean;
};

export type CupcakeLayout = 'board' | 'tower';

export type CupcakeFrostingStyle = 'swirl' | 'flat' | 'ruffle';

export const CUPCAKE_FROSTING_STYLES: { kind: CupcakeFrostingStyle; label: string }[] = [
  { kind: 'swirl', label: 'Swirl' },
  { kind: 'flat', label: 'Flat' },
  { kind: 'ruffle', label: 'Ruffle' },
];

export type CupcakeTopper = 'none' | 'candle' | 'starTopper' | 'heartTopper' | 'flower' | 'berries';

export const CUPCAKE_TOPPERS: { kind: CupcakeTopper; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'candle', label: 'Candle' },
  { kind: 'starTopper', label: 'Star' },
  { kind: 'heartTopper', label: 'Heart' },
  { kind: 'flower', label: 'Sugar flower' },
  { kind: 'berries', label: 'Berries' },
];

export const DEFAULT_LINER_COLOR = '#D9A441';

export type StudioDesign = {
  type: CakeType;
  /** tiers, bottom to top; for cupcakes one entry per cupcake */
  tiers: CakeTier[];
  decorations: Decoration[];
  /** cupcakes only: board grid or stacked tower */
  cupcakeLayout?: CupcakeLayout;
  /** metallic accent on the board and toppers */
  metallic?: MetallicKind;
  /** cupcakes only: frosting style shown on each cupcake */
  cupcakeFrostingStyle?: CupcakeFrostingStyle;
  /** cupcakes only: liner color */
  cupcakeLinerColor?: string;
  /** cupcakes only: one topper kind applied to every cupcake */
  cupcakeTopper?: CupcakeTopper;
};

export const LIMITS = {
  round: { min: 10, max: 50 },
  hexagon: { min: 10, max: 50 },
  square: { min: 10, max: 50 },
  rectangle: { widthMin: 15, widthMax: 60, depthMin: 10, depthMax: 40 },
  heart: { min: 15, max: 40 },
  heightMin: 4,
  heightMax: 20,
  layersMin: 2,
  layersMax: 6,
  tiersMin: 1,
  tiersMax: 4,
  sheetSlabsMax: 2,
  cupcakeCounts: [6, 12, 24],
} as const;

export const DEFAULT_SPONGE_COLOR = '#F3E7D3';
export const DEFAULT_FILLING_COLOR = '#B4672B';
export const DEFAULT_FROSTING_COLOR = '#F2C6C2';

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

export const DECORATION_KINDS: { kind: DecorationKind; label: string }[] = [
  { kind: 'pearls', label: 'Pearls (x12)' },
  { kind: 'ribbon', label: 'Ribbon band' },
  { kind: 'candle', label: 'Candle' },
  { kind: 'flower', label: 'Sugar flower' },
  { kind: 'sign', label: 'Text sign' },
  { kind: 'berries', label: 'Berries' },
  { kind: 'macarons', label: 'Macarons' },
  { kind: 'sprinkles', label: 'Sprinkles' },
  { kind: 'leafSprig', label: 'Leaf sprig' },
  { kind: 'starTopper', label: 'Star topper' },
  { kind: 'heartTopper', label: 'Heart topper' },
  { kind: 'textTopper', label: 'Text topper' },
  { kind: 'goldFlakes', label: 'Gold flakes' },
];

/** Max decorations placed on any single tier (the buildability rule). */
export const MAX_DECORATIONS_PER_TIER = 8;

/** Decoration kinds heavy enough that they should not overhang an edge. */
export const HEAVY_DECORATIONS: DecorationKind[] = [
  'flower',
  'sign',
  'starTopper',
  'heartTopper',
  'textTopper',
];

export const TEXT_TOPPER_FONTS = [
  { key: 'slip', label: 'Handwritten', css: 'var(--font-slip, cursive)' },
  { key: 'display', label: 'Display', css: 'var(--font-display, serif)' },
  { key: 'mono', label: 'Typewriter', css: 'var(--font-mono, monospace)' },
] as const;

export const TEXT_TOPPER_MAX_CHARS = 24;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function widthRange(shape: TierShape): { min: number; max: number } {
  switch (shape) {
    case 'round':
    case 'hexagon':
    case 'square':
      return LIMITS[shape];
    case 'rectangle':
      return { min: LIMITS.rectangle.widthMin, max: LIMITS.rectangle.widthMax };
    case 'heart':
      return LIMITS.heart;
  }
}

export function depthRange(shape: TierShape): { min: number; max: number } {
  if (shape === 'rectangle') {
    return { min: LIMITS.rectangle.depthMin, max: LIMITS.rectangle.depthMax };
  }
  return widthRange(shape);
}

export function clampTier(t: CakeTier): CakeTier {
  const w = widthRange(t.shape);
  const d = depthRange(t.shape);
  return {
    ...t,
    widthCm: clamp(t.widthCm, w.min, w.max),
    depthCm: clamp(t.depthCm, d.min, d.max),
    heightCm: clamp(t.heightCm, LIMITS.heightMin, LIMITS.heightMax),
    layers: clamp(Math.round(t.layers), LIMITS.layersMin, LIMITS.layersMax),
    offsetXCm: clamp(t.offsetXCm, -w.max, w.max),
    offsetZCm: clamp(t.offsetZCm, -d.max, d.max),
  };
}

export function isTierWithinLimits(t: CakeTier): boolean {
  const w = widthRange(t.shape);
  const d = depthRange(t.shape);
  return (
    t.widthCm >= w.min &&
    t.widthCm <= w.max &&
    t.depthCm >= d.min &&
    t.depthCm <= d.max &&
    t.heightCm >= LIMITS.heightMin &&
    t.heightCm <= LIMITS.heightMax &&
    t.layers >= LIMITS.layersMin &&
    t.layers <= LIMITS.layersMax
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function safeHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_RE.test(value) ? value.toLowerCase() : fallback;
}

/** Make a tier from partial input, defaulting offsets to centered. */
export function makeTier(partial: Partial<CakeTier> = {}): CakeTier {
  return clampTier({
    shape: partial.shape ?? 'round',
    widthCm: partial.widthCm ?? 20,
    depthCm: partial.depthCm ?? partial.widthCm ?? 20,
    heightCm: partial.heightCm ?? 10,
    layers: partial.layers ?? 2,
    finish: partial.finish ?? 'fondant',
    spongeColor: safeHex(partial.spongeColor, DEFAULT_SPONGE_COLOR),
    fillingColor: safeHex(partial.fillingColor, DEFAULT_FILLING_COLOR),
    frostingColor: safeHex(partial.frostingColor, DEFAULT_FROSTING_COLOR),
    frostingStyle: partial.frostingStyle ?? 'smooth',
    offsetXCm: partial.offsetXCm ?? 0,
    offsetZCm: partial.offsetZCm ?? 0,
    naked: partial.naked ?? false,
  });
}

/** A new tiered cake: three shrinking round tiers, all centered. */
export function defaultDesign(): StudioDesign {
  return {
    type: 'tiered',
    tiers: [
      makeTier({ widthCm: 30, heightCm: 12 }),
      makeTier({ widthCm: 22, heightCm: 10 }),
      makeTier({ widthCm: 14, heightCm: 8 }),
    ],
    decorations: [],
  };
}

/** A sheet cake: one or two 30x40 slabs. */
export function sheetDesign(slabs = 1): StudioDesign {
  const slab = () =>
    makeTier({ shape: 'rectangle', widthCm: 30, depthCm: 40, heightCm: 8, layers: 2 });
  return {
    type: 'sheet',
    tiers: Array.from({ length: clamp(slabs, 1, LIMITS.sheetSlabsMax) }, slab),
    decorations: [],
  };
}

/** Cupcakes: one entry per cupcake, each a small round tier. All identical. */
export function cupcakeDesign(count = 12, layout: CupcakeLayout = 'board'): StudioDesign {
  const n = Math.max(1, Math.min(48, Math.round(count)));
  const cup = (): CakeTier =>
    makeTier({
      shape: 'round',
      widthCm: 6.5,
      heightCm: 7,
      layers: 2,
      finish: 'fondant',
      frostingStyle: 'textured',
    });
  return {
    type: 'cupcakes',
    tiers: Array.from({ length: n }, cup),
    cupcakeLayout: layout,
    decorations: [],
    cupcakeFrostingStyle: 'swirl',
    cupcakeLinerColor: DEFAULT_LINER_COLOR,
    cupcakeTopper: 'none',
  };
}

/** Starting design per cake type. */
export function designForType(type: CakeType): StudioDesign {
  if (type === 'sheet') return sheetDesign(1);
  if (type === 'cupcakes') return cupcakeDesign(12);
  return defaultDesign();
}

/** Axis-aligned footprint box of a tier in cm, offsets included. */
export function tierBBox(t: CakeTier): { cx: number; cz: number; w: number; d: number } {
  return { cx: t.offsetXCm, cz: t.offsetZCm, w: t.widthCm, d: t.depthCm };
}

/** Overlap area of two axis-aligned boxes in cm2 (0 when apart). */
export function bboxOverlapArea(
  a: { cx: number; cz: number; w: number; d: number },
  b: { cx: number; cz: number; w: number; d: number }
): number {
  const ox = Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2);
  const oz = Math.min(a.cz + a.d / 2, b.cz + b.d / 2) - Math.max(a.cz - a.d / 2, b.cz - b.d / 2);
  return Math.max(0, ox) * Math.max(0, oz);
}

/**
 * Migrate a legacy design (size-key tiers, one global color, per-tier
 * finishes) into the new model. Legacy inch sizes map to cm via 2.54, clamped
 * into the new limits. The legacy `date` field is dropped: the studio no
 * longer takes orders. Unknown shapes fall back to round.
 */
export function migrateLegacyDesign(legacy: {
  tiers: string[];
  decorations: Decoration[];
  date?: string | null;
  finishes?: FinishKind[];
  color?: string;
}): StudioDesign {
  const INCH_TO_CM = 2.54;
  const LEGACY_SIZE_CM: Record<string, number> = {
    'tier-10in': 25.4,
    'tier-8in': 20.32,
    'tier-6in': 15.24,
    'tier-4in': 10.16,
  };

  const finishes: FinishKind[] = legacy.finishes ?? [];
  const tiers = legacy.tiers.map((key, i) => {
    const cm = LEGACY_SIZE_CM[key] ?? (Number(key) || 8) * INCH_TO_CM;
    return makeTier({
      widthCm: cm,
      heightCm: 10,
      layers: 2,
      finish: finishes[i] ?? 'fondant',
      frostingColor: safeHex(legacy.color, DEFAULT_FROSTING_COLOR),
      frostingStyle: 'smooth',
    });
  });

  return {
    type: 'tiered',
    tiers: tiers.length > 0 ? tiers : defaultDesign().tiers,
    decorations: legacy.decorations,
  };
}
