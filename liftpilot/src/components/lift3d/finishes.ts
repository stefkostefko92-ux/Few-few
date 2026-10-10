// The finishes of the installation: node materials with procedural detail, nothing to download. Brushed and machined
// metal carry anisotropy across their marks (the highlight stretches across the grain), the rails a thin oil film,
// concrete the grime that settles toward the pit. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { float, fract, materialColor, materialRoughness, mix, mx_noise_float, positionWorld, sin, smoothstep, step, uniform, uv, vec2, vec3 } from 'three/tsl';

const TAU = Math.PI * 2;
export const standard = (p: THREE.MeshStandardNodeMaterialParameters) => new THREE.MeshStandardNodeMaterial(p);
export const physical = (p: THREE.MeshPhysicalNodeMaterialParameters) => new THREE.MeshPhysicalNodeMaterial(p);

/** Cast concrete: a broad mottle, a fine grain, faint run-down streaks; darker toward the pit floor at `pit` [m]. */
export function concrete(hex: string, pit: number | null = null): THREE.MeshStandardNodeMaterial {
  const m = standard({ color: new THREE.Color(hex), roughness: 0.93 });
  const broad = mx_noise_float(positionWorld.mul(2.4)).mul(0.5).add(0.5), fine = mx_noise_float(positionWorld.mul(21)).mul(0.5).add(0.5);
  const streak = mx_noise_float(vec3(positionWorld.x.mul(9), positionWorld.y.mul(0.35), positionWorld.z.mul(9))).mul(0.5).add(0.5);
  const tone = broad.mul(0.1).add(fine.mul(0.05)).add(streak.mul(0.05)).add(0.87);
  m.colorNode = pit === null ? materialColor.mul(tone) : materialColor.mul(tone).mul(mix(float(0.7), float(1), smoothstep(pit, pit + 1.1, positionWorld.y)));
  return m;
}

/** Brushed stainless steel of the car and the doors: vertical grain in the roughness and the tone, the highlight
 *  stretched across it (box faces: u runs across the grain). */
export function stainless(hex = '#d3d7db'): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color(hex), metalness: 0.92, roughness: 0.3 });
  const brush = mx_noise_float(vec3(positionWorld.x.mul(420), positionWorld.y.mul(3), positionWorld.z.mul(420)));
  m.roughnessNode = float(0.3).add(brush.mul(0.08));
  m.colorNode = materialColor.mul(brush.mul(0.03).add(1));
  m.anisotropyNode = vec2(0.55, 0);
  return m;
}

/** Machined rail blade: bright steel with the planing marks along the rail (the highlight across them) under a thin,
 *  streaky film of oil. */
export function machined(hex: string, roughness: number, anisotropy: number): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color(hex), metalness: 1, roughness, clearcoat: 0.35, clearcoatRoughness: 0.18 });
  const oil = mx_noise_float(vec3(positionWorld.x.mul(60), positionWorld.y.mul(0.7), positionWorld.z.mul(60))).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(mix(float(0.78), float(1.02), smoothstep(0.25, 0.75, oil)));
  m.roughnessNode = materialRoughness.mul(mix(float(0.75), float(1.15), oil));
  m.anisotropyNode = vec2(anisotropy, 0);
  return m;
}

/** Hot-rolled steel under its mill scale: dark blue-grey, patchy, dull (the rails' feet, the rolled rails). */
export function millScale(hex: string): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color(hex), metalness: 0.55, roughness: 0.6 });
  const patch = mx_noise_float(positionWorld.mul(7)).mul(0.5).add(0.5), grain = mx_noise_float(positionWorld.mul(90)).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(patch.mul(0.18).add(grain.mul(0.06)).add(0.86));
  m.roughnessNode = materialRoughness.mul(patch.mul(0.25).add(0.88));
  return m;
}

/** Extruded aluminium (sills, tracks): satin, the die lines along the extrusion (u runs across them). */
export function aluminium(hex: string): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color(hex), metalness: 1, roughness: 0.34 });
  const lines = mx_noise_float(positionWorld.mul(160)).mul(0.5).add(0.5);
  m.roughnessNode = materialRoughness.mul(lines.mul(0.2).add(0.9));
  m.anisotropyNode = vec2(0.5, 0);
  return m;
}

/** Hot-dip galvanized sheet: the spangle shows as a patchy tone and sheen. */
export function galvanized(hex: string): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color(hex), metalness: 0.75, roughness: 0.42 });
  const spangle = mx_noise_float(positionWorld.mul(130)).mul(0.5).add(0.5), broad = mx_noise_float(positionWorld.mul(1.2)).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(spangle.mul(0.035).add(broad.mul(0.03)).add(0.95));
  m.roughnessNode = materialRoughness.mul(spangle.mul(0.18).add(0.92));
  return m;
}

/** Electro-galvanized sheet under its clear passivation (the brackets of Panev's catalogue and their fasteners):
 *  bright zinc, the film's thin-layer play varying in broad patches, fine rolling lines. */
export function electroZinc(hex: string): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color(hex), metalness: 1, roughness: 0.3, iridescence: 0.12, iridescenceIOR: 1.55, iridescenceThicknessRange: [250, 330] });
  const patch = mx_noise_float(positionWorld.mul(8)).mul(0.5).add(0.5);
  const lines = mx_noise_float(vec3(positionWorld.x.mul(380), positionWorld.y.mul(380), positionWorld.z.mul(6))).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(patch.mul(0.05).add(0.96));
  m.roughnessNode = materialRoughness.mul(lines.mul(0.18).add(0.92));
  m.iridescenceThicknessNode = mix(float(250), float(330), patch);
  return m;
}

/** Stone tiles of the landings: 600 mm squares with their joints, a faint veining. */
export function tiles(hex: string): THREE.MeshStandardNodeMaterial {
  const m = standard({ color: new THREE.Color(hex), roughness: 0.45 });
  const joint = (x: THREE.Node<'float'>) => step(0.985, fract(x.div(0.6)));
  const vein = mx_noise_float(positionWorld.mul(4)).mul(0.5).add(0.5);
  m.colorNode = materialColor.mul(vein.mul(0.08).add(0.94)).mul(float(1).sub(joint(positionWorld.x).add(joint(positionWorld.z)).min(1).mul(0.35)));
  return m;
}

/** Polished granite: a dark ground with light and black grains, a soft reflection. */
export function granite(): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color('#3b3e43'), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  const p = positionWorld.mul(90), a = mx_noise_float(p), b = mx_noise_float(p.mul(1.9).add(7.3));
  const light = smoothstep(0.42, 0.62, a), dark = smoothstep(0.45, 0.7, b);
  m.colorNode = mix(mix(materialColor, vec3(0.62, 0.63, 0.65), light.mul(0.55)), vec3(0.06, 0.06, 0.07), dark.mul(0.6));
  return m;
}

/** Hazard paint: yellow and black stripes at 45° (buffer pedestals, the edges a body can strike). */
export function hazard(): THREE.MeshStandardNodeMaterial {
  const m = standard({ color: new THREE.Color('#d9a62b'), roughness: 0.55 });
  const band = step(0.5, fract(positionWorld.x.add(positionWorld.y).add(positionWorld.z).mul(7)));
  m.colorNode = mix(materialColor, vec3(0.03, 0.03, 0.035), band);
  return m;
}

/** Perforated galvanized sheet: square holes on a 40 mm pitch, cut by the alpha test. */
export function perforated(): THREE.MeshStandardNodeMaterial {
  const m = standard({ color: new THREE.Color('#aab0b6'), metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide, alphaTest: 0.5 });
  const hole = (x: THREE.Node<'float'>) => step(0.22, fract(x.mul(25))).mul(step(fract(x.mul(25)), 0.78));
  m.opacityNode = float(1).sub(hole(positionWorld.x.add(positionWorld.z)).mul(hole(positionWorld.y)));
  return m;
}

/** The lit face of a lamp, brighter than white so it still reads as a light after the tone mapping. */
export function lamp(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#fff4df') });
  m.colorNode = materialColor.mul(4);
  return m;
}

export const shiftUniform = () => uniform(0);
export type Shift = ReturnType<typeof shiftUniform>;

/** Steel ropes: eight strands laid with a pitch of 65 mm, sliding along with the rope. */
export function rope(shift: Shift, sign: 1 | -1): THREE.MeshPhysicalNodeMaterial {
  const m = physical({ color: new THREE.Color('#a4abb3'), metalness: 1, roughness: 0.42 });
  const along = (sign > 0 ? positionWorld.y.sub(shift) : positionWorld.y.add(shift)).div(0.065);
  const lay = sin(uv().y.mul(TAU * 8).add(along.mul(TAU))).mul(0.5).add(0.5).pow(0.6);
  m.colorNode = materialColor.mul(mix(float(0.36), float(1.05), lay));
  m.roughnessNode = mix(float(0.62), float(0.3), lay);
  return m;
}
