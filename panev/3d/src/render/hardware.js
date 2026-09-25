// Fasteners and the guide rail for the assembly views: M10 hex bolts (DIN 933 proportions), nuts,
// washers, a T-section counterweight guide rail and the clamp plates that hold its foot. Built
// in millimetres along +Y (bolt axis) and returned as geometries for the shared materials.
import * as THREE from 'three/webgpu';

const hexPrism = (af, h, chamfer) => {
  // Hexagon across flats `af`, height h, with the 30° chamfer of a real head on the top edge.
  const r = af / Math.sqrt(3);
  const pts = [];
  pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h - chamfer), new THREE.Vector2(af / 2 - 0.2, h), new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pts, 6);
  g.rotateY(Math.PI / 6);
  return g.toNonIndexed();
};

export function boltGeometry(length, { d = 10, af = 16, head = 6.4 } = {}) {
  const headG = hexPrism(af, head, 0.9);
  headG.computeVertexNormals();
  headG.translate(0, length, 0);
  const shank = new THREE.CylinderGeometry(d / 2 - 0.15, d / 2 - 0.15, length, 32, 1, true);
  shank.translate(0, length / 2, 0);
  const tipG = new THREE.CylinderGeometry(d / 2 - 0.15, d / 2 - 1, 1, 32);
  tipG.translate(0, -0.5, 0);
  return merge([headG, shank.toNonIndexed(), tipG.toNonIndexed()]);
}

export function nutGeometry({ af = 16, h = 8, d = 10 } = {}) {
  const r = af / Math.sqrt(3);
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (i === 0) shape.moveTo(r * Math.cos(a), r * Math.sin(a));
    else shape.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, d / 2 - 0.4, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export function washerGeometry({ od = 20, id = 10.5, t = 2 } = {}) {
  const pts = [new THREE.Vector2(id / 2, 0), new THREE.Vector2(od / 2 - 0.3, 0), new THREE.Vector2(od / 2, 0.3), new THREE.Vector2(od / 2, t - 0.3), new THREE.Vector2(od / 2 - 0.3, t), new THREE.Vector2(id / 2, t), new THREE.Vector2(id / 2, 0)];
  return new THREE.LatheGeometry(pts, 40).toNonIndexed();
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
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  return g;
}

// Clamp plate pressing the rail foot against the guide bracket.
export function clampGeometry() {
  const g = new THREE.BoxGeometry(22, 5, 40, 1, 1, 1);
  g.translate(0, 2.5, 0);
  return g;
}

function merge(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
