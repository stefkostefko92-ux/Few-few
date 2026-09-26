// Fasteners and the guide rail for the assembly views, to ISO dimensions (M10): hex bolt ISO 4017
// (full thread, property class 8.8 forged into the head), hex nut ISO 4032, plain washer ISO 7089
// and a T-section counterweight guide rail (its clips are in clip.js). Millimetres, built along +Y
// (bolt axis); every geometry carries normals and UVs in millimetres, so the baked zinc detail
// lies on them at its true scale.
import * as THREE from 'three/webgpu';
import { hexBody, revolve, merge } from './forms.js';
import { externalThread } from './thread.js';
import { classMarking } from './marking.js';

// ISO 4017 / 4032 / 7089, M10: across flats, head height and washer face, nut height, washer.
export const M10 = { s: 16, k: 6.4, c: 0.4, dw: 14.9, m: 8.4, washer: { d1: 10.5, d2: 20, h: 2 } };
const RHO = 1.2; // forged corner radius: across corners about 18.1 mm

// The bolt from its end (y = 0) to the bearing face under the head (y = length), head above. The
// thread runs out 2.2 mm under the head (ISO 4017 allows up to 3P) into the blank diameter.
export function boltGeometry(length, { left = false } = {}) {
  const { s, k, c, dw } = M10;
  const threadTo = length - 2.2;
  const fillet = [];
  for (let i = 0; i <= 6; i++) {
    const phi = Math.PI - (Math.PI / 2) * (i / 6);
    fillet.push({ r: 5.12 + 0.6 * Math.cos(phi), y: length - 0.6 + 0.6 * Math.sin(phi) });
  }
  const underHead = revolve([{ r: 4.52, y: threadTo }, ...fillet, { r: dw / 2, y: length }, { r: dw / 2, y: length + c }], 72, [8]);
  const end = revolve([{ r: 0, y: 0 }, { r: 3.9, y: 0 }], 72);
  const head = hexBody({ s, rho: RHO, height: k - c, top: 7.55, bottomHole: dw / 2 });
  head.translate(0, length + c, 0);
  const mark = classMarking();
  mark.translate(0, length + k, 0);
  const bolt = merge([externalThread({ from: 0, to: threadTo, left }), end, underHead, head, mark]);
  bolt.userData.thread = left ? 'left' : 'right';
  return bolt;
}

// ISO 4032, both faces chamfered, 120° countersinks into the bore; y = 0 is the bearing face.
export function nutGeometry() {
  const { s, m } = M10;
  const cs = 5.4;
  const bore = 4.19;
  const depth = (cs - bore) / Math.tan(Math.PI / 3);
  const body = hexBody({ s, rho: RHO, height: m, top: 7.45, bottom: 7.45, topHole: cs, bottomHole: cs });
  const hole = revolve([{ r: cs, y: m }, { r: bore, y: m - depth }, { r: bore, y: depth }, { r: cs, y: 0 }], 72, [1, 2]);
  return merge([body, hole]);
}

// ISO 7089 punched washer: the punch side (up) rolled over at both edges, the burr side sharp.
export function washerGeometry() {
  const { d1, d2, h } = M10.washer;
  const [ri, ro, e] = [d1 / 2, d2 / 2, 0.28];
  const arc = (cr, cy, from, to) => Array.from({ length: 5 }, (_, i) => {
    const a = from + ((to - from) * i) / 4;
    return { r: cr + e * Math.cos(a), y: cy + e * Math.sin(a) };
  });
  const profile = [{ r: ri, y: 0 }, { r: ro, y: 0 }, ...arc(ro - e, h - e, 0, Math.PI / 2), ...arc(ri + e, h - e, Math.PI / 2, Math.PI), { r: ri, y: 0 }];
  return revolve(profile, 96, [1]);
}

// T-section guide rail (≈ T50): foot 50 x 5, blade 5 thick standing 45 on it, small root
// fillets; `length` along +Y. Foot on z ∈ [0, 5], blade along +z, centred on x = 0.
export function railGeometry(length) {
  const s = new THREE.Shape();
  const f = 1.5;
  s.moveTo(-25, 0);
  s.lineTo(25, 0);
  s.lineTo(25, 5);
  s.lineTo(2.5 + f, 5);
  s.quadraticCurveTo(2.5, 5, 2.5, 5 + f);
  s.lineTo(2.5, 50);
  s.lineTo(-2.5, 50);
  s.lineTo(-2.5, 5 + f);
  s.quadraticCurveTo(-2.5, 5, -2.5 - f, 5);
  s.lineTo(-25, 5);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 2, curveSegments: 16 });
  g.rotateX(-Math.PI / 2);
  return g;
}
