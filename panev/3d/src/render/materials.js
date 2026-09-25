// Galvanised-steel materials. Group 0 of every part is the zinc coat (faces, bends, bevels), group
// 1 the cut edges. UVs are flat-pattern millimetres, so the baked detail runs continuously over
// the bends as it would on the real sheet. Finishes: bright electro-zinc with a faint blue
// passivation sheen, or duller hot-dip spangle.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, mix, texture, normalMap, materialColor, materialRoughness } from 'three/tsl';

export const FINISHES = {
  electro: { color: 0xcfd4dc, roughness: 0.3, iridescence: 0.12, edge: 0xa9afb7, edgeRough: 0.62 },
  hotdip: { color: 0xb9bec5, roughness: 0.42, iridescence: 0, edge: 0x9aa0a8, edgeRough: 0.7 },
};

// sets: baked texture sets { zinc, edge } (albedo, normal, orm, tile in mm) or null.
export function createMaterials(sets, finishName = 'electro') {
  const f = FINISHES[finishName];
  const zinc = new THREE.MeshPhysicalNodeMaterial({
    name: 'zinc',
    color: f.color,
    metalness: 1,
    roughness: f.roughness,
    iridescence: f.iridescence,
    iridescenceIOR: 1.55,
    iridescenceThicknessRange: [180, 420],
    side: THREE.FrontSide,
  });
  const edge = new THREE.MeshStandardNodeMaterial({ name: 'edge', color: f.edge, metalness: 1, roughness: f.edgeRough });
  if (sets?.zinc) applySet(zinc, sets.zinc, 1);
  if (sets?.edge) applySet(edge, sets.edge, 1);
  return [zinc, edge];
}

// Baked set on a node material: albedo tints the colour, ORM modulates roughness and cavity AO,
// the normal map adds the surface relief. `amount` scales the detail.
function applySet(mat, set, amount) {
  const [tu, tv] = Array.isArray(set.tile) ? set.tile : [set.tile, set.tile];
  const st = uv().div(vec2(tu, tv));
  const a = texture(set.albedo, st);
  const orm = texture(set.orm, st);
  mat.colorNode = materialColor.mul(mix(vec3(1), a.rgb, amount));
  mat.roughnessNode = materialRoughness.mul(mix(float(1), orm.g.mul(2), amount));
  mat.aoNode = mix(float(1), orm.r, amount);
  mat.normalNode = normalMap(texture(set.normal, st), vec2(amount));
}

// Assembly hardware: zinc-plated M10 bolts, nuts, washers and clamps (no UVs, so no baked detail),
// and the counterweight guide rail in bare drawn steel.
export function createHardware(finishName = 'electro') {
  const f = FINISHES[finishName];
  const hw = new THREE.MeshPhysicalNodeMaterial({ name: 'hardware', color: f.color, metalness: 1, roughness: f.roughness + 0.06, iridescence: f.iridescence, iridescenceIOR: 1.55, iridescenceThicknessRange: [180, 420] });
  const rail = new THREE.MeshStandardNodeMaterial({ name: 'rail', color: 0xa4a9b0, metalness: 1, roughness: 0.26 });
  return { hw, rail };
}
