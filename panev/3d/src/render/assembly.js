// Installed assemblies from the catalogue's "abbinamento" pages, in millimetres with the wall on
// z = 0 and the shaft towards +z:
//  · door: B on the wall, A bolted to rib 15 through the joint (19/20) and the lock (21/22);
//    `set(deg)` turns A about the joint bolt — the patent's ±8° / ±7° adjustment (kind 'angle');
//  · guide: SU/SD/SC support, SG guide bracket on its plate and a length of T rail clamped to
//    the SG flange; `set(mm)` slides the SG to put the rail axis that far from the wall along an
//    SU/SD arm (kind 'reach') or that far along the wall on an SC plate (kind 'slide').
import * as THREE from 'three/webgpu';
import { byId } from '../catalog.js';
import { B_SECTIONS, A_LEGS } from '../parts/door.js';
import { SUPPORT_H, armOf } from '../parts/supports.js';
import { SG_FLANGE, STATIONS } from '../parts/guides.js';
import { framedGeometry } from './model.js';
import { fastener } from './fasteners.js';
import { railGeometry, clipGeometry } from './hardware.js';

const WALL = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const PLATFORM = { o: [0, 0, 0], u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0] };
const ALONG_ARM = { o: [0, 0, 0], u: [0, 0, 1], v: [-1, 0, 0], n: [0, 1, 0] };
const ALONG_WALL = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] };
const RAIL = 280; // length of the guide-rail stub shown in the guide assemblies
const X = new THREE.Vector3(1, 0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// Pairings printed in the catalogue (pp. 14-55).
const PAIRS = {};
for (const [a, b] of [['65 170 7', '65 320'], ['45 170 7', '45 320'], ['45 175 2', '45 320'], ['37 150 7', '37 320'], ['37 170 2', '37 320']]) PAIRS[`A ${a}`] = `B ${b}`;
for (const [b, a] of [['65 320', '65 170 7'], ['65 220', '65 170 7'], ['45 320', '45 170 7'], ['45 220', '45 170 7'], ['37 320', '37 150 7'], ['37 220', '37 150 7']]) PAIRS[`B ${b}`] = `A ${a}`;
for (const [lp, sg] of [[160, 150], [180, 170], [200, 190]]) {
  for (const s of ['SU 220', 'SD 150', 'SD 220']) PAIRS[`${s} ${lp}`] = `SG 80 ${sg}`;
}
for (const [w, sgw] of [[50, 50], [60, 60], [80, 80], [90, 80]]) {
  PAIRS[`SC ${w} 200`] = `SG ${sgw} 190`;
  PAIRS[`SC ${w} 220`] = `SG ${sgw} 220`;
}
for (const [sg, sup] of [['SG 80 150', 'SU 220 160'], ['SG 80 170', 'SU 220 180'], ['SG 80 190', 'SU 220 200'], ['SG 50 190', 'SC 50 200'], ['SG 60 190', 'SC 60 200'], ['SG 50 220', 'SC 50 220'], ['SG 60 220', 'SC 60 220'], ['SG 80 220', 'SC 80 220']]) PAIRS[sg] = sup;

export const partnerOf = (item) => (PAIRS[item.code] ? byId(PAIRS[item.code]) : null);

// Adjustment range printed on each guide-support page ("Range regolazione", pp. 20-54), mm.
const RANGES = {
  'SU 220 160': [45, 155], 'SU 220 180': [45, 195], 'SU 220 200': [45, 215],
  'SD 150 160': [45, 155], 'SD 150 180': [45, 195], 'SD 150 200': [45, 215],
  'SD 220 160': [50, 155], 'SD 220 180': [45, 195], 'SD 220 200': [45, 215],
  'SC 50 200': [45, 210], 'SC 60 200': [45, 213], 'SC 80 200': [45, 215], 'SC 90 200': [45, 215],
  'SC 50 220': [45, 235], 'SC 60 220': [45, 235], 'SC 80 220': [45, 255], 'SC 90 220': [45, 235],
};

const mesh = (geo, mats) => {
  const m = new THREE.Mesh(geo, mats);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

// B + A with the two M10 bolts. M = { part: [zinc, edge], hw, rail } materials; `left`: shown
// mirrored (the threads are swept the other way so they still read right-handed).
function doorAssembly(aItem, bItem, M, left) {
  const mats = M.part;
  const hw = M.hw;
  const sec = Number(aItem.code.split(' ')[1]);
  const s = B_SECTIONS[sec];
  const g = A_LEGS[sec];
  const L = Number(bItem.code.split(' ')[2]);
  const group = new THREE.Group();
  group.add(mesh(framedGeometry(bItem, WALL), mats));
  const pivot = new THREE.Vector3(0, L - s.pivot, s.col);
  const turn = new THREE.Group();
  turn.position.copy(pivot);
  group.add(turn);
  const [hx, hy] = g.holes[0];
  const a = mesh(framedGeometry(aItem, PLATFORM), mats);
  a.position.set(-g.t, pivot.y - (g.t - hy), s.col - hx).sub(pivot);
  turn.add(a);
  fastener(group, hw, new THREE.Vector3(-g.t, pivot.y, pivot.z), X, g.t + s.t, { spin: 0.3, left });
  const [lx, ly] = g.holes[1];
  fastener(turn, hw, new THREE.Vector3(-g.t, hy - ly, lx - hx), X, g.t + s.t, { spin: 1.1, left });
  const max = sec === 65 ? 8 : 7;
  const set = (deg) => {
    turn.rotation.x = -THREE.MathUtils.degToRad(Math.max(-max, Math.min(max, deg)));
  };
  set(0);
  return { group, set, range: [-max, max], value: 0, step: 0.5, unit: '°', kind: 'angle' };
}

// Rail with two sliding clips bolted through the SG flange slots. `face` = SG flange outer
// surface point at the rail centre, `out` = unit normal of that face, `along` = rail foot width.
// Built once: the slider re-places the rail and clips many times a second.
let railGeo = null;
let clipGeo = null;

function railOn(parent, M, face, out, along, left) {
  const hw = M.hw;
  railGeo ??= railGeometry(RAIL);
  clipGeo ??= clipGeometry();
  const rail = mesh(railGeo, M.rail);
  const y0 = SUPPORT_H + SG_FLANGE / 2 - RAIL / 2;
  rail.position.copy(face).setY(y0);
  rail.lookAt(rail.position.clone().add(out.clone().negate()));
  parent.add(rail);
  for (const side of [-1, 1]) {
    // Clip axes: x away from the rail, z out of the flange, y along the rail (right-handed).
    const cx = along.clone().multiplyScalar(side);
    const cy = new THREE.Vector3().crossVectors(out, cx);
    const at = face.clone().addScaledVector(along, side * 31).setY(SUPPORT_H + SG_FLANGE / 2);
    const clip = mesh(clipGeo, hw);
    clip.name = 'clip';
    clip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(cx, cy, out));
    clip.position.copy(at);
    parent.add(clip);
    fastener(parent, hw, at.clone().addScaledVector(out, 10), out.clone().negate(), 14, { spin: side, left });
  }
}

// Support + SG + rail. The SG rides on the support plate; the rail sits in an end slot of the SG
// flange, near end for short reaches and the SG turned round (far end) for long ones.
function guideAssembly(supItem, sgItem, M, left) {
  const mats = M.part;
  const hw = M.hw;
  const arm = armOf(supItem.code);
  const [, w, l] = sgItem.code.split(' ').map(Number);
  const st = STATIONS[l];
  const group = new THREE.Group();
  group.add(mesh(framedGeometry(supItem, WALL), mats));
  const moving = new THREE.Group();
  group.add(moving);
  const sc = arm.kind === 'SC';
  const range = RANGES[supItem.code];
  const set = (d) => {
    moving.clear();
    const D = Math.max(range[0], Math.min(range[1], d));
    if (sc) {
      // SG along the wall on the SC plate, flange 2 mm past its edge; rail at x = D.
      const x0 = Math.max(-10, Math.min(arm.L - l + 70, D - l / 2));
      const zf = arm.W + 2;
      const sg = mesh(framedGeometry(sgItem, ALONG_WALL), mats);
      sg.position.set(x0, SUPPORT_H, zf);
      moving.add(sg);
      const zRow = arm.W <= 60 ? arm.W - 22 : arm.W - 35;
      for (const s of [st[1], st[st.length - 2]]) fastener(moving, hw, new THREE.Vector3(x0 + s, SUPPORT_H + 4, zRow), DOWN, 8, { spin: s, left });
      railOn(moving, M, new THREE.Vector3(D, 0, zf), new THREE.Vector3(0, 0, 1), X, left);
    } else {
      // SG along the arm, flange flush with the arm's outer edge; rail at z = D.
      const far = D > (range[0] + range[1]) / 2;
      const z0 = Math.max(10, far ? D + 45 - l : D - 45);
      const xf = arm.x1;
      const sg = mesh(framedGeometry(sgItem, ALONG_ARM), mats);
      sg.position.set(xf, SUPPORT_H, z0);
      moving.add(sg);
      // Bolts through SG stations that sit over the two arm slots (5 mm inside their ends).
      const xc = (arm.x0 + arm.x1) / 2;
      const mid = (arm.Lp + 15) / 2;
      const slots = [[30, mid - 10], [mid + 10, arm.Lp - 15]];
      slots.forEach(([a, b], i) => {
        const z = st.map((s) => z0 + s).find((v) => v >= a && v <= b);
        if (z !== undefined) fastener(moving, hw, new THREE.Vector3(xc, SUPPORT_H + 4, z), DOWN, 9, { spin: i, left });
      });
      railOn(moving, M, new THREE.Vector3(xf, 0, D), X, new THREE.Vector3(0, 0, 1), left);
    }
  };
  const value = sc ? arm.L / 2 : Math.round((range[0] + range[1]) / 2);
  set(value);
  return { group, set, range, value, step: 1, unit: 'mm', kind: sc ? 'slide' : 'reach' };
}

// Assembly for a catalogue item (its catalogue partner), or null when it has none. `left`: it will
// be shown mirrored.
export function assemblyFor(item, M, { left = false } = {}) {
  const partner = partnerOf(item);
  if (!partner) return null;
  if (item.family === 'door') return item.code.startsWith('A') ? doorAssembly(item, partner, M, left) : doorAssembly(partner, item, M, left);
  const [sup, sg] = item.family === 'SG' ? [partner, item] : [item, partner];
  return guideAssembly(sup, sg, M, left);
}
