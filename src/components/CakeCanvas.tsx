import { useMemo, useRef, useState, useEffect, Component, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Decoration, StudioDesign, TierShape, FinishKind, CupcakeFrostingStyle } from '@/lib/cakeModel';
import { TEXT_TOPPER_FONTS, TEXT_TOPPER_MAX_CHARS } from '@/lib/cakeModel';

const CM = 0.055; // cm to scene units
const FONDANT_ROUGH = 0.9;
const GANACHE_ROUGH = 0.25;
const SPONGE_ROUGH = 1;
const ACCENT_GOLD = '#C9A227';

function materialProps(finish: FinishKind): { roughness: number; metalness: number } {
  switch (finish) {
    case 'ganache':
      return { roughness: GANACHE_ROUGH, metalness: 0 };
    case 'sponge':
      return { roughness: SPONGE_ROUGH, metalness: 0 };
    default:
      return { roughness: FONDANT_ROUGH, metalness: 0 };
  }
}

function baseColorFor(finish: FinishKind, frostingColor: string, spongeColor: string): string {
  if (finish === 'sponge') return spongeColor || '#E3C48D';
  return frostingColor;
}

/** Scene-space layout of the design: one entry per tier/slab/cupcake. */
export type LaidTier = {
  shape: TierShape;
  w: number; // scene units
  d: number;
  h: number;
  x: number;
  z: number;
  baseY: number;
};

/** Pure layout shared with tests: stack positions for the current design. */
export function layoutTiers(design: StudioDesign): LaidTier[] {
  const tiers = design.tiers;
  if (design.type === 'sheet') {
    return tiers.map((t, i) => ({
      shape: t.shape,
      w: t.widthCm * CM,
      d: t.depthCm * CM,
      h: t.heightCm * CM,
      x: (i - (tiers.length - 1) / 2) * (t.widthCm * CM + 0.12),
      z: 0,
      baseY: 0,
    }));
  }
  if (design.type === 'cupcakes') {
    const n = tiers.length;
    if (design.cupcakeLayout === 'tower') {
      const out: LaidTier[] = [];
      // stack cupcakes in a vertical column
      const radius = 0;
      let level = 0;
      const perLevel = 1;
      for (let i = 0; i < n; i++) {
        const t = tiers[i];
        out.push({
          shape: t.shape,
          w: t.widthCm * CM,
          d: t.depthCm * CM,
          h: t.heightCm * CM,
          x: Math.cos(0) * radius,
          z: Math.sin(0) * radius,
          baseY: level * 0.16,
        });
        level += 1;
      }
      return out;
    }
    // board: square grid
    const cols = Math.ceil(Math.sqrt(n));
    const spacing = 0.5;
    return tiers.map((t, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const inRow = Math.min(cols, n - row * cols);
      return {
        shape: t.shape,
        w: t.widthCm * CM,
        d: t.depthCm * CM,
        h: t.heightCm * CM,
        x: (col - (inRow - 1) / 2) * spacing,
        z: (row - (Math.ceil(n / cols) - 1) / 2) * spacing,
        baseY: 0,
      };
    });
  }
  // tiered stack
  let y = 0;
  return tiers.map((t) => {
    const entry: LaidTier = {
      shape: t.shape,
      w: t.widthCm * CM,
      d: t.depthCm * CM,
      h: t.heightCm * CM,
      x: t.offsetXCm * CM,
      z: t.offsetZCm * CM,
      baseY: y,
    };
    y += t.heightCm * CM;
    return entry;
  });
}

/** Build the geometry for one tier body. Returns JSX with children as material. */
function TierBody({ t, children }: { t: LaidTier; children: ReactNode }) {
  switch (t.shape) {
    case 'round':
      return (
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[t.w / 2, t.w / 2, t.h, 64]} />
          {children}
        </mesh>
      );
    case 'hexagon':
      return (
        <mesh castShadow receiveShadow rotation={[0, Math.PI / 6, 0]}>
          <cylinderGeometry args={[t.w / 2, t.w / 2, t.h, 6]} />
          {children}
        </mesh>
      );
    case 'square':
    case 'rectangle':
      return (
        <RoundedBox
          args={[t.w, t.h, t.d]}
          radius={Math.min(0.04, t.h / 4)}
          smoothness={4}
          castShadow
          receiveShadow
        >
          {children}
        </RoundedBox>
      );
    case 'heart': {
      const geo = useMemo(() => {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * Math.PI * 2;
          const x = 16 * Math.pow(Math.sin(t), 3);
          const y =
            13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          pts.push(new THREE.Vector2(x, -y));
        }
        // normalize to a centered unit-ish box
        const shape = new THREE.Shape(pts);
        const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
        g.center();
        // after rotateX(-90): x = width, y = height, z = depth
        g.rotateX(-Math.PI / 2);
        const box = new THREE.Box3().setFromBufferAttribute(
          g.getAttribute('position') as THREE.BufferAttribute
        );
        const sx = t.w / (box.max.x - box.min.x);
        const sy = t.h / (box.max.y - box.min.y);
        const sz = t.d / (box.max.z - box.min.z);
        g.scale(sx, sy, sz);
        return g;
      }, [t.w, t.h, t.d]);
      return <mesh geometry={geo} castShadow receiveShadow>{children}</mesh>;
    }
  }
}

function Settle({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  useFrame((_, delta) => {
    if (reduced || !ref.current) return;
    t.current = Math.min(1, t.current + delta * 3.2);
    const p = t.current;
    ref.current.position.y = (1 - p) * -0.25 + Math.sin(p * Math.PI) * 0.03;
    ref.current.scale.setScalar(0.85 + 0.15 * p);
    ref.current.visible = true;
  });
  return <group ref={ref}>{children}</group>;
}

/** Typed text plate (canvas 2D texture) for the text topper. */
function TextPlate({ text, fontKey }: { text: string; fontKey: string }) {
  const tex = useMemo(() => {
    const fontDef = TEXT_TOPPER_FONTS.find((f) => f.key === fontKey) ?? TEXT_TOPPER_FONTS[0];
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#2b1a10';
    ctx.font = `bold 34px ${fontDef.css.includes('var(') ? 'serif' : fontDef.css}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, fontKey]);
  if (!tex) return null;
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.24, 0.06]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

function Pearls({ n }: { n: number }) {
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const r = 0.05 + 0.06 * (i % 3);
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0.04, Math.sin(a) * r]} castShadow>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshStandardMaterial color="#F3E7D3" roughness={0.25} metalness={0} />
          </mesh>
        );
      })}
    </group>
  );
}

/** One placed decoration, positioned in its tier's local space. */
function TierDecoration({
  d,
  tierSize,
  selected,
  onSelect,
}: {
  d: Decoration;
  tierSize: { halfMin: number };
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const isRibbon = d.kind === 'ribbon';
  const heightT = d.heightT ?? 0.5;
  const localY = isRibbon
    ? Math.max(-0.45, Math.min(0.45, heightT - 0.5)) * 0.9
    : 0.02;
  const r = tierSize.halfMin * 0.92 * d.radius;
  const localPos: [number, number, number] = isRibbon
    ? [0, localY, 0]
    : [Math.cos(d.angle) * r, localY, Math.sin(d.angle) * r];

  let body: ReactNode = null;
  if (d.kind === 'pearls') {
    body = <Pearls n={12} />;
  } else if (d.kind === 'candle') {
    body = (
      <group>
        <mesh position={[0, 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.28, 16]} />
          <meshStandardMaterial color="#F7F1E6" roughness={0.4} metalness={0} />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <sphereGeometry args={[0.032, 10, 10]} />
          <meshStandardMaterial color="#D5442F" emissive="#D5442F" emissiveIntensity={0.4} roughness={1} metalness={0} />
        </mesh>
      </group>
    );
  } else if (d.kind === 'flower') {
    const petals = d.variant === 'daisy' ? 8 : 6;
    const petalColor = d.variant === 'daisy' ? '#FFFDF8' : '#E8B4B8';
    body = (
      <group position={[0, 0.05, 0]}>
        {Array.from({ length: petals }, (_, i) => {
          const a = (i / petals) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07]} rotation={[Math.PI / 2, 0, -a]} castShadow>
              <capsuleGeometry args={[0.035, 0.06, 4, 10]} />
              <meshStandardMaterial color={petalColor} roughness={0.5} metalness={0} />
            </mesh>
          );
        })}
        <mesh position={[0, 0.01, 0]}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshStandardMaterial color="#D9A441" roughness={0.4} metalness={0} />
        </mesh>
      </group>
    );
  } else if (d.kind === 'sign') {
    body = (
      <group position={[0, 0.12, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.16, 0.02]} />
          <meshStandardMaterial color="#FFFDF8" roughness={0.6} metalness={0} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
          <meshStandardMaterial color="#8A6B52" roughness={0.6} metalness={0} />
        </mesh>
      </group>
    );
  } else if (d.kind === 'starTopper') {
    body = (
      <group position={[0, 0.16, 0]}>
        <mesh position={[0, -0.1, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.008, 0.16, 8]} />
          <meshStandardMaterial color={ACCENT_GOLD} roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.09, 0.12, 5]} />
          <meshStandardMaterial color={ACCENT_GOLD} roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
    );
  } else if (d.kind === 'heartTopper') {
    body = (
      <group position={[0, 0.16, 0]}>
        <mesh position={[0, -0.1, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.008, 0.16, 8]} />
          <meshStandardMaterial color={ACCENT_GOLD} roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh castShadow scale={0.13}>
          <extrudeGeometry args={[heartShape2D(), { depth: 0.15, bevelEnabled: false }]} />
          <meshStandardMaterial color="#E85D75" roughness={0.4} metalness={0.1} />
        </mesh>
      </group>
    );
  } else if (d.kind === 'textTopper') {
    const label = (d.text || 'Yay').slice(0, TEXT_TOPPER_MAX_CHARS);
    body = (
      <group position={[0, 0.16, 0]}>
        <mesh position={[0, -0.1, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.008, 0.16, 8]} />
          <meshStandardMaterial color={ACCENT_GOLD} roughness={0.3} metalness={0.8} />
        </mesh>
        <TextPlate text={label} fontKey={d.font ?? 'slip'} />
      </group>
    );
  } else if (d.kind === 'berries') {
    body = (
      <group>
        {([
          [0, 0.03, 0, '#C0392B'],
          [0.05, 0.025, 0.03, '#8E2B4B'],
          [-0.045, 0.02, 0.04, '#C0392B'],
          [0.02, 0.02, -0.05, '#7A9B4E'],
        ] as [number, number, number, string][]).map(([x, y, z, c], i) => (
          <mesh key={i} position={[x, y, z]} castShadow>
            <sphereGeometry args={[0.028, 12, 12]} />
            <meshStandardMaterial color={c} roughness={0.3} metalness={0} />
          </mesh>
        ))}
      </group>
    );
  } else if (d.kind === 'macarons') {
    body = (
      <group>
        {([
          [0, '#E8B4B8'],
          [0.055, '#A8C6A0'],
          [-0.055, '#F2D98D'],
        ] as [number, string][]).map(([x, c], i) => (
          <group key={i} position={[x, 0.02, 0]} rotation={[0, i * 0.5, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.018, 20]} />
              <meshStandardMaterial color={c} roughness={0.6} metalness={0} />
            </mesh>
            <mesh position={[0, 0.016, 0]} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 0.014, 20]} />
              <meshStandardMaterial color="#FFFDF8" roughness={0.5} metalness={0} />
            </mesh>
          </group>
        ))}
      </group>
    );
  } else if (d.kind === 'sprinkles') {
    body = (
      <group>
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          const rr = 0.03 + 0.05 * (i % 3);
          const colors = ['#E85D75', '#5CB8B2', '#F2D98D', '#A8C6A0'];
          return (
            <mesh key={i} position={[Math.cos(a) * rr, 0.012, Math.sin(a) * rr]} rotation={[Math.PI / 2, 0, a]}>
              <capsuleGeometry args={[0.006, 0.025, 2, 6]} />
              <meshStandardMaterial color={colors[i % colors.length]} roughness={0.4} metalness={0} />
            </mesh>
          );
        })}
      </group>
    );
  } else if (d.kind === 'leafSprig') {
    body = (
      <group position={[0, 0.04, 0]}>
        <mesh position={[0, 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.14, 8]} />
          <meshStandardMaterial color="#5B7B3A" roughness={0.7} metalness={0} />
        </mesh>
        {[-0.03, 0.01, 0.05].map((y, i) => (
          <group key={i}>
            <mesh position={[0.035, y, 0]} rotation={[0, 0, -0.7]} scale={[1, 0.4, 1]} castShadow>
              <sphereGeometry args={[0.028, 10, 8]} />
              <meshStandardMaterial color="#6E9448" roughness={0.7} metalness={0} />
            </mesh>
            <mesh position={[-0.035, y, 0]} rotation={[0, 0, 0.7]} scale={[1, 0.4, 1]} castShadow>
              <sphereGeometry args={[0.028, 10, 8]} />
              <meshStandardMaterial color="#6E9448" roughness={0.7} metalness={0} />
            </mesh>
          </group>
        ))}
      </group>
    );
  } else if (d.kind === 'goldFlakes') {
    body = (
      <group>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          const rr = 0.02 + 0.06 * (i % 3);
          return (
            <mesh key={i} position={[Math.cos(a) * rr, 0.008, Math.sin(a) * rr]} rotation={[0, a, 0]} scale={[1, 0.15, 1.4]}>
              <sphereGeometry args={[0.012, 8, 6]} />
              <meshStandardMaterial color="#C9A227" roughness={0.25} metalness={0.9} />
            </mesh>
          );
        })}
      </group>
    );
  }

  return (
    <group position={localPos}>
      <Settle>{body}</Settle>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]}>
          <ringGeometry args={[0.14, 0.17, 32]} />
          <meshBasicMaterial color="#2E6F73" />
        </mesh>
      )}
      <mesh
        visible={false}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(d.id);
        }}
      >
        <cylinderGeometry args={[0.16, 0.16, 0.5, 8]} />
      </mesh>
    </group>
  );
}

/** Unit heart THREE.Shape (centered, ~unit bounding box). */
function heartShape2D(): THREE.Shape {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push(new THREE.Vector2(x / 34, y / 34));
  }
  return new THREE.Shape(pts);
}

/** Piped swirl: a helix tube in the frosting color. */
function Swirl({ color, style }: { color: string; style: CupcakeFrostingStyle }) {
  const geo = useMemo(() => {
    const turns = style === 'ruffle' ? 3.5 : 2.5;
    const height = style === 'flat' ? 0.08 : 0.22;
    const points: THREE.Vector3[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const a = p * Math.PI * 2 * turns;
      const r = style === 'flat' ? 0.095 : 0.085 * (1 - p * 0.75);
      points.push(new THREE.Vector3(Math.cos(a) * r, p * height, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = style === 'ruffle' ? 0.05 : 0.032;
    return new THREE.TubeGeometry(curve, 64, tube, 10, false);
  }, [style]);
  return (
    <group position={[0, 0.05, 0]}>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color={color} roughness={0.55} metalness={0} />
      </mesh>
      <mesh position={[0, -0.03, 0]} castShadow>
        <cylinderGeometry args={[0.095, 0.08, 0.08, 24]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0} />
      </mesh>
    </group>
  );
}

function Cupcake({ frostingColor, linerColor, frostingStyle }: { frostingColor: string; linerColor: string; frostingStyle: CupcakeFrostingStyle }) {
  return (
    <group>
      {/* fluted liner */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.105, 0.08, 0.12, 24]} />
        <meshStandardMaterial color={linerColor} roughness={0.7} metalness={0} />
      </mesh>
      <Swirl color={frostingColor} style={frostingStyle} />
    </group>
  );
}

function CupcakeTopper({ kind }: { kind: 'candle' | 'starTopper' | 'heartTopper' | 'flower' | 'berries' }) {
  const y = 0.28;
  if (kind === 'candle') {
    return (
      <group position={[0, y, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.08, 10]} />
          <meshStandardMaterial color="#F7F1E6" roughness={0.4} metalness={0} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <sphereGeometry args={[0.014, 8, 8]} />
          <meshStandardMaterial color="#D5442F" emissive="#D5442F" emissiveIntensity={0.5} roughness={1} metalness={0} />
        </mesh>
      </group>
    );
  }
  if (kind === 'starTopper') {
    return (
      <group position={[0, y, 0]}>
        <mesh position={[0, -0.03, 0]} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.06, 8]} />
          <meshStandardMaterial color={ACCENT_GOLD} roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.04, 0.05, 5]} />
          <meshStandardMaterial color={ACCENT_GOLD} roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
    );
  }
  if (kind === 'heartTopper') {
    return (
      <mesh position={[0, y, 0]} castShadow>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial color="#E8B4B8" roughness={0.5} metalness={0} />
      </mesh>
    );
  }
  if (kind === 'flower') {
    return (
      <group position={[0, y, 0]}>
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025]} castShadow>
              <sphereGeometry args={[0.016, 8, 8]} />
              <meshStandardMaterial color="#E8B4B8" roughness={0.5} metalness={0} />
            </mesh>
          );
        })}
        <mesh>
          <sphereGeometry args={[0.014, 10, 10]} />
          <meshStandardMaterial color="#D9A441" roughness={0.4} metalness={0} />
        </mesh>
      </group>
    );
  }
  // berries
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshStandardMaterial color="#B32428" roughness={0.4} metalness={0} />
      </mesh>
      <mesh position={[0.03, -0.005, 0]} castShadow>
        <sphereGeometry args={[0.014, 10, 10]} />
        <meshStandardMaterial color="#B32428" roughness={0.4} metalness={0} />
      </mesh>
      <mesh position={[-0.025, 0.01, 0.02]} castShadow>
        <sphereGeometry args={[0.012, 10, 10]} />
        <meshStandardMaterial color="#B32428" roughness={0.4} metalness={0} />
      </mesh>
    </group>
  );
}

function Cake({
  design,
  placingKind,
  onPlace,
  selectedId,
  onSelect,
}: {
  design: StudioDesign;
  placingKind: string | null;
  onPlace: (tier: number, angle: number, radius: number, heightT: number | null) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const laid = useMemo(() => layoutTiers(design), [design]);
  const isTiered = design.type === 'tiered';
  const maxR = Math.max(...laid.map((l) => Math.max(l.w, l.d) / 2), 0.5);

  const handleSurfaceClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const tierIndex = (e.object.userData as { tierIndex?: number }).tierIndex;
    if (typeof tierIndex !== 'number') return;
    if (!placingKind) {
      onSelect(null);
      return;
    }
    const point = e.point.clone();
    e.object.parent?.worldToLocal(point);
    const rr = Math.sqrt(point.x * point.x + point.z * point.z);
    const maxLayerR = (Math.max(laid[tierIndex].w, laid[tierIndex].d) / 2) * 0.92;
    const heightT = placingKind === 'ribbon' ? Math.max(0.1, Math.min(0.9, point.y / laid[tierIndex].h)) : null;
    onPlace(tierIndex, Math.atan2(point.z, point.x), Math.min(1, rr / maxLayerR), heightT);
  };

  return (
    <group>
      {/* cake board */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <cylinderGeometry args={[maxR + 0.45, maxR + 0.45, 0.08, 64]} />
        <meshStandardMaterial color="#F7F1E6" roughness={0.7} metalness={0} />
      </mesh>
      {laid.map((l, i) => {
        const tier = design.tiers[i];
        const color = baseColorFor(tier.finish, tier.frostingColor, tier.spongeColor);
        const mp = materialProps(tier.finish);
        const halfMin = Math.min(l.w, l.d) / 2;
        const tierDecorations = design.decorations.filter((d) => d.tier === i);
        const isCupcakeTier = design.type === 'cupcakes';
        return (
          <group key={i} position={[l.x, l.baseY + l.h / 2, l.z]}>
            {isCupcakeTier ? (
              <group
                userData={{ tierIndex: i }}
                onClick={handleSurfaceClick}
              >
                <Cupcake
                  frostingColor={color}
                  linerColor={design.cupcakeLinerColor ?? '#D9A441'}
                  frostingStyle={design.cupcakeFrostingStyle ?? 'swirl'}
                />
                {design.cupcakeTopper && design.cupcakeTopper !== 'none' && (
                  <CupcakeTopper kind={design.cupcakeTopper} />
                )}
              </group>
            ) : (
              <group>
                <group
                  userData={{ tierIndex: i }}
                  onClick={handleSurfaceClick}
                >
                  <TierBody t={l}>
                    <meshStandardMaterial color={color} roughness={mp.roughness} metalness={mp.metalness} />
                  </TierBody>
                </group>
                {tierDecorations.map((d) => (
                  <TierDecoration
                    key={d.id}
                    d={d}
                    tierSize={{ halfMin }}
                    selected={d.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

export type CakeCanvasProps = {
  design: StudioDesign;
  placingKind: string | null;
  onPlace: (tier: number, angle: number, radius: number, heightT: number | null) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
};

/** 2D fallback shown when WebGL cannot start. */
function CakeFallback({ design }: { design: StudioDesign }) {
  const laid = useMemo(() => layoutTiers(design), [design]);
  const maxW = Math.max(...laid.map((l) => l.w), 1);
  const scale = 240 / maxW;
  return (
    <div
      className="flex h-[560px] w-full flex-col items-center justify-center gap-2 bg-[color:var(--parchment)]"
      role="img"
      aria-label="Cake designer preview (2D fallback — 3D view unavailable)."
    >
      <div className="flex flex-col-reverse items-center">
        {laid.map((l, i) => (
          <div
            key={`${i}`}
            className="relative rounded-md border border-[color:var(--ink)]/20"
            style={{
              width: Math.max(48, Math.round(l.w * scale)),
              height: 26,
              background: design.tiers[i].frostingColor,
              marginTop: i === 0 ? 0 : -4,
            }}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-slip text-[10px] opacity-60">
              {design.tiers[i].widthCm}cm
            </span>
          </div>
        ))}
      </div>
      <p className="font-slip text-xs opacity-70">
        3D preview unavailable — showing a 2D sketch.
      </p>
    </div>
  );
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('CakeCanvas WebGL error — rendering 2D fallback:', error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function webglAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl;
  } catch {
    return false;
  }
}

function Lighting() {
  const key = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    if (!key.current) return;
    key.current.shadow.mapSize.set(2048, 2048);
    const cam = key.current.shadow.camera;
    cam.near = 0.5;
    cam.far = 20;
    cam.left = -5;
    cam.right = 5;
    cam.top = 5;
    cam.bottom = -5;
    key.current.shadow.bias = -0.0004;
    key.current.shadow.radius = 4;
  }, []);
  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#FFF4E0', '#C9B79C', 0.5]} />
      <directionalLight ref={key} position={[4, 7, 3]} intensity={1.3} color="#FFF4E0" castShadow />
    </>
  );
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.11, 0]} receiveShadow>
      <circleGeometry args={[7, 64]} />
      <meshStandardMaterial color="#EDE3CF" roughness={1} metalness={0} />
    </mesh>
  );
}

function useBackgroundTexture() {
  const tex = useMemo(() => {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(size / 2, size / 2, 16, size / 2, size / 2, size / 1.1);
    g.addColorStop(0, '#D9C7A8');
    g.addColorStop(1, '#EDE3CF');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return tex;
}

function CameraFit({ deps }: { deps: string }) {
  const { camera, controls } = useThree() as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  useEffect(() => {
    const maxR = 3.2;
    const totalH = 3.4;
    const centerY = 1.2;
    const fov = (camera.fov * Math.PI) / 180;
    const aspect = camera.aspect > 0 ? camera.aspect : 1;
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const effFov = Math.min(fov, fovH);
    const margin = 1.2;
    const fitH = (totalH / 2) / Math.tan(effFov / 2) * margin;
    const fitW = maxR / Math.tan(effFov / 2) * margin;
    const dist = Math.max(fitH, fitW, 4);
    const dir = new THREE.Vector3(1, 0.55, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist).add(new THREE.Vector3(0, centerY, 0)));
    camera.near = 0.1;
    camera.far = 100;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, centerY, 0);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, camera, controls]);
  return null;
}

export function CakeCanvas({ design, placingKind, onPlace, selectedId, onSelect, canvasRef }: CakeCanvasProps) {
  const handleCreated = ({ gl }: { gl: THREE.WebGLRenderer }) => {
    canvasRef.current = gl.domElement;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
  };

  const [glOk] = useState(() => webglAvailable());
  const bg = useBackgroundTexture();
  const deps = `${design.type}|${design.tiers.length}|${design.cupcakeLayout ?? ''}|${design.decorations.length}`;

  if (!glOk) {
    return <CakeFallback design={design} />;
  }

  return (
    <div className="h-[560px] w-full">
      <CanvasErrorBoundary fallback={<CakeFallback design={design} />}>
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          camera={{ position: [3.6, 2.4, 3.6], fov: 40, near: 0.1, far: 100 }}
          onCreated={handleCreated}
          aria-label="Cake designer. Pick a decoration, then click the cake to place it."
          role="img"
        >
          {bg ? <primitive object={bg} attach="background" /> : <color attach="background" args={['#EDE3CF']} />}
          <Lighting />
          <Floor />
          <Cake design={design} placingKind={placingKind} onPlace={onPlace} selectedId={selectedId} onSelect={onSelect} />
          <CameraFit deps={deps} />
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={2}
            maxDistance={16}
            maxPolarAngle={Math.PI / 2.1}
            enableDamping
            dampingFactor={0.08}
          />
        </Canvas>
      </CanvasErrorBoundary>
    </div>
  );
}
