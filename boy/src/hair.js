// Cropped hair, beard and brows as shells: the scalp, jaw and brow triangles drawn again in thin
// layers above the skin (one instanced draw that shares the head's vertices and expressions);
// each layer keeps only the cross-sections of the strands that reach it. Strands taper, lean the
// way they are combed and sag a little; the Warden's are shot with grey.
import * as THREE from 'three/webgpu';
import { Fn, attribute, instanceIndex, positionLocal, normalLocal, positionGeometry, varying, float, vec3, mat3, floor, fract, dot, sin, mix, step, length, max, pow, normalize, smoothstep, select, uniform, Discard, If } from 'three/tsl';

export const LAYERS = 14;

// Triangles that grow hair (for the Warden also beard), sharing the head's attributes.
export function shellGeometry(head, { beard }) {
  const r = head.attributes.regionA.array;
  const idx = head.index.array;
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    if (v.some((i) => r[i * 4] > 10 || r[i * 4 + 2] > 10 || (beard && r[i * 4 + 1] > 10))) tris.push(...v);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(new THREE.BufferAttribute(Uint16Array.from(tris), 1));
  for (const [name, a] of Object.entries(head.attributes)) g.setAttribute(name, a);
  g.morphAttributes = head.morphAttributes;
  g.morphTargetsRelative = true;
  g.instanceCount = LAYERS;
  g.boundingSphere = head.boundingSphere;
  return g;
}

const hash = (p, k) => fract(sin(dot(p, vec3(12.9898 + k, 78.233, 37.719 + k * 2.1))).mul(43758.5453));

// Two fixed rotations for the strand cells.
const turn = (x, y, z) => {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z));
  return mat3(...new THREE.Matrix3().setFromMatrix4(m).transpose().elements);
};
const TURN_A = turn(0.61, 0.37, 0.93);
const TURN_B = turn(-0.83, 1.21, 0.27);

// look: { crown, sides (scalp hair above and below `line`, m), beard, brow (lengths, m),
// colour (linear RGB), grey (share of grey strands) }.
export function hairMaterial(id, look) {
  const m = new THREE.MeshStandardNodeMaterial({ name: `hair${id}`, roughness: 0.5, metalness: 0 });
  const live = { wet: uniform(0.55) };
  const layer = varying(float(), 'vShellLayer');
  const strandLen = varying(float(), 'vShellLength');
  m.positionNode = Fn(() => {
    const h = float(instanceIndex).add(1).div(LAYERS);
    const a = attribute('regionA', 'vec4');
    // Scalp: longer on the crown than below the style's line (a bowl cut), else even.
    const crown = smoothstep(look.line - 0.006, look.line + 0.004, positionGeometry.y);
    const len = a.x.mul(mix(float(look.sides), float(look.crown), crown)).add(a.y.mul(look.beard)).add(a.z.mul(look.brow));
    layer.assign(h);
    strandLen.assign(len);
    // Crown hair falls outwards from the whorl, brow hairs lie almost flat towards the temples,
    // beard and stubble lean down; wet hair lies flatter.
    const p = positionLocal;
    const fall = normalize(vec3(p.x, -0.9, p.z.sub(0.01)));
    const comb = mix(mix(vec3(0, -0.7, -0.35), fall, crown.mul(a.x)), vec3(p.x.sign().mul(1.4), 0.25, -0.2), a.z);
    const stand = mix(mix(float(1), float(0.45), crown.mul(a.x)), float(0.3), a.z);
    const lift = len.mul(h).mul(stand).mul(live.wet.mul(-0.35).add(1));
    // Combing and sag slide along the skin, never into it.
    const n = normalLocal;
    const drift = comb.mul(len.mul(h).mul(0.6)).add(vec3(0, -1, 0).mul(len.mul(h.mul(h)).mul(0.3)));
    return p.add(n.mul(lift)).add(drift.sub(n.mul(dot(drift, n))));
  })();
  m.colorNode = Fn(() => {
    const a = attribute('regionA', 'vec4');
    const h = layer;
    // Strand columns from the unmoved base position, two interleaved sets of cells turned off
    // the axes (one strand per ~0.6 mm cell each), so no grid shows through.
    const size = mix(mix(float(1650), float(1150), a.y), float(2300), a.z);
    const strand = (m3, k) => {
      const q = m3.mul(positionGeometry).mul(size);
      const cell = floor(q);
      const d = length(fract(q).sub(vec3(hash(cell, k), hash(cell, k + 1), hash(cell, k + 2)).mul(0.5).add(0.25)));
      return { cell, hit: d.lessThan(pow(h.oneMinus(), 0.7).mul(0.34)).and(h.lessThan(mix(float(0.55), float(1), hash(cell, k + 3)))) };
    };
    const s1 = strand(TURN_A, 0);
    const s2 = strand(TURN_B, 7);
    const density = max(max(a.x, a.y), a.z);
    const cell = select(s1.hit, s1.cell, s2.cell);
    If(s1.hit.or(s2.hit).not().or(hash(cell, 4).greaterThan(density.mul(1.4))).or(strandLen.lessThan(0.0005)), () => {
      Discard();
    });
    const grey = step(float(1 - look.grey), hash(cell, 5));
    const tone = hash(cell, 6).mul(0.3).add(0.85);
    const col = mix(vec3(...look.colour), vec3(0.34, 0.33, 0.32), grey).mul(tone).mul(h.mul(0.45).add(0.55));
    return col.mul(live.wet.mul(0.25).oneMinus());
  })();
  m.roughnessNode = mix(float(0.55), float(0.32), live.wet);
  return { material: m, live };
}
