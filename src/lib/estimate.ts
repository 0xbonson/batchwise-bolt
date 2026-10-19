import type { CakeTier, StudioDesign } from '@/lib/cakeModel';

// ---- estimator settings ----

export type EstimateSettings = {
  /** cm2 of cake per serving */
  portionAreaCm2: number;
  /** price per serving by tier finish */
  pricePerServing: { fondant: number; ganache: number; sponge: number };
  /** price per decoration kind */
  pricePerDecoration: Record<string, number>;
  /** usable area of one oven tray */
  trayAreaCm2: number;
  /** base prep minutes plus per tier, per layer, per decoration */
  prepMinutesBase: number;
  prepMinutesPerTier: number;
  prepMinutesPerLayer: number;
  prepMinutesPerDecoration: number;
  /** surcharge per frosting style, added per serving */
  frostingSurcharge: { smooth: number; rustic: number; textured: number; striped: number; ruffle: number; drip: number };
  /** currency symbol shown with prices */
  currencySymbol: string;
};

const SETTINGS_KEY = 'batchwise.baker-settings.v1';

export const DEFAULT_SETTINGS: EstimateSettings = {
  portionAreaCm2: 25,
  pricePerServing: { fondant: 1.2, ganache: 1.5, sponge: 1 },
  pricePerDecoration: {
    pearls: 6,
    ribbon: 4,
    candle: 1,
    flower: 6,
    sign: 5,
    berries: 7,
    macarons: 7,
    sprinkles: 3,
    leafSprig: 4,
    starTopper: 8,
    heartTopper: 8,
    textTopper: 8,
    goldFlakes: 12,
  },
  trayAreaCm2: 1200,
  prepMinutesBase: 30,
  prepMinutesPerTier: 8,
  prepMinutesPerLayer: 4,
  prepMinutesPerDecoration: 2,
  frostingSurcharge: { smooth: 0, rustic: 0.1, textured: 0.15, striped: 0.25, ruffle: 0.2, drip: 0.2 },
  currencySymbol: '$',
};

export type EstimateResult = {
  servings: number;
  price: number;
  trays: number;
  prepMinutes: number;
};

/** Footprint area (cm2) of a tier, by shape. */
function tierFootprintCm2(t: CakeTier): number {
  switch (t.shape) {
    case 'round':
      return Math.PI * (t.widthCm / 2) ** 2;
    case 'hexagon':
      // regular hexagon: (3*sqrt(3)/2) * s^2, where widthCm is the side length
      return (3 * Math.sqrt(3) / 2) * t.widthCm ** 2;
    case 'square':
      return t.widthCm * t.depthCm;
    case 'rectangle':
      return t.widthCm * t.depthCm;
    case 'heart':
      // approx: footprint as a square of the width, minus 20% for the dip
      return 0.8 * t.widthCm * t.depthCm;
  }
}

function finishMultiplier(finish: CakeTier['finish']): number {
  if (finish === 'fondant') return 1;
  if (finish === 'ganache') return 1.15;
  if (finish === 'buttercream') return 1.05;
  return 1;
}

function frostingSurchargeFor(style: CakeTier['frostingStyle'], settings: EstimateSettings): number {
  switch (style) {
    case 'smooth':
      return settings.frostingSurcharge.smooth;
    case 'rustic':
      return settings.frostingSurcharge.rustic;
    case 'textured':
      return settings.frostingSurcharge.textured;
    case 'striped':
      return settings.frostingSurcharge.striped;
    case 'ruffles':
      return settings.frostingSurcharge.ruffle;
    case 'drip':
      return settings.frostingSurcharge.drip;
  }
}

export function estimate(design: StudioDesign, settings: EstimateSettings): EstimateResult {
  const portionArea = settings.portionAreaCm2 > 0 ? settings.portionAreaCm2 : 25;

  let servings = 0;
  let trayArea = 0;
  let prep = settings.prepMinutesBase;
  let price = 0;

  if (design.type === 'cupcakes') {
    const quantity = design.tiers.length;
    servings = quantity;
    const perServing =
      settings.pricePerServing.fondant + frostingSurchargeFor('textured', settings);
    price = servings * perServing;
    if (design.cupcakeTopper && design.cupcakeTopper !== 'none') {
      price += servings * (settings.pricePerDecoration[design.cupcakeTopper] ?? 0);
    }
    prep +=
      settings.prepMinutesPerTier + settings.prepMinutesPerLayer * (design.tiers[0]?.layers ?? 2);
    const trays = Math.max(1, Math.ceil(quantity / 12));
    return { servings, price, trays, prepMinutes: prep };
  }

  for (const tier of design.tiers) {
    const area = tierFootprintCm2(tier);
    const tierServings = Math.max(1, Math.floor(area / portionArea));
    servings += tierServings;

    trayArea += area;
    prep += settings.prepMinutesPerTier + settings.prepMinutesPerLayer * tier.layers;

    const perServing =
      (tier.finish === 'sponge'
        ? settings.pricePerServing.sponge
        : tier.finish === 'ganache'
          ? settings.pricePerServing.ganache
          : settings.pricePerServing.fondant) + frostingSurchargeFor(tier.frostingStyle, settings);
    price += tierServings * perServing * finishMultiplier(tier.finish);
  }

  for (const d of design.decorations) {
    prep += settings.prepMinutesPerDecoration;
    price += settings.pricePerDecoration[d.kind] ?? 0;
  }

  const trays = settings.trayAreaCm2 > 0 ? Math.max(1, Math.ceil(trayArea / settings.trayAreaCm2)) : 1;

  return {
    servings,
    price,
    trays,
    prepMinutes: prep,
  };
}

export function normalizeSettings(input: EstimateSettings): EstimateSettings {
  const clampPositive = (v: number, fallback: number) => (Number.isFinite(v) && v >= 0 ? v : fallback);
  return {
    portionAreaCm2: clampPositive(input.portionAreaCm2, DEFAULT_SETTINGS.portionAreaCm2),
    pricePerServing: {
      fondant: clampPositive(input.pricePerServing.fondant, DEFAULT_SETTINGS.pricePerServing.fondant),
      ganache: clampPositive(input.pricePerServing.ganache, DEFAULT_SETTINGS.pricePerServing.ganache),
      sponge: clampPositive(input.pricePerServing.sponge, DEFAULT_SETTINGS.pricePerServing.sponge),
    },
    pricePerDecoration: { ...DEFAULT_SETTINGS.pricePerDecoration, ...input.pricePerDecoration },
    trayAreaCm2: clampPositive(input.trayAreaCm2, DEFAULT_SETTINGS.trayAreaCm2),
    prepMinutesBase: clampPositive(input.prepMinutesBase, DEFAULT_SETTINGS.prepMinutesBase),
    prepMinutesPerTier: clampPositive(input.prepMinutesPerTier, DEFAULT_SETTINGS.prepMinutesPerTier),
    prepMinutesPerLayer: clampPositive(input.prepMinutesPerLayer, DEFAULT_SETTINGS.prepMinutesPerLayer),
    prepMinutesPerDecoration: clampPositive(input.prepMinutesPerDecoration, DEFAULT_SETTINGS.prepMinutesPerDecoration),
    frostingSurcharge: {
      smooth: clampPositive(input.frostingSurcharge.smooth, DEFAULT_SETTINGS.frostingSurcharge.smooth),
      rustic: clampPositive(input.frostingSurcharge.rustic, DEFAULT_SETTINGS.frostingSurcharge.rustic),
      textured: clampPositive(input.frostingSurcharge.textured, DEFAULT_SETTINGS.frostingSurcharge.textured),
      striped: clampPositive(input.frostingSurcharge.striped, DEFAULT_SETTINGS.frostingSurcharge.striped),
      ruffle: clampPositive(input.frostingSurcharge.ruffle, DEFAULT_SETTINGS.frostingSurcharge.ruffle),
      drip: clampPositive(input.frostingSurcharge.drip, DEFAULT_SETTINGS.frostingSurcharge.drip),
    },
    currencySymbol: typeof input.currencySymbol === 'string' && input.currencySymbol.length > 0
      ? input.currencySymbol.slice(0, 3)
      : DEFAULT_SETTINGS.currencySymbol,
  };
}

export function loadSettings(): EstimateSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EstimateSettings>;
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: EstimateSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function fmtMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}
