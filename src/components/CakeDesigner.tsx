import { useEffect, useMemo, useRef, useState } from 'react';
import { CakeCanvas } from '@/components/CakeCanvas';
import { SlipRule } from '@/components/Slip';
import {
  CAKE_SWATCHES,
  CAKE_TYPES,
  CUPCAKE_FROSTING_STYLES,
  CUPCAKE_TOPPERS,
  DECORATION_KINDS,
  DEFAULT_LINER_COLOR,
  FINISHES,
  LIMITS,
  MAX_DECORATIONS_PER_TIER,
  SHAPE_LABELS,
  TEXT_TOPPER_FONTS,
  TEXT_TOPPER_MAX_CHARS,
  clampTier,
  cupcakeDesign,
  designForType,
  makeTier,
  sheetDesign,
  widthRange,
  type CakeTier,
  type CupcakeFrostingStyle,
  type CupcakeLayout,
  type CupcakeTopper,
  type Decoration,
  type DecorationKind,
  type FinishKind,
  type StudioDesign,
} from '@/lib/cakeModel';
import {
  DEFAULT_THRESHOLDS,
  checkBuildability,
  moveDecorationInward,
  type BuildCheck,
  type BuildThresholds,
} from '@/lib/buildability';
import {
  DEFAULT_SETTINGS,
  estimate,
  loadSettings,
  normalizeSettings,
  saveSettings,
  type EstimateSettings,
} from '@/lib/estimate';

function newId(): string {
  return crypto.randomUUID();
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function DecorationPreview({ kind }: { kind: DecorationKind }) {
  const stroke = 'var(--ink)';
  switch (kind) {
    case 'pearls':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <circle cx="5" cy="9" r="2.4" fill="none" stroke={stroke} strokeWidth="1.5" />
          <circle cx="13" cy="9" r="2.4" fill="none" stroke={stroke} strokeWidth="1.5" />
          <circle cx="21" cy="9" r="2.4" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'ribbon':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <rect x="4" y="4" width="18" height="10" rx="3" fill="none" stroke={stroke} strokeWidth="1.5" />
          <line x1="4" y1="9" x2="22" y2="9" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'candle':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <line x1="13" y1="16" x2="13" y2="6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M13 2c1.4 1.6 1.4 3-0 4-1.4-1-1.4-2.4 0-4z" fill={stroke} />
        </svg>
      );
    case 'flower':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <ellipse key={deg} cx="13" cy="5.5" rx="2" ry="3.2" fill="none" stroke={stroke} strokeWidth="1.3" transform={`rotate(${deg} 13 9)`} />
          ))}
          <circle cx="13" cy="9" r="1.4" fill={stroke} />
        </svg>
      );
    case 'sign':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <rect x="4" y="3" width="18" height="9" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.5" />
          <line x1="7" y1="6.5" x2="19" y2="6.5" stroke={stroke} strokeWidth="1" />
          <line x1="7" y1="9" x2="15" y2="9" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    case 'berries':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <circle cx="9" cy="9" r="3" fill="none" stroke={stroke} strokeWidth="1.5" />
          <circle cx="17" cy="11" r="2.4" fill="none" stroke={stroke} strokeWidth="1.5" />
          <circle cx="16" cy="5.5" r="2" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'macarons':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <ellipse cx="9" cy="9" rx="4" ry="3" fill="none" stroke={stroke} strokeWidth="1.5" />
          <ellipse cx="17" cy="10" rx="3.4" ry="2.6" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'sprinkles':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          {[[6, 5, 30], [12, 9, 80], [19, 6, 45], [8, 12, 70], [16, 13, 20], [22, 10, 60]].map(([x, y, r], i) => (
            <line key={i} x1={x - 1.5} y1={y} x2={x + 1.5} y2={y} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${r} ${x} ${y})`} />
          ))}
        </svg>
      );
    case 'leafSprig':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <line x1="5" y1="15" x2="21" y2="4" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
          {[[9, 11], [13, 8], [17, 5]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="2.4" ry="1.1" fill="none" stroke={stroke} strokeWidth="1.2" transform={`rotate(-40 ${x} ${y})`} />
          ))}
        </svg>
      );
    case 'starTopper':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <path d="M13 2l1.8 4 4.2.4-3.2 2.9 1 4.2-3.8-2.3-3.8 2.3 1-4.2L7 6.4l4.2-.4z" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'heartTopper':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <path d="M13 15c-5-3.6-8-6.4-8-9.4C5 3 6.8 1.6 8.8 1.6c1.7 0 3.2.9 4.2 2.4 1-1.5 2.5-2.4 4.2-2.4 2 0 3.8 1.4 3.8 4 0 3-3 5.8-8 9.4z" fill="none" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case 'textTopper':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <line x1="13" y1="16" x2="13" y2="10" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="5" y="4" width="16" height="6" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.4" />
          <line x1="8" y1="7" x2="18" y2="7" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    case 'goldFlakes':
      return (
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          {[[7, 6, 20], [14, 9, 60], [19, 5, 40], [10, 12, 80], [17, 13, 10]].map(([x, y, r], i) => (
            <ellipse key={i} cx={x} cy={y} rx="2" ry="1" fill="none" stroke={stroke} strokeWidth="1.2" transform={`rotate(${r} ${x} ${y})`} />
          ))}
        </svg>
      );
  }
}

export function CakeDesigner() {
  const [design, setDesign] = useState<StudioDesign>(() => designForType('tiered'));
  const [placingKind, setPlacingKind] = useState<DecorationKind | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [thresholds, setThresholds] = useState<BuildThresholds>(DEFAULT_THRESHOLDS);
  const [settings, setSettings] = useState<EstimateSettings>(() => loadSettings());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const est = useMemo(() => estimate(design, settings), [design, settings]);
  const build = useMemo<BuildCheck>(
    () => checkBuildability(design, thresholds),
    [design, thresholds]
  );

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const place = (tier: number, angle: number, radius: number, heightT: number | null) => {
    if (!placingKind) return;
    const tierCount = design.decorations.filter((d) => d.tier === tier).length;
    if (tierCount >= MAX_DECORATIONS_PER_TIER) return;
    const d: Decoration = {
      id: newId(),
      kind: placingKind,
      tier,
      angle,
      radius,
      ...(placingKind === 'ribbon' && heightT !== null ? { heightT } : {}),
      ...(placingKind === 'flower' ? { variant: 'rose' } : {}),
    };
    setDesign((prev) => ({ ...prev, decorations: [...prev.decorations, d] }));
    setSelectedId(d.id);
    setPlacingKind(null);
  };

  const selected = design.decorations.find((x) => x.id === selectedId) ?? null;

  const nudge = (dAngle: number, dRadius: number) => {
    if (!selected) return;
    setDesign((prev) => ({
      ...prev,
      decorations: prev.decorations.map((x) =>
        x.id === selected.id
          ? {
              ...x,
              angle: x.angle + dAngle,
              radius: Math.max(0.05, Math.min(1, x.radius + dRadius)),
            }
          : x
      ),
    }));
  };

  const updateSelected = (patch: Partial<Decoration>) => {
    if (!selected) return;
    setDesign((prev) => ({
      ...prev,
      decorations: prev.decorations.map((x) => (x.id === selected.id ? { ...x, ...patch } : x)),
    }));
  };

  const deleteSelected = () => {
    if (!selected) return;
    setDesign((prev) => ({
      ...prev,
      decorations: prev.decorations.filter((x) => x.id !== selected.id),
    }));
    setSelectedId(null);
  };

  const updateTier = (i: number, patch: Partial<CakeTier>) => {
    setDesign((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t, j) => (j === i ? clampTier({ ...t, ...patch }) : t)),
    }));
  };

  const addTier = () => {
    setDesign((prev) => {
      if (prev.type !== 'tiered' || prev.tiers.length >= LIMITS.tiersMax) return prev;
      const top = prev.tiers[prev.tiers.length - 1];
      const next = makeTier({
        shape: top.shape,
        widthCm: Math.max(widthRange(top.shape).min, top.widthCm - 8),
        heightCm: 8,
      });
      return { ...prev, tiers: [...prev.tiers, next] };
    });
  };

  const removeTier = (i: number) => {
    setDesign((prev) => {
      if (prev.type !== 'tiered' || prev.tiers.length <= LIMITS.tiersMin) return prev;
      return {
        ...prev,
        tiers: prev.tiers.filter((_, j) => j !== i),
        decorations: prev.decorations
          .filter((x) => x.tier !== i)
          .map((x) => (x.tier > i ? { ...x, tier: x.tier - 1 } : x)),
      };
    });
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `cake-design-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  const applyFix = (id: string) => {
    const fix = build.fixes[id];
    if (!fix) return;
    setDesign(fix());
    setSelectedId(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
      <div>
        <div className="overflow-hidden rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--flour)]">
          <div className="aspect-square w-full sm:aspect-auto sm:h-[560px]">
            <CakeCanvas
              design={design}
              placingKind={placingKind}
              onPlace={place}
              selectedId={selectedId}
              onSelect={setSelectedId}
              canvasRef={canvasRef}
            />
          </div>
        </div>
        <p className="mt-2 font-slip text-xs opacity-60" role="status" aria-live="polite">
          {placingKind
            ? 'Click the cake to place it.'
            : selected
              ? 'Nudge with the arrows, or delete it.'
              : 'Pick a decoration, then click the cake. Drag to orbit.'}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DECORATION_KINDS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={placingKind === kind}
              aria-label={`${label} — click the cake to place`}
              onClick={() => {
                setPlacingKind(kind === placingKind ? null : kind);
                setSelectedId(null);
              }}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-lg border px-3 font-slip text-sm transition-colors ${
                placingKind === kind
                  ? 'border-[color:var(--teal)] bg-[color:var(--teal)] text-white'
                  : 'border-[color:var(--ink)]/30 bg-[color:var(--slip)] text-[color:var(--ink)] hover:bg-[color:var(--flour)]'
              }`}
            >
              <DecorationPreview kind={kind} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--ink)]/20 bg-[color:var(--slip)] p-3">
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Nudge decoration">
              <span />
              <button type="button" onClick={() => nudge(0, -0.08)} className="min-h-[48px] min-w-[48px] rounded border border-[color:var(--ink)]/30 font-slip text-[color:var(--ink)]" aria-label="Move decoration toward the center">↑</button>
              <span />
              <button type="button" onClick={() => nudge(-0.25, 0)} className="min-h-[48px] min-w-[48px] rounded border border-[color:var(--ink)]/30 font-slip text-[color:var(--ink)]" aria-label="Rotate decoration left">←</button>
              <button type="button" onClick={deleteSelected} className="min-h-[48px] min-w-[48px] rounded border border-[color:var(--tomato)]/50 font-slip text-[color:var(--tomato)]" aria-label="Delete decoration">✕</button>
              <button type="button" onClick={() => nudge(0.25, 0)} className="min-h-[48px] min-w-[48px] rounded border border-[color:var(--ink)]/30 font-slip text-[color:var(--ink)]" aria-label="Rotate decoration right">→</button>
              <span />
              <button type="button" onClick={() => nudge(0, 0.08)} className="min-h-[48px] min-w-[48px] rounded border border-[color:var(--ink)]/30 font-slip text-[color:var(--ink)]" aria-label="Move decoration toward the edge">↓</button>
              <span />
            </div>
            {selected.kind === 'textTopper' && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={selected.text ?? ''}
                  maxLength={TEXT_TOPPER_MAX_CHARS}
                  placeholder="Type up to 24 characters"
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  aria-label="Text topper text"
                  className="min-h-[48px] w-40 rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                />
                <select
                  value={selected.font ?? 'slip'}
                  onChange={(e) => updateSelected({ font: e.target.value })}
                  aria-label="Text topper font"
                  className="min-h-[48px] rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                >
                  {TEXT_TOPPER_FONTS.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}
            {selected.kind === 'flower' && (
              <select
                value={selected.variant ?? 'rose'}
                onChange={(e) => updateSelected({ variant: e.target.value })}
                aria-label="Flower style"
                className="min-h-[48px] rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
              >
                <option value="rose">Rose</option>
                <option value="daisy">Daisy</option>
              </select>
            )}
            {selected.kind !== 'ribbon' && (
              <button
                type="button"
                onClick={() => {
                  setDesign((prev) => ({
                    ...prev,
                    decorations: prev.decorations.map((x) =>
                      x.id === selected.id ? moveDecorationInwardDesign(x) : x
                    ),
                  }));
                }}
                className="min-h-[48px] rounded border border-[color:var(--ink)]/30 font-slip text-xs text-[color:var(--ink)]"
              >
                Move inward
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--slip)] p-4 font-slip text-sm">
          <div className="font-medium">Cake type</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Cake type">
            {CAKE_TYPES.map(({ kind, label, hint }) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={design.type === kind}
                title={hint}
                onClick={() => setDesign(designForType(kind))}
                className={`min-h-[48px] rounded-lg border px-2 font-slip text-sm transition-colors ${
                  design.type === kind
                    ? 'border-[color:var(--teal)] bg-[color:var(--teal)] text-white'
                    : 'border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)] hover:bg-[color:var(--flour)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <SlipRule />
          {design.type !== 'cupcakes' && (
            <>
          <div className="font-medium">Tiers</div>
          <div className="mt-2 space-y-2">
            {design.tiers.map((tier, i) => (
              <details key={i} className="rounded-lg border border-[color:var(--ink)]/20 bg-white p-2">
                <summary className="cursor-pointer font-slip text-sm">
                  Tier {i + 1}: {tier.shape}, {tier.widthCm} by {tier.depthCm} cm
                </summary>
                <div className="mt-2 space-y-2">
                  <select
                    value={tier.shape}
                    onChange={(e) => updateTier(i, { shape: e.target.value as CakeTier['shape'] })}
                    aria-label={`Tier ${i + 1} shape`}
                    className="min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                  >
                    {SHAPE_LABELS.map((s) => (
                      <option key={s.kind} value={s.kind}>{s.label}</option>
                    ))}
                  </select>
                  <div>
                    <label className="text-xs opacity-70" htmlFor={`w-${i}`}>Width (cm)</label>
                    <input
                      id={`w-${i}`}
                      type="number"
                      value={tier.widthCm}
                      min={widthRange(tier.shape).min}
                      max={widthRange(tier.shape).max}
                      onChange={(e) => updateTier(i, { widthCm: Number(e.target.value) })}
                      className="min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                    />
                    <input
                      type="range"
                      min={widthRange(tier.shape).min}
                      max={widthRange(tier.shape).max}
                      value={tier.widthCm}
                      onChange={(e) => updateTier(i, { widthCm: Number(e.target.value) })}
                      aria-label={`Tier ${i + 1} width slider`}
                      className="w-full"
                    />
                  </div>
                  {tier.shape === 'rectangle' && (
                    <div>
                      <label className="text-xs opacity-70" htmlFor={`d-${i}`}>Depth (cm)</label>
                      <input
                        id={`d-${i}`}
                        type="number"
                        value={tier.depthCm}
                        min={LIMITS.rectangle.depthMin}
                        max={LIMITS.rectangle.depthMax}
                        onChange={(e) => updateTier(i, { depthCm: Number(e.target.value) })}
                        className="min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs opacity-70" htmlFor={`h-${i}`}>Height (cm)</label>
                    <input
                      id={`h-${i}`}
                      type="number"
                      value={tier.heightCm}
                      min={LIMITS.heightMin}
                      max={LIMITS.heightMax}
                      onChange={(e) => updateTier(i, { heightCm: Number(e.target.value) })}
                      className="min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs opacity-70" htmlFor={`l-${i}`}>
                      Sponge layers ({LIMITS.layersMin}-{LIMITS.layersMax})
                    </label>
                    <input
                      id={`l-${i}`}
                      type="number"
                      value={tier.layers}
                      min={LIMITS.layersMin}
                      max={LIMITS.layersMax}
                      onChange={(e) => updateTier(i, { layers: Number(e.target.value) })}
                      className="min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                    />
                  </div>
                  {design.type === 'tiered' && i > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs opacity-70" htmlFor={`ox-${i}`}>Offset X (cm)</label>
                        <input
                          id={`ox-${i}`}
                          type="number"
                          value={tier.offsetXCm}
                          onChange={(e) => updateTier(i, { offsetXCm: Number(e.target.value) })}
                          className="min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                        />
                      </div>
                      <div>
                        <label className="text-xs opacity-70" htmlFor={`oz-${i}`}>Offset Z (cm)</label>
                        <input
                          id={`oz-${i}`}
                          type="number"
                          value={tier.offsetZCm}
                          onChange={(e) => updateTier(i, { offsetZCm: Number(e.target.value) })}
                          className="min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                        />
                      </div>
                    </div>
                  )}
                  <select
                    value={tier.finish}
                    onChange={(e) => updateTier(i, { finish: e.target.value as FinishKind })}
                    aria-label={`Tier ${i + 1} finish`}
                    className="min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
                  >
                    {FINISHES.map((f) => (
                      <option key={f.kind} value={f.kind}>{f.label}</option>
                    ))}
                  </select>
                  {design.type === 'tiered' && design.tiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTier(i)}
                      className="min-h-[48px] w-full rounded border border-[color:var(--tomato)]/40 font-slip text-xs text-[color:var(--tomato)]"
                    >
                      Remove tier {i + 1}
                    </button>
                  )}
                </div>
              </details>
            ))}
          </div>

          {design.type === 'tiered' && (
            <button
              type="button"
              onClick={addTier}
              disabled={design.tiers.length >= LIMITS.tiersMax}
              className="mt-2 min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 text-[color:var(--ink)] disabled:opacity-30"
            >
              Add tier
            </button>
          )}
          {design.type === 'sheet' && (
            <button
              type="button"
              onClick={() => setDesign(sheetDesign(design.tiers.length === 1 ? 2 : 1))}
              className="mt-2 min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 text-[color:var(--ink)]"
            >
              {design.tiers.length === 1 ? 'Add second slab' : 'Remove second slab'}
            </button>
          )}
            </>
          )}

          {design.type === 'cupcakes' && (
            <CupcakeDesigner
              design={design}
              onFrostingColor={(c) => setDesign({ ...design, tiers: design.tiers.map((t) => ({ ...t, frostingColor: c })) })}
              onSpongeColor={(c) => setDesign({ ...design, tiers: design.tiers.map((t) => ({ ...t, spongeColor: c })) })}
              onLinerColor={(c) => setDesign({ ...design, cupcakeLinerColor: c })}
              onFrostingStyle={(s) => setDesign({ ...design, cupcakeFrostingStyle: s })}
              onTopper={(t) => setDesign({ ...design, cupcakeTopper: t })}
              onQuantity={(n) => setDesign(cupcakeDesign(n, design.cupcakeLayout ?? 'board'))}
              onLayout={(l) => setDesign({ ...design, cupcakeLayout: l })}
            />
          )}
          <p className="mt-2 text-xs opacity-70">
            Limits: round, hexagon and square 10–50 cm; rectangle 15–60 by 10–40 cm; heart 15–40 cm.
            Height 4–20 cm per tier, 2–6 layers, up to 4 tiers.
          </p>

          <SlipRule />
          <div className="flex justify-between"><span>Servings</span><span className="font-medium">{est.servings}</span></div>
          <div className="flex justify-between">
            <span>Price</span>
            <span className="font-medium">{settings.currencySymbol}{est.price.toFixed(2)}</span>
          </div>
          <div className="flex justify-between"><span>Oven trays</span><span className="font-medium">{est.trays}</span></div>
          <div className="flex justify-between"><span>Prep</span><span className="font-medium">{Math.round(est.prepMinutes)} min</span></div>
          <p className="mt-2 text-xs opacity-70">Estimate from baker settings</p>

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={saveImage} className="min-h-[48px] flex-1 rounded border border-[color:var(--ink)]/30 text-xs text-[color:var(--ink)]">
              Save cake image
            </button>
            <button type="button" onClick={() => setShowSheet(true)} className="min-h-[48px] flex-1 rounded border border-[color:var(--ink)]/30 text-xs text-[color:var(--ink)]">
              Baker's sheet
            </button>
            <button type="button" onClick={() => setShowSettings(true)} className="min-h-[48px] rounded border border-[color:var(--ink)]/30 text-xs text-[color:var(--ink)]" aria-label="Open baker settings">
              Settings
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--slip)] p-4 font-slip text-sm">
          <div className="font-medium">Buildability guidelines, not structural engineering</div>
          {build.flags.length === 0 ? (
            <p className="mt-2 text-[color:var(--teal)]" role="status">No issues found</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {build.flags.map((f) => (
                <li key={f.id} className="rounded-lg border border-[color:var(--tomato)]/30 bg-white p-2">
                  <div>{f.message}</div>
                  <div className="mt-1 text-xs opacity-70">{f.why}</div>
                  {f.fixLabel && (
                    <button
                      type="button"
                      onClick={() => applyFix(f.id)}
                      className="mt-1 min-h-[48px] rounded border border-[color:var(--teal)]/50 font-slip text-xs text-[color:var(--teal)]"
                    >
                      {f.fixLabel}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs">
            <label htmlFor="th-support">
              Support %
              <input
                id="th-support"
                type="number"
                min={10}
                max={100}
                value={Math.round(thresholds.minSupportFraction * 100)}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    minSupportFraction: Math.max(0.1, Math.min(1, Number(e.target.value) / 100)),
                  })
                }
                className="min-h-[44px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
              />
            </label>
            <label htmlFor="th-overhang">
              Overhang %
              <input
                id="th-overhang"
                type="number"
                min={0}
                max={100}
                value={Math.round(thresholds.maxOverhangFraction * 100)}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    maxOverhangFraction: Math.max(0, Math.min(1, Number(e.target.value) / 100)),
                  })
                }
                className="min-h-[44px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
              />
            </label>
            <label htmlFor="th-slender">
              Max height x
              <input
                id="th-slender"
                type="number"
                min={1}
                max={3}
                step={0.1}
                value={thresholds.maxSlenderness}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    maxSlenderness: Math.max(1, Math.min(3, Number(e.target.value) || 1.6)),
                  })
                }
                className="min-h-[44px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
              />
            </label>
          </div>
        </div>
      </div>

      {showSheet && (
        <BakersSheet design={design} est={est} settings={settings} onClose={() => setShowSheet(false)} />
      )}
      {showSettings && (
        <SettingsDrawer
          settings={settings}
          onChange={setSettings}
          onReset={() => setSettings(DEFAULT_SETTINGS)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function moveDecorationInwardDesign(x: Decoration): Decoration {
  return { ...x, radius: Math.min(x.radius, 0.8) };
}

function ColorSwatches({
  label,
  value,
  onChange,
  allowCustom = true,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
  allowCustom?: boolean;
}) {
  return (
    <div>
      <label className="text-xs opacity-70">{label}</label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {CAKE_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${c}`}
            aria-pressed={value.toLowerCase() === c.toLowerCase()}
            onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-full border-2 transition-transform ${
              value.toLowerCase() === c.toLowerCase()
                ? 'border-[color:var(--ink)] scale-110'
                : 'border-[color:var(--ink)]/20'
            }`}
            style={{ background: c }}
          />
        ))}
        {allowCustom && (
          <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border-2 border-[color:var(--ink)]/20">
            <span
              className="absolute inset-0"
              style={{
                background:
                  'conic-gradient(from 0deg, #ff5b5b, #ffd23f, #4cd964, #5ac8fa, #af52de, #ff5b5b)',
              }}
            />
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`${label} custom color`}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function CupcakeDesigner({
  design,
  onFrostingColor,
  onSpongeColor,
  onLinerColor,
  onFrostingStyle,
  onTopper,
  onQuantity,
  onLayout,
}: {
  design: StudioDesign;
  onFrostingColor: (c: string) => void;
  onSpongeColor: (c: string) => void;
  onLinerColor: (c: string) => void;
  onFrostingStyle: (s: CupcakeFrostingStyle) => void;
  onTopper: (t: CupcakeTopper) => void;
  onQuantity: (n: number) => void;
  onLayout: (l: CupcakeLayout) => void;
}) {
  const quantity = design.tiers.length;
  const frostingStyle = design.cupcakeFrostingStyle ?? 'swirl';
  const linerColor = design.cupcakeLinerColor ?? DEFAULT_LINER_COLOR;
  const topper = design.cupcakeTopper ?? 'none';
  const layout = design.cupcakeLayout ?? 'board';
  const spongeColor = design.tiers[0]?.spongeColor ?? '#F3E7D3';
  const frostingColor = design.tiers[0]?.frostingColor ?? '#F2C6C2';

  return (
    <div className="mt-2 space-y-3">
      <div className="font-medium">One cupcake (all {quantity} are identical)</div>

      <ColorSwatches label="Cake flavor color" value={spongeColor} onChange={onSpongeColor} />
      <ColorSwatches label="Liner color" value={linerColor} onChange={onLinerColor} />
      <ColorSwatches label="Frosting color" value={frostingColor} onChange={onFrostingColor} />

      <div>
        <label className="text-xs opacity-70" htmlFor="cc-frost-style">Frosting style</label>
        <div className="mt-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Frosting style">
          {CUPCAKE_FROSTING_STYLES.map((s) => (
            <button
              key={s.kind}
              id={s.kind === frostingStyle ? 'cc-frost-style' : undefined}
              type="button"
              role="radio"
              aria-checked={s.kind === frostingStyle}
              onClick={() => onFrostingStyle(s.kind)}
              className={`min-h-[44px] rounded-lg border font-slip text-xs transition-colors ${
                s.kind === frostingStyle
                  ? 'border-[color:var(--teal)] bg-[color:var(--teal)] text-white'
                  : 'border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs opacity-70" htmlFor="cc-topper">Topper</label>
        <select
          id="cc-topper"
          value={topper}
          onChange={(e) => onTopper(e.target.value as CupcakeTopper)}
          className="mt-1 min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
        >
          {CUPCAKE_TOPPERS.map((t) => (
            <option key={t.kind} value={t.kind}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs opacity-70" htmlFor="cc-qty">Quantity (1 to 48)</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="cc-qty"
            type="number"
            min={1}
            max={48}
            value={quantity}
            onChange={(e) => onQuantity(Math.max(1, Math.min(48, Number(e.target.value) || 1)))}
            className="min-h-[48px] w-24 rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
          />
          <div className="flex gap-1.5" role="group" aria-label="Quick quantity">
            {[6, 12, 24].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onQuantity(n)}
                aria-pressed={quantity === n}
                className={`min-h-[44px] rounded border px-3 font-slip text-sm transition-colors ${
                  quantity === n
                    ? 'border-[color:var(--teal)] bg-[color:var(--teal)] text-white'
                    : 'border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs opacity-70">Layout</label>
        <div className="mt-1 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Layout">
          {(['board', 'tower'] as CupcakeLayout[]).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={layout === l}
              onClick={() => onLayout(l)}
              className={`min-h-[44px] rounded-lg border font-slip text-sm capitalize transition-colors ${
                layout === l
                  ? 'border-[color:var(--teal)] bg-[color:var(--teal)] text-white'
                  : 'border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function numField(
  id: string,
  label: string,
  value: number,
  onChange: (v: number) => void,
  step = 1
) {
  return (
    <label htmlFor={id} className="block text-xs opacity-80">
      {label}
      <input
        id={id}
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 min-h-[48px] w-full rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
      />
    </label>
  );
}

function SettingsDrawer({
  settings,
  onChange,
  onReset,
  onClose,
}: {
  settings: EstimateSettings;
  onChange: (s: EstimateSettings) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add('printing-sheet');
    return () => document.body.classList.remove('printing-sheet');
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[color:var(--ink)]/50" role="dialog" aria-modal="true" aria-label="Baker settings">
      <div className="h-full w-full max-w-md overflow-y-auto bg-[color:var(--slip)] p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h3 className="font-display text-2xl">Baker settings</h3>
          <button type="button" onClick={onClose} className="min-h-[48px] min-w-[48px] rounded border border-[color:var(--ink)]/30 font-slip text-[color:var(--ink)]" aria-label="Close settings">✕</button>
        </div>

        <div className="mt-4 space-y-3 font-slip text-sm">
          {numField('s-portion', 'Portion area (cm²)', settings.portionAreaCm2, (v) =>
            onChange(normalizeSettings({ ...settings, portionAreaCm2: v }))
          )}
          {numField('s-price-fondant', 'Price per serving — fondant', settings.pricePerServing.fondant, (v) =>
            onChange(normalizeSettings({ ...settings, pricePerServing: { ...settings.pricePerServing, fondant: v } }))
          )}
          {numField('s-price-ganache', 'Price per serving — ganache', settings.pricePerServing.ganache, (v) =>
            onChange(normalizeSettings({ ...settings, pricePerServing: { ...settings.pricePerServing, ganache: v } }))
          )}
          {numField('s-price-sponge', 'Price per serving — sponge', settings.pricePerServing.sponge, (v) =>
            onChange(normalizeSettings({ ...settings, pricePerServing: { ...settings.pricePerServing, sponge: v } }))
          )}
          {numField('s-tray', 'Tray usable area (cm²)', settings.trayAreaCm2, (v) =>
            onChange(normalizeSettings({ ...settings, trayAreaCm2: v }))
          )}
          {numField('s-prep-base', 'Prep minutes — base', settings.prepMinutesBase, (v) =>
            onChange(normalizeSettings({ ...settings, prepMinutesBase: v }))
          )}
          {numField('s-prep-tier', 'Prep minutes per tier', settings.prepMinutesPerTier, (v) =>
            onChange(normalizeSettings({ ...settings, prepMinutesPerTier: v }))
          )}
          {numField('s-prep-layer', 'Prep minutes per layer', settings.prepMinutesPerLayer, (v) =>
            onChange(normalizeSettings({ ...settings, prepMinutesPerLayer: v }))
          )}
          {numField('s-prep-deco', 'Prep minutes per decoration', settings.prepMinutesPerDecoration, (v) =>
            onChange(normalizeSettings({ ...settings, prepMinutesPerDecoration: v }))
          )}
          {numField('s-frost-smooth', 'Frosting surcharge — smooth', settings.frostingSurcharge.smooth, (v) =>
            onChange(normalizeSettings({ ...settings, frostingSurcharge: { ...settings.frostingSurcharge, smooth: v } }))
          )}
          {numField('s-frost-textured', 'Frosting surcharge — textured', settings.frostingSurcharge.textured, (v) =>
            onChange(normalizeSettings({ ...settings, frostingSurcharge: { ...settings.frostingSurcharge, textured: v } }))
          )}
          {numField('s-frost-striped', 'Frosting surcharge — striped', settings.frostingSurcharge.striped, (v) =>
            onChange(normalizeSettings({ ...settings, frostingSurcharge: { ...settings.frostingSurcharge, striped: v } }))
          )}
          <label htmlFor="s-currency" className="block text-xs opacity-80">
            Currency symbol
            <input
              id="s-currency"
              type="text"
              maxLength={3}
              value={settings.currencySymbol}
              onChange={(e) => onChange(normalizeSettings({ ...settings, currencySymbol: e.target.value }))}
              className="mt-1 min-h-[48px] w-24 rounded border border-[color:var(--ink)]/30 bg-white px-2 text-[color:var(--ink)]"
            />
          </label>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onReset}
              className="min-h-[48px] flex-1 rounded-lg border border-[color:var(--ink)]/30 font-slip text-sm text-[color:var(--ink)]"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] flex-1 rounded-lg bg-[color:var(--ink)] font-slip text-sm text-[color:var(--parchment)]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BakersSheet({
  design,
  est,
  settings,
  onClose,
}: {
  design: StudioDesign;
  est: ReturnType<typeof estimate>;
  settings: EstimateSettings;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add('printing-sheet');
    return () => document.body.classList.remove('printing-sheet');
  }, []);

  return (
    <div className="bakers-sheet-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--ink)]/50 p-4" role="dialog" aria-modal="true" aria-label="Baker's sheet">
      <div className="w-full max-w-lg bg-[color:var(--slip)] p-6 shadow-xl print:bg-white print:p-0">
        <div className="flex items-start justify-between">
          <h3 className="font-display text-2xl">Baker's sheet</h3>
          <button type="button" onClick={onClose} className="min-h-[48px] min-w-[48px] rounded border border-[color:var(--ink)]/30 font-slip text-[color:var(--ink)]" aria-label="Close baker's sheet">✕</button>
        </div>
        <div className="mt-4 font-slip text-sm text-[color:var(--ink)]">
          <div className="flex justify-between"><span>Servings</span><span>{est.servings}</span></div>
          <div className="flex justify-between"><span>Oven trays</span><span>{est.trays}</span></div>
          <div className="flex justify-between"><span>Prep</span><span>{Math.round(est.prepMinutes)} min</span></div>
          <hr className="my-2 border-dashed border-[color:var(--ink)]/30" />
          {design.tiers.map((t, i) => (
            <div key={i} className="flex justify-between">
              <span>
                {design.type === 'cupcakes' ? `Cupcake ${i + 1}` : `Tier ${i + 1}`}: {t.shape}, {t.widthCm}×{t.depthCm}×{t.heightCm} cm, {t.layers} layers, {t.finish}
              </span>
            </div>
          ))}
          {DECORATION_KINDS.map(({ kind, label }) => {
            const count = design.decorations.filter((d) => d.kind === kind).length;
            if (count === 0) return null;
            return (
              <div key={kind} className="flex justify-between">
                <span>{label}</span>
                <span>x{count}</span>
              </div>
            );
          })}
          <hr className="my-2 border-dashed border-[color:var(--ink)]/30" />
          <div className="mt-2 flex justify-between font-medium">
            <span>Total</span>
            <span>{settings.currencySymbol}{est.price.toFixed(2)}</span>
          </div>
          <div className="mt-3 text-xs opacity-70">
            <div>Settings used for this estimate:</div>
            <div>Portion area: {settings.portionAreaCm2} cm² · Tray area: {settings.trayAreaCm2} cm²</div>
            <div>
              Price per serving: fondant {settings.pricePerServing.fondant}, ganache {settings.pricePerServing.ganache}, sponge {settings.pricePerServing.sponge}
            </div>
            <div>
              Prep: base {settings.prepMinutesBase} + {settings.prepMinutesPerTier}/tier + {settings.prepMinutesPerLayer}/layer + {settings.prepMinutesPerDecoration}/decoration
            </div>
            <div>
              Frosting surcharge: smooth {settings.frostingSurcharge.smooth}, textured {settings.frostingSurcharge.textured}, striped {settings.frostingSurcharge.striped}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 min-h-[48px] w-full rounded-lg bg-[color:var(--ink)] font-slip text-sm text-[color:var(--parchment)] print:hidden"
        >
          Print this sheet
        </button>
      </div>
    </div>
  );
}
