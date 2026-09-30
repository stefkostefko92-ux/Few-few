// Physically based materials of the machine, after boy's materials.js / surface.js (Nexus combat engine): node
// materials with procedural surface detail instead of texture files, so the scene loads nothing but code.
// Loaded only through boot.ts, after the prefers-reduced-motion and save-data gate of MachineStage.tsx.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, sin, mix, smoothstep, fract, length, positionLocal, positionWorld, mx_noise_float, materialColor, materialRoughness, uniform } from 'three/tsl';

const TAU = Math.PI * 2;
const physical = (p: THREE.MeshPhysicalNodeMaterialParameters) => new THREE.MeshPhysicalNodeMaterial(p);
const standard = (p: THREE.MeshStandardNodeMaterialParameters) => new THREE.MeshStandardNodeMaterial(p);

/** Old machine enamel: orange peel and a slightly uneven tone under a thin clear coat. */
function enamel(hex: string, { roughness = 0.42, clearcoat = 0.5, scale = 22 } = {}) {
  const m = physical({ color: new THREE.Color(hex), roughness, metalness: 0, clearcoat, clearcoatRoughness: 0.22 });
  const n = mx_noise_float(positionLocal.mul(scale));
  const blot = mx_noise_float(positionLocal.mul(3.1)).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(n.mul(0.035).add(blot.mul(0.08)).add(0.95));
  m.roughnessNode = materialRoughness.mul(n.mul(0.3).add(1));
  return m;
}

/** Machined steel: a fine grain in the roughness breaks up the reflection. */
function steel(hex: string, roughness: number) {
  const m = physical({ color: new THREE.Color(hex), metalness: 1, roughness });
  m.roughnessNode = materialRoughness.mul(mx_noise_float(positionLocal.mul(180)).mul(0.22).add(1));
  return m;
}

export interface MachineMaterials {
  paint: THREE.MeshPhysicalNodeMaterial;
  paintDark: THREE.MeshPhysicalNodeMaterial;
  frame: THREE.MeshPhysicalNodeMaterial;
  yellow: THREE.MeshPhysicalNodeMaterial;
  steel: THREE.MeshPhysicalNodeMaterial;
  sheave: THREE.MeshPhysicalNodeMaterial;
  rope: THREE.MeshPhysicalNodeMaterial;
  lining: THREE.MeshStandardNodeMaterial;
  rubber: THREE.MeshStandardNodeMaterial;
  grille: THREE.MeshStandardNodeMaterial;
  floor: THREE.MeshStandardNodeMaterial;
  hole: THREE.MeshBasicNodeMaterial;
  /** Rope travel in rope lengths: the strands slide over the sheave as it turns. */
  ropeShift: ReturnType<typeof uniform>;
  dispose(): void;
}

export function createMaterials(ropeLength: number): MachineMaterials {
  const ropeShift = uniform(0);
  // 8 × 19 rope: eight strands laid with a pitch of about 6.5 d (65 mm) along the rope.
  const rope = physical({ color: new THREE.Color('#aab1b9'), metalness: 1, roughness: 0.42 });
  const along = uv().x.sub(ropeShift).mul(ropeLength / 0.065);
  const strand = sin(uv().y.mul(TAU * 8).add(along.mul(TAU))).mul(0.5).add(0.5);
  const wire = sin(uv().y.mul(TAU * 48).add(along.mul(TAU * 5.5))).mul(0.5).add(0.5);
  const lay = strand.pow(0.6).mul(wire.mul(0.25).add(0.75));
  rope.colorNode = materialColor.mul(mix(float(0.35), float(1.05), lay));
  rope.roughnessNode = mix(float(0.62), float(0.3), lay);

  // Cast-iron sheave, turned: brighter and smoother in the grooves where the ropes polish it.
  const sheave = physical({ color: new THREE.Color('#8c949d'), metalness: 0.95, roughness: 0.36 });
  // The lathe axis is the local Z (see parts.ts), so the radius is measured in the local XY plane.
  const groove = smoothstep(0.268, 0.282, length(positionLocal.xy));
  const grain = mx_noise_float(positionLocal.mul(60)).mul(0.5).add(0.5);
  sheave.roughnessNode = mix(float(0.42), float(0.2), groove).mul(grain.mul(0.25).add(0.9));
  sheave.colorNode = materialColor.mul(mix(float(0.86), float(1.08), groove));

  // Fan cover end: a pressed grille of concentric slots.
  const grille = standard({ color: new THREE.Color('#2b3c35'), roughness: 0.6 });
  const r = length(uv().sub(vec2(0.5, 0.5)));
  const slot = smoothstep(0.38, 0.62, fract(r.mul(22))).mul(smoothstep(0.08, 0.1, r)).mul(smoothstep(0.49, 0.46, r));
  grille.colorNode = mix(materialColor, vec3(0.012, 0.014, 0.016), slot);

  // Concrete machine-room floor: dull, a faint mottle, a pool of light under the machine, fading into the stage
  // (see the scene fog).
  const floor = standard({ color: new THREE.Color('#1a2130'), roughness: 0.94 });
  const pool = smoothstep(2.4, 0.2, length(positionWorld.xz.sub(vec2(0.25, 0.05))));
  floor.colorNode = materialColor.mul(mx_noise_float(positionWorld.xz.mul(5)).mul(0.12).add(0.94)).mul(mix(float(1), float(1.8), pool));

  const all = {
    paint: enamel('#3d5f53'),
    paintDark: enamel('#2e4a40', { roughness: 0.5 }),
    frame: enamel('#262d36', { roughness: 0.72, clearcoat: 0.08, scale: 30 }),
    yellow: enamel('#e0a526', { roughness: 0.34, clearcoat: 0.7 }),
    steel: steel('#c3c9d0', 0.22),
    sheave,
    rope,
    lining: standard({ color: new THREE.Color('#3b2c24'), roughness: 0.88, side: THREE.DoubleSide }), // open shoe surfaces
    rubber: standard({ color: new THREE.Color('#101113'), roughness: 0.9 }),
    grille,
    floor,
    hole: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#040506') }),
  };
  return {
    ...all,
    ropeShift,
    dispose() {
      for (const m of Object.values(all)) m.dispose();
    },
  };
}
