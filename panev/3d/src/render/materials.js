// Galvanised-steel materials. Group 0 of every part is the zinc coat (faces, bends, bevels), group
// 1 the cut edges. UVs are flat-pattern millimetres, so the baked detail runs continuously over
// the bends as it would on the real sheet. Finishes:
//  · electro — bright zinc with a clear (blue) passivation: a thin film whose thickness varies in
//    broad patches (baked), the laser-cut edges bare steel;
//  · hotdip — dipped after cutting: duller, spangled grains, the edges coated too, no film play.
// The fasteners are zinc-plated to match, with the same baked detail at a finer scale; the rail
// clips' forged heads have their own pebbled grain (set `forged`, loaded with the first assembly).
import * as THREE from 'three/webgpu';
import { uv, vec2, float, mix, texture, normalMap, materialColor, materialRoughness } from 'three/tsl';

export const FINISHES = {
  electro: {
    set: 'zinc', edgeSet: 'edge', color: 0xd2d7de, roughness: 0.3, iridescence: 0.12, film: [250, 330], edge: 0xa9afb7, edgeRough: 0.62,
    hw: { color: 0xd9dee6, roughness: 0.24, iridescence: 0.18, scale: 2.5 },
    forged: { color: 0xc9ced6, roughness: 0.38, iridescence: 0.12 },
  },
  hotdip: {
    set: 'spangle', edgeSet: 'spangle', color: 0xb7bcc3, roughness: 0.42, iridescence: 0, film: [200, 460], edge: 0xaeb3ba, edgeRough: 0.55,
    // Hot-dip bolts are spun after the bath: no spangle to see, only a fine matte grain.
    hw: { color: 0xa9aeb5, roughness: 0.5, iridescence: 0, scale: 10 },
    forged: { color: 0xa4a9b0, roughness: 0.55, iridescence: 0 },
  },
};

// sets: baked texture sets by name { albedo, normal, orm, tile in mm } (see textures.js) or null.
export function createMaterials(sets, finishName = 'electro') {
  const f = FINISHES[finishName];
  const zinc = new THREE.MeshPhysicalNodeMaterial({
    name: 'zinc',
    color: f.color,
    metalness: 1,
    roughness: f.roughness,
    iridescence: f.iridescence,
    iridescenceIOR: 1.55,
    iridescenceThicknessRange: f.film,
    side: THREE.FrontSide,
  });
  const edge = new THREE.MeshStandardNodeMaterial({ name: 'edge', color: f.edge, metalness: 1, roughness: f.edgeRough });
  if (sets?.[f.set]) applySet(zinc, sets[f.set], { film: f.iridescence > 0 ? f.film : null });
  if (sets?.[f.edgeSet]) applySet(edge, sets[f.edgeSet]);
  return [zinc, edge];
}

// Baked set on a node material: albedo tints the colour, ORM modulates roughness and cavity AO
// (and, in its blue channel, the passivation film's thickness), the normal map adds the relief.
// `scale` shrinks the detail (fasteners), `swap` turns it a quarter (lines along v).
function applySet(mat, set, { scale = 1, swap = false, film = null } = {}) {
  const [tu, tv] = Array.isArray(set.tile) ? set.tile : [set.tile, set.tile];
  const base = swap ? uv().yx : uv();
  const st = base.mul(scale).div(vec2(tu, tv));
  const orm = texture(set.orm, st);
  mat.colorNode = materialColor.mul(texture(set.albedo, st).rgb);
  mat.roughnessNode = materialRoughness.mul(orm.g.mul(2));
  mat.aoNode = orm.r;
  mat.normalNode = normalMap(texture(set.normal, st));
  if (film) mat.iridescenceThicknessNode = mix(float(film[0]), float(film[1]), orm.b);
}

// The rail clips' forged heads (their shanks take the bolts' material).
export function createForged(finishName = 'electro', sets = null) {
  const f = FINISHES[finishName];
  const m = new THREE.MeshPhysicalNodeMaterial({
    name: 'forged',
    color: f.forged.color,
    metalness: 1,
    roughness: f.forged.roughness,
    iridescence: f.forged.iridescence,
    iridescenceIOR: 1.55,
    iridescenceThicknessRange: f.film,
  });
  if (sets?.forged) applySet(m, sets.forged, { film: f.forged.iridescence > 0 ? f.film : null });
  return m;
}

// Assembly hardware: zinc-plated M10 bolts, nuts, washers and the clips' shanks, the clips' heads
// (`forged`); and the counterweight guide rail in bright drawn steel, its drawing lines along it.
export function createHardware(finishName = 'electro', sets = null) {
  const f = FINISHES[finishName];
  const hw = new THREE.MeshPhysicalNodeMaterial({
    name: 'hardware',
    color: f.hw.color,
    metalness: 1,
    roughness: f.hw.roughness,
    iridescence: f.hw.iridescence,
    iridescenceIOR: 1.55,
    iridescenceThicknessRange: f.film,
  });
  if (sets?.[f.set]) applySet(hw, sets[f.set], { scale: f.hw.scale, film: f.hw.iridescence > 0 ? f.film : null });
  const rail = new THREE.MeshStandardNodeMaterial({ name: 'rail', color: 0x9fa5ac, metalness: 1, roughness: 0.3 });
  if (sets?.zinc) applySet(rail, sets.zinc, { swap: true });
  return { hw, rail, forged: createForged(finishName, sets) };
}
