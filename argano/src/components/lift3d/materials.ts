// Materials of the installation, after the machine's (src/components/machine/materials.ts): node materials with
// procedural detail, nothing to download. The walls on the side of the camera turn into a faint ghost (x-ray), so
// the shaft is seen from any side; each wall has its own material for that. The ropes carry a strand pattern that
// slides with the rope travel (uniform ropeShift), so a slip against the turning sheave shows. The car: brushed
// stainless inside on a galvanized shell, a polished granite floor, a mirror, aluminium sills and trims.
// Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { float, fract, materialColor, materialRoughness, mix, mx_noise_float, positionWorld, sin, smoothstep, step, uniform, uv, vec3 } from 'three/tsl';

const TAU = Math.PI * 2;
export type Side = 'front' | 'rear' | 'left' | 'right';
export const SIDES: readonly Side[] = ['front', 'rear', 'left', 'right'];

const standard = (p: THREE.MeshStandardNodeMaterialParameters) => new THREE.MeshStandardNodeMaterial(p);
const physical = (p: THREE.MeshPhysicalNodeMaterialParameters) => new THREE.MeshPhysicalNodeMaterial(p);

/** Cast concrete: a broad mottle and a fine grain. */
function concrete(hex: string): THREE.MeshStandardNodeMaterial {
  const m = standard({ color: new THREE.Color(hex), roughness: 0.93 });
  const broad = mx_noise_float(positionWorld.mul(2.4)).mul(0.5).add(0.5), fine = mx_noise_float(positionWorld.mul(21)).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(broad.mul(0.1).add(fine.mul(0.05)).add(0.9));
  return m;
}

/** Brushed stainless steel of the car and the doors: vertical brushing in the roughness. */
function stainless(hex = '#d3d7db'): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color(hex), metalness: 0.9, roughness: 0.36 });
  const brush = mx_noise_float(vec3(positionWorld.x.mul(420), positionWorld.y.mul(3), positionWorld.z.mul(420)));
  m.roughnessNode = float(0.36).add(brush.mul(0.08));
  return m;
}

/** Hot-dip galvanized sheet: the spangle shows as a patchy tone and sheen. */
function galvanized(hex: string): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color(hex), metalness: 0.75, roughness: 0.42 });
  const spangle = mx_noise_float(positionWorld.mul(130)).mul(0.5).add(0.5), broad = mx_noise_float(positionWorld.mul(1.2)).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(spangle.mul(0.035).add(broad.mul(0.03)).add(0.95));
  m.roughnessNode = materialRoughness.mul(spangle.mul(0.18).add(0.92));
  return m;
}

/** Stone tiles of the landings: 600 mm squares with their joints, a faint veining. */
function tiles(hex: string): THREE.MeshStandardNodeMaterial {
  const m = standard({ color: new THREE.Color(hex), roughness: 0.45 });
  const joint = (x: THREE.Node<'float'>) => step(0.985, fract(x.div(0.6)));
  const vein = mx_noise_float(positionWorld.mul(4)).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(vein.mul(0.08).add(0.94)).mul(float(1).sub(joint(positionWorld.x).add(joint(positionWorld.z)).min(1).mul(0.35)));
  return m;
}

/** Polished granite: a dark ground with light and black grains, a soft reflection. */
function granite(): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color('#3b3e43'), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  const p = positionWorld.mul(90), a = mx_noise_float(p), b = mx_noise_float(p.mul(1.9).add(7.3));
  const light = smoothstep(0.42, 0.62, a), dark = smoothstep(0.45, 0.7, b);
  m.colorNode = mix(mix(materialColor, vec3(0.62, 0.63, 0.65), light.mul(0.55)), vec3(0.06, 0.06, 0.07), dark.mul(0.6));
  return m;
}

/** Hazard paint: yellow and black stripes at 45° (buffer pedestals, the edges a body can strike). */
function hazard(): THREE.MeshStandardNodeMaterial {
  const m = standard({ color: new THREE.Color('#d9a62b'), roughness: 0.55 });
  const band = step(0.5, fract(positionWorld.x.add(positionWorld.y).add(positionWorld.z).mul(7)));
  m.colorNode = mix(materialColor, vec3(0.03, 0.03, 0.035), band);
  return m;
}

/** Perforated galvanized sheet: square holes on a 40 mm pitch, cut by the alpha test. */
function perforated(): THREE.MeshStandardNodeMaterial {
  const m = standard({ color: new THREE.Color('#aab0b6'), metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide, alphaTest: 0.5 });
  const hole = (x: THREE.Node<'float'>) => step(0.22, fract(x.mul(25))).mul(step(fract(x.mul(25)), 0.78));
  m.opacityNode = float(1).sub(hole(positionWorld.x.add(positionWorld.z)).mul(hole(positionWorld.y)));
  return m;
}

/** The lit face of a lamp, brighter than white so it still reads as a light after the tone mapping. */
function lamp(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#fff4df') });
  m.colorNode = materialColor.mul(4);
  return m;
}

const shiftUniform = () => uniform(0);
type Shift = ReturnType<typeof shiftUniform>;

/** Steel ropes: eight strands laid with a pitch of 65 mm, sliding along with the rope. */
function rope(shift: Shift, sign: 1 | -1): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color('#a4abb3'), metalness: 1, roughness: 0.42 });
  const along = (sign > 0 ? positionWorld.y.sub(shift) : positionWorld.y.add(shift)).div(0.065);
  const lay = sin(uv().y.mul(TAU * 8).add(along.mul(TAU))).mul(0.5).add(0.5).pow(0.6);
  m.colorNode = materialColor.mul(mix(float(0.36), float(1.05), lay));
  m.roughnessNode = mix(float(0.62), float(0.3), lay);
  return m;
}

export interface LiftMaterials {
  walls: Record<Side, THREE.MeshStandardNodeMaterial>;
  roomWalls: Record<Side, THREE.MeshStandardNodeMaterial>;
  landing: Record<Side, THREE.MeshPhysicalNodeMaterial>;
  /** landings outside each side: stone tiles */
  floors: Record<Side, THREE.MeshStandardNodeMaterial>;
  slab: THREE.MeshStandardNodeMaterial;
  roof: THREE.MeshStandardNodeMaterial;
  pit: THREE.MeshStandardNodeMaterial;
  steel: THREE.MeshPhysicalNodeMaterial;
  rail: THREE.MeshPhysicalNodeMaterial;
  car: THREE.MeshPhysicalNodeMaterial;
  /** lit faces of the lamps */
  carLight: THREE.MeshBasicNodeMaterial;
  carDoor: THREE.MeshPhysicalNodeMaterial;
  frame: THREE.MeshPhysicalNodeMaterial;
  cwFill: THREE.MeshStandardNodeMaterial;
  base: THREE.MeshStandardNodeMaterial;
  spring: THREE.MeshPhysicalNodeMaterial;
  rubber: THREE.MeshStandardNodeMaterial;
  /** people: clothes and skin, tinted per person (instance colours) */
  person: THREE.MeshStandardNodeMaterial;
  skin: THREE.MeshStandardNodeMaterial;
  panel: THREE.MeshPhysicalNodeMaterial;
  /** car shell, roof, apron, brackets: galvanized sheet */
  galv: THREE.MeshPhysicalNodeMaterial;
  /** sills, trims, skirting, door track: the rails' bright steel */
  alu: THREE.MeshPhysicalNodeMaterial;
  /** handrail, operating panel, buttons: polished like the mirror */
  chrome: THREE.MeshPhysicalNodeMaterial;
  mirror: THREE.MeshPhysicalNodeMaterial;
  stone: THREE.MeshPhysicalNodeMaterial;
  /** the car's ceiling: the panel's satin finish */
  ceiling: THREE.MeshPhysicalNodeMaterial;
  /** dark glass of the displays, black parts */
  glass: THREE.MeshPhysicalNodeMaterial;
  /** oil cups of the guide shoes: the yellow of the fittings */
  oil: THREE.MeshStandardNodeMaterial;
  /** stop buttons */
  red: THREE.MeshStandardNodeMaterial;
  /** buffer pedestals */
  hazard: THREE.MeshStandardNodeMaterial;
  /** the counterweight's screen in the pit: perforated sheet */
  screen: THREE.MeshStandardNodeMaterial;
  /** lit button rings */
  led: THREE.MeshBasicNodeMaterial;
  pulley: THREE.MeshPhysicalNodeMaterial;
  zoneOk: THREE.MeshBasicNodeMaterial;
  zoneBad: THREE.MeshBasicNodeMaterial;
  ropeCar: THREE.MeshPhysicalNodeMaterial;
  ropeCw: THREE.MeshPhysicalNodeMaterial;
  /** rope travel [m]: the car side moves with it, the counterweight side against it */
  ropeShift: Shift;
  /** faint (true) or solid; returns whether it changed */
  ghost(m: THREE.Material, faint: boolean, opacity?: number): boolean;
  dispose(): void;
}

const byside = <T,>(make: () => T): Record<Side, T> => ({ front: make(), rear: make(), left: make(), right: make() });

export function createLiftMaterials(): LiftMaterials {
  const ropeShift = shiftUniform();
  const zone = (hex: string) => new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(hex), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const all = {
    walls: byside(() => concrete('#9b9791')),
    roomWalls: byside(() => concrete('#aaa59d')),
    landing: byside(() => stainless('#b9bfc5')),
    floors: byside(() => tiles('#b9b3aa')),
    slab: concrete('#8f8b85'),
    roof: concrete('#a09b94'),
    pit: concrete('#6f6c68'),
    steel: physical({ color: new THREE.Color('#34404c'), metalness: 0.35, roughness: 0.55, clearcoat: 0.2 }),
    rail: physical({ color: new THREE.Color('#b8bfc6'), metalness: 1, roughness: 0.26 }),
    car: stainless(),
    carLight: lamp(),
    carDoor: stainless('#c9ced3'),
    frame: physical({ color: new THREE.Color('#2a3038'), metalness: 0.5, roughness: 0.5 }),
    cwFill: standard({ color: new THREE.Color('#4a4e53'), metalness: 0.4, roughness: 0.7 }),
    base: standard({ color: new THREE.Color('#d0a638'), roughness: 0.6 }),
    spring: physical({ color: new THREE.Color('#7b838c'), metalness: 1, roughness: 0.34 }),
    rubber: standard({ color: new THREE.Color('#131416'), roughness: 0.9 }),
    person: standard({ color: new THREE.Color('#ffffff'), roughness: 0.82 }),
    galv: galvanized('#b4bac0'),
    mirror: physical({ color: new THREE.Color('#eef1f4'), metalness: 1, roughness: 0.03 }),
    stone: granite(),
    glass: physical({ color: new THREE.Color('#0c0f13'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    red: standard({ color: new THREE.Color('#c4291f'), roughness: 0.4 }),
    hazard: hazard(),
    screen: perforated(),
    led: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#79c2ff') }),
    panel: physical({ color: new THREE.Color('#c8ccd0'), metalness: 0.2, roughness: 0.5, clearcoat: 0.3 }),
    pulley: physical({ color: new THREE.Color('#aab2ba'), metalness: 1, roughness: 0.25 }),
    zoneOk: zone('#2fb36b'),
    zoneBad: zone('#e0453a'),
    ropeCar: rope(ropeShift, 1),
    ropeCw: rope(ropeShift, -1),
  };
  // the same finish under another name: no extra shader to build
  const aliases = { skin: all.person, alu: all.rail, chrome: all.mirror, ceiling: all.panel, oil: all.base };
  const materials: THREE.Material[] = [
    ...Object.values(all.walls), ...Object.values(all.roomWalls), ...Object.values(all.landing), ...Object.values(all.floors),
    ...Object.values(all).flatMap((m) => (m instanceof THREE.Material ? [m] : [])),
  ];
  return {
    ...all,
    ...aliases,
    ropeShift,
    ghost(m, faint, opacity = 0.12) {
      if (m.transparent === faint) return false;
      m.transparent = faint;
      m.opacity = faint ? opacity : 1;
      m.depthWrite = !faint;
      m.needsUpdate = true;
      return true;
    },
    dispose() {
      for (const m of materials) m.dispose();
    },
  };
}
