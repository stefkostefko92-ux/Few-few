// Materials of the installation, after the machine's (src/components/machine/materials.ts): node materials with
// procedural detail, nothing to download. The walls on the side of the camera turn into a faint ghost (x-ray), so
// the shaft is seen from any side; each wall has its own material for that. The ropes carry a strand pattern that
// slides with the rope travel (uniform ropeShift), so a slip against the turning sheave shows.
// Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { float, materialColor, mix, mx_noise_float, positionWorld, sin, uniform, uv, vec3 } from 'three/tsl';

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

/** Brushed stainless steel of the car: vertical brushing in the roughness. */
function stainless(): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color('#d3d7db'), metalness: 0.9, roughness: 0.36 });
  const brush = mx_noise_float(vec3(positionWorld.x.mul(420), positionWorld.y.mul(3), positionWorld.z.mul(420)));
  m.roughnessNode = float(0.36).add(brush.mul(0.08));
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
  /** landings outside each side */
  floors: Record<Side, THREE.MeshStandardNodeMaterial>;
  slab: THREE.MeshStandardNodeMaterial;
  roof: THREE.MeshStandardNodeMaterial;
  pit: THREE.MeshStandardNodeMaterial;
  steel: THREE.MeshPhysicalNodeMaterial;
  rail: THREE.MeshPhysicalNodeMaterial;
  car: THREE.MeshPhysicalNodeMaterial;
  carFloor: THREE.MeshStandardNodeMaterial;
  carLight: THREE.MeshBasicNodeMaterial;
  carDoor: THREE.MeshPhysicalNodeMaterial;
  frame: THREE.MeshPhysicalNodeMaterial;
  cwFill: THREE.MeshStandardNodeMaterial;
  base: THREE.MeshStandardNodeMaterial;
  spring: THREE.MeshPhysicalNodeMaterial;
  rubber: THREE.MeshStandardNodeMaterial;
  person: THREE.MeshStandardNodeMaterial;
  panel: THREE.MeshPhysicalNodeMaterial;
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
    landing: byside(() => physical({ color: new THREE.Color('#8d949b'), metalness: 0.85, roughness: 0.36 })),
    floors: byside(() => concrete('#8f8b85')),
    slab: concrete('#8f8b85'),
    roof: concrete('#a09b94'),
    pit: concrete('#6f6c68'),
    steel: physical({ color: new THREE.Color('#34404c'), metalness: 0.35, roughness: 0.55, clearcoat: 0.2 }),
    rail: physical({ color: new THREE.Color('#b8bfc6'), metalness: 1, roughness: 0.26 }),
    car: stainless(),
    carFloor: standard({ color: new THREE.Color('#3b3f45'), roughness: 0.8 }),
    carLight: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#fff4df') }),
    carDoor: physical({ color: new THREE.Color('#b4bac0'), metalness: 0.95, roughness: 0.3 }),
    frame: physical({ color: new THREE.Color('#2a3038'), metalness: 0.5, roughness: 0.5 }),
    cwFill: standard({ color: new THREE.Color('#4a4e53'), metalness: 0.4, roughness: 0.7 }),
    base: standard({ color: new THREE.Color('#d0a638'), roughness: 0.6 }),
    spring: physical({ color: new THREE.Color('#7b838c'), metalness: 1, roughness: 0.34 }),
    rubber: standard({ color: new THREE.Color('#131416'), roughness: 0.9 }),
    person: standard({ color: new THREE.Color('#c9b8a0'), roughness: 0.85 }),
    panel: physical({ color: new THREE.Color('#c8ccd0'), metalness: 0.2, roughness: 0.5, clearcoat: 0.3 }),
    pulley: physical({ color: new THREE.Color('#aab2ba'), metalness: 1, roughness: 0.25 }),
    zoneOk: zone('#2fb36b'),
    zoneBad: zone('#e0453a'),
    ropeCar: rope(ropeShift, 1),
    ropeCw: rope(ropeShift, -1),
  };
  const materials: THREE.Material[] = [
    ...Object.values(all.walls), ...Object.values(all.roomWalls), ...Object.values(all.landing), ...Object.values(all.floors),
    ...Object.values(all).flatMap((m) => (m instanceof THREE.Material ? [m] : [])),
  ];
  return {
    ...all,
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
