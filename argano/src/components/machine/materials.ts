// Physically based materials of the machine, after boy's materials.js / surface.js (Nexus combat engine): node
// materials with procedural surface detail instead of texture files, so the scene loads nothing but code.
// Loaded only through boot.ts, after the prefers-reduced-motion and save-data gate of MachineStage.tsx.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, sin, abs, atan, mix, step, floor, clamp, smoothstep, fract, length, positionLocal, positionWorld, mx_noise_float, materialColor, materialRoughness, uniform } from 'three/tsl';

const TAU = Math.PI * 2;
const physical = (p: THREE.MeshPhysicalNodeMaterialParameters) => new THREE.MeshPhysicalNodeMaterial(p);
const standard = (p: THREE.MeshStandardNodeMaterialParameters) => new THREE.MeshStandardNodeMaterial(p);

// Years in a machine room: dust and oil mist settle low, so the paint darkens and dulls toward the bedplate.
const grime = smoothstep(0.13, 0.34, positionWorld.y);

/** Old machine enamel: orange peel and a slightly uneven tone under a thin clear coat. */
function enamel(hex: string, { roughness = 0.42, clearcoat = 0.5, scale = 22 } = {}) {
  const m = physical({ color: new THREE.Color(hex), roughness, metalness: 0, clearcoat, clearcoatRoughness: 0.22 });
  const n = mx_noise_float(positionLocal.mul(scale));
  const blot = mx_noise_float(positionLocal.mul(3.1)).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(n.mul(0.035).add(blot.mul(0.08)).add(0.95)).mul(mix(float(0.8), float(1), grime));
  m.roughnessNode = materialRoughness.mul(n.mul(0.3).add(1)).mul(mix(float(1.25), float(1), grime));
  return m;
}

/** Steel parts (bolts, pins, rods): a fine grain in the roughness breaks up the reflection. */
function steel(hex: string, roughness: number) {
  const m = physical({ color: new THREE.Color(hex), metalness: 1, roughness });
  m.roughnessNode = materialRoughness.mul(mx_noise_float(positionLocal.mul(110)).mul(0.2).add(1));
  return m;
}

/**
 * Turned metal. The turning marks run round the part, so the highlight stretches across them: along the lathe
 * profile, which is the bitangent of the turned geometry (radial on a face, axial on a cylinder). No grain noise:
 * the marks are the texture, and a moving camera would make fine noise shimmer.
 */
function turned(hex: string, roughness: number, strength: number) {
  const m = physical({ color: new THREE.Color(hex), metalness: 1, roughness });
  m.anisotropyNode = vec2(0, strength);
  return m;
}

export interface MachineMaterials {
  paint: THREE.MeshPhysicalNodeMaterial;
  paintDark: THREE.MeshPhysicalNodeMaterial;
  frame: THREE.MeshPhysicalNodeMaterial;
  sheavePaint: THREE.MeshPhysicalNodeMaterial;
  yellow: THREE.MeshPhysicalNodeMaterial;
  red: THREE.MeshPhysicalNodeMaterial;
  steel: THREE.MeshPhysicalNodeMaterial;
  spring: THREE.MeshPhysicalNodeMaterial;
  machined: THREE.MeshPhysicalNodeMaterial;
  sheave: THREE.MeshPhysicalNodeMaterial;
  rope: THREE.MeshPhysicalNodeMaterial;
  glass: THREE.MeshPhysicalNodeMaterial;
  lining: THREE.MeshStandardNodeMaterial;
  rubber: THREE.MeshStandardNodeMaterial;
  grille: THREE.MeshStandardNodeMaterial;
  plate: THREE.MeshStandardNodeMaterial;
  floor: THREE.MeshStandardNodeMaterial;
  hole: THREE.MeshBasicNodeMaterial;
  /** Rope travel in rope lengths: the strands slide over the sheave as it turns. */
  ropeShift: ReturnType<typeof uniform>;
  dispose(): void;
}

export function createMaterials(ropeLength: number): MachineMaterials {
  const ropeShift = uniform(0);
  // 8 × 19 rope, lubricated: eight strands laid with a pitch of about 6.5 d (65 mm) along the rope.
  const rope = physical({ color: new THREE.Color('#a2a9b1'), metalness: 1, roughness: 0.4 });
  const along = uv().x.sub(ropeShift).mul(ropeLength / 0.065);
  const strand = sin(uv().y.mul(TAU * 8).add(along.mul(TAU))).mul(0.5).add(0.5);
  const wire = sin(uv().y.mul(TAU * 48).add(along.mul(TAU * 5.5))).mul(0.5).add(0.5);
  const lay = strand.pow(0.6).mul(wire.mul(0.25).add(0.75));
  rope.colorNode = materialColor.mul(mix(float(0.32), float(1.05), lay));
  rope.roughnessNode = mix(float(0.62), float(0.28), lay);

  // Sheave rim: turned cast iron, brighter and smoother in the grooves where the ropes polish it. The lathe axis
  // is the local Z (parts/sheave.ts), so the radius is measured in the local XY plane.
  const sheave = turned('#9aa2ab', 0.3, 0.55);
  const groove = smoothstep(0.268, 0.282, length(positionLocal.xy));
  sheave.roughnessNode = mix(float(0.34), float(0.16), groove).mul(mx_noise_float(positionLocal.mul(24)).mul(0.1).add(1));
  sheave.colorNode = materialColor.mul(mix(float(0.88), float(1.1), groove));

  // Fan cover end: a pressed grille of concentric slots, held by six radial ribs.
  const grille = standard({ color: new THREE.Color('#263630'), roughness: 0.58 });
  const d = uv().sub(vec2(0.5, 0.5));
  const r = length(d);
  const ribs = smoothstep(0.06, 0.14, abs(sin(atan(d.y, d.x).mul(3))));
  const slot = smoothstep(0.38, 0.62, fract(r.mul(22))).mul(smoothstep(0.1, 0.12, r)).mul(smoothstep(0.49, 0.46, r)).mul(ribs);
  grille.colorNode = mix(materialColor, vec3(0.01, 0.012, 0.014), slot);

  // Motor nameplate: satin aluminium with a printed header band and rows of lettering.
  const plate = standard({ color: new THREE.Color('#c9ced4'), metalness: 0.85, roughness: 0.36 });
  const st = uv();
  const inside = step(0.05, st.x).mul(step(st.x, 0.95)).mul(step(0.08, st.y)).mul(step(st.y, 0.92));
  const row = fract(st.y.mul(6));
  const words = step(0.05, mx_noise_float(vec2(st.x.mul(22), floor(st.y.mul(6)).mul(7.3))));
  const lettering = smoothstep(0.28, 0.36, row).mul(smoothstep(0.72, 0.64, row)).mul(step(st.y, 0.7)).mul(words).mul(0.65);
  const ink = clamp(step(0.74, st.y).mul(0.9).add(lettering), 0, 1).mul(inside);
  plate.colorNode = mix(materialColor, vec3(0.06, 0.08, 0.11), ink);
  plate.metalnessNode = mix(float(0.85), float(0.15), ink);

  // Concrete machine-room floor: dull, a faint mottle, a pool of light under the machine, fading into the stage
  // (see the scene fog).
  const floorMat = standard({ color: new THREE.Color('#1a2130'), roughness: 0.94 });
  const pool = smoothstep(2.4, 0.2, length(positionWorld.xz.sub(vec2(0.25, 0.05))));
  floorMat.colorNode = materialColor.mul(mx_noise_float(positionWorld.xz.mul(5)).mul(0.12).add(0.94)).mul(mix(float(1), float(1.8), pool));

  const all = {
    paint: enamel('#3d5f53'),
    paintDark: enamel('#2e4a40', { roughness: 0.5 }),
    frame: enamel('#262d36', { roughness: 0.72, clearcoat: 0.08, scale: 30 }),
    sheavePaint: enamel('#2c3432', { roughness: 0.46, clearcoat: 0.4 }),
    yellow: enamel('#e0a526', { roughness: 0.34, clearcoat: 0.7 }),
    red: enamel('#b8231b', { roughness: 0.3, clearcoat: 0.8 }),
    steel: steel('#c3c9d0', 0.22),
    spring: steel('#79818a', 0.32),
    machined: turned('#b9c0c7', 0.22, 0.5),
    sheave,
    rope,
    glass: physical({ color: new THREE.Color('#3a2508'), roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }), // oil behind the sight glass
    lining: standard({ color: new THREE.Color('#3b2c24'), roughness: 0.88 }),
    rubber: standard({ color: new THREE.Color('#101113'), roughness: 0.9 }),
    grille,
    plate,
    floor: floorMat,
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
