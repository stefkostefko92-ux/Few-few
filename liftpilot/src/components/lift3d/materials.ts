// Materials of the installation, after the machine's (src/components/machine/materials.ts): node materials with
// procedural detail, nothing to download. The walls on the side of the camera turn into a faint ghost (x-ray), so
// the shaft is seen from any side; each wall has its own material for that. The ropes carry a strand pattern that
// slides with the rope travel (uniform ropeShift), so a slip against the turning sheave shows. The car: brushed
// stainless inside on a galvanized shell, a polished granite floor, a mirror, aluminium sills and trims.
// Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { aluminium, concrete, electroZinc, galvanized, granite, hazard, lamp, machined, millScale, perforated, physical, rope, shiftUniform, stainless, standard, tiles, type Shift } from './finishes';
export type Side = 'front' | 'rear' | 'left' | 'right';
export const SIDES: readonly Side[] = ['front', 'rear', 'left', 'right'];

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
  /** bright steel: pulleys' axles, rods */
  rail: THREE.MeshPhysicalNodeMaterial;
  /** guide rails: machined blade (/B), cold-drawn profile (/A), the rolled foot and the rolled rails */
  railBlade: THREE.MeshPhysicalNodeMaterial;
  railDrawn: THREE.MeshPhysicalNodeMaterial;
  railFoot: THREE.MeshPhysicalNodeMaterial;
  /** polyurethane tyres of the door rollers */
  roller: THREE.MeshStandardNodeMaterial;
  car: THREE.MeshPhysicalNodeMaterial;
  /** lit faces of the lamps */
  carLight: THREE.MeshBasicNodeMaterial;
  carDoor: THREE.MeshPhysicalNodeMaterial;
  frame: THREE.MeshPhysicalNodeMaterial;
  cwFill: THREE.MeshStandardNodeMaterial;
  base: THREE.MeshStandardNodeMaterial;
  spring: THREE.MeshPhysicalNodeMaterial;
  rubber: THREE.MeshStandardNodeMaterial;
  /** polyurethane buffer pads (cellular, matt yellow) */
  pu: THREE.MeshStandardNodeMaterial;
  /** people: clothes and skin, tinted per person (instance colours) */
  person: THREE.MeshStandardNodeMaterial;
  skin: THREE.MeshStandardNodeMaterial;
  panel: THREE.MeshPhysicalNodeMaterial;
  /** car shell, roof, apron, brackets: galvanized sheet */
  galv: THREE.MeshPhysicalNodeMaterial;
  /** extruded aluminium: sills, trims, skirting, door tracks */
  alu: THREE.MeshPhysicalNodeMaterial;
  /** Panev's brackets and their fasteners: electro-galvanized; their laser-cut edges, bare steel */
  zinc: THREE.MeshPhysicalNodeMaterial;
  cut: THREE.MeshStandardNodeMaterial;
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

/** `pit`: height of the pit floor [m], toward which the shaft's concrete darkens. */
export function createLiftMaterials(pit: number | null = null): LiftMaterials {
  const ropeShift = shiftUniform();
  const zone = (hex: string) => new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(hex), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const all = {
    walls: byside(() => concrete('#9b9791', pit)),
    roomWalls: byside(() => concrete('#aaa59d')),
    landing: byside(() => stainless('#b9bfc5')),
    floors: byside(() => tiles('#b9b3aa')),
    slab: concrete('#8f8b85'),
    roof: concrete('#a09b94'),
    pit: concrete('#6f6c68', pit),
    steel: physical({ color: new THREE.Color('#34404c'), metalness: 0.35, roughness: 0.55, clearcoat: 0.2 }),
    rail: physical({ color: new THREE.Color('#b8bfc6'), metalness: 1, roughness: 0.26 }),
    railBlade: machined('#c3c9cf', 0.2, 0.75),
    railDrawn: machined('#a9b0b7', 0.3, 0.45),
    railFoot: millScale('#3d434a'),
    roller: standard({ color: new THREE.Color('#1b1d20'), roughness: 0.42 }),
    alu: aluminium('#c4c9ce'),
    zinc: electroZinc('#d2d7de'),
    cut: standard({ color: new THREE.Color('#a9afb7'), metalness: 1, roughness: 0.62 }),
    car: stainless(),
    carLight: lamp(),
    carDoor: stainless('#c9ced3'),
    frame: physical({ color: new THREE.Color('#2a3038'), metalness: 0.5, roughness: 0.5 }),
    cwFill: standard({ color: new THREE.Color('#4a4e53'), metalness: 0.4, roughness: 0.7 }),
    base: standard({ color: new THREE.Color('#d0a638'), roughness: 0.6 }),
    spring: physical({ color: new THREE.Color('#7b838c'), metalness: 1, roughness: 0.34 }),
    rubber: standard({ color: new THREE.Color('#131416'), roughness: 0.9 }),
    pu: standard({ color: new THREE.Color('#d6a21e'), roughness: 0.78 }),
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
  const aliases = { skin: all.person, chrome: all.mirror, ceiling: all.panel, oil: all.base };
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
