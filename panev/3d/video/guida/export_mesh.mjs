// Meshes for the counterweight-guide video: SU 220 160 + SG 80 150 as the site builds them, the SX assembly (as drawn)
// and the DX one (its mirror, threads swept left so they read right-handed), at the final reach REACH. Millimetres,
// three.js axes: x along the wall, y up, z out of the wall (wall face z = 0). Every part on its own with a tag; the
// fasteners as frames only (the video stacks its own washers, growers and nuts on them); a 5 m T50 rail and spare
// M10 hardware at the origin. Internal working files only (geometry never leaves).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// node video/guida/export_mesh.mjs [out dir] — from panev/3d after `npm ci`; writes guida.bin + guida.json.
const SRC = new URL('../../src/', import.meta.url);
const THREE = await import(new URL('../../node_modules/three/build/three.webgpu.js', import.meta.url).href);
const { byId } = await import(new URL('catalog.js', SRC).href);
const { assemblyFor } = await import(new URL('render/assembly.js', SRC).href);
const { armOf, SUPPORT_H } = await import(new URL('parts/supports.js', SRC).href);
const { SG_FLANGE, SG_T } = await import(new URL('parts/guides.js', SRC).href);
const { clipGeometry, N1 } = await import(new URL('render/clip.js', SRC).href);
const { boltGeometry, nutGeometry, washerGeometry, railGeometry, M10 } = await import(new URL('render/hardware.js', SRC).href);

const OUT = process.argv[2] ?? fileURLToPath(new URL('mesh/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const REACH = 130; // mm, wall to the rail axis once set to its line: the foot 105 mm off the wall (owner: at least 10 cm),
// the SG turned round as the engine fits it (catalogue p. 21, travel 45–155); the video slides it there from 25 mm back
const mat = (name) => ({ name });
const M = { part: [mat('zinc'), mat('edge')], hw: mat('hw'), forged: mat('forged'), rail: mat('rail') };
const meshes = [];
const frames = [];

function grab(o, tag, kind, matrix = o.matrixWorld) {
  const g = o.geometry;
  const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
  const flip = matrix.determinant() < 0;
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
  const v = new THREE.Vector3();
  const chunks = {};
  for (const gr of groups) {
    const name = (mats[gr.materialIndex] ?? mats[0]).name;
    const c = (chunks[name] ??= { p: [], n: [], i: [] });
    const remap = new Map();
    const tri = [];
    for (let k = gr.start; k < gr.start + gr.count; k++) {
      const vi = idx ? idx.getX(k) : k;
      if (!remap.has(vi)) {
        remap.set(vi, c.p.length / 3);
        v.fromBufferAttribute(pos, vi).applyMatrix4(matrix); c.p.push(v.x, v.y, v.z);
        v.fromBufferAttribute(nor, vi).applyMatrix3(nm).normalize(); c.n.push(v.x, v.y, v.z);
      }
      tri.push(remap.get(vi));
    }
    for (let k = 0; k < tri.length; k += 3) c.i.push(tri[k], flip ? tri[k + 2] : tri[k + 1], flip ? tri[k + 1] : tri[k + 2]);
  }
  meshes.push({ tag, kind, chunks });
}

// A fastener's frame: its origin and the +y axis it was built along (after the mirror).
function frameOf(o) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  o.matrixWorld.decompose(p, q, s);
  const y = new THREE.Vector3(0, 1, 0).transformDirection(o.matrixWorld);
  const z = new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld);
  return { p: p.toArray(), y: y.toArray(), z: z.toArray() };
}

for (const hand of ['sx', 'dx']) {
  const left = hand === 'dx'; // DX is shown mirrored: left-hand threads read right-handed (stage.js)
  const asm = assemblyFor(byId('SU 220 160'), M, { left });
  asm.set(REACH);
  const root = new THREE.Group();
  root.add(asm.group);
  if (left) root.scale.set(-1, 1, 1);
  root.updateMatrixWorld(true);
  const moving = asm.group.children.find((c) => c.isGroup);
  const fr = { hand, bolts: [], clips: [], washers: [] };
  let clipN = 0;
  asm.group.traverse((o) => {
    if (!o.isMesh) return;
    const inMoving = o.parent === moving;
    if (!inMoving) return grab(o, `SU-${hand}`, 'part');
    if (o.name === 'clip') {
      fr.clips.push(frameOf(o));
      return grab(o, `clip-${hand}-${clipN++}`, 'clip');
    }
    if (o.name === 'nut') return fr.bolts.push(frameOf(o));
    if (o.name === 'washer') return fr.washers.push(frameOf(o));
    if (o.name === 'bolt') return;
    if (o.material === M.rail) return fr.rail = frameOf(o);
    grab(o, `SG-${hand}`, 'part');
  });
  frames.push(fr);
}

// Spare parts at the origin, axis +y: a 5 m T50 rail turned so its foot's back face is on x = 0 with the blade along
// +x and the foot across z; an M10 stud for the wedge anchors (a 100 mm bolt without its head); an M10 x 30 bolt, a
// nut, an ISO 7089 washer.
const I = new THREE.Matrix4();
const railGeo = railGeometry(5000);
railGeo.rotateY(-Math.PI / 2);
grab(new THREE.Mesh(railGeo, M.rail), 'spare', 'rail', I);
const stud = new THREE.Mesh(boltGeometry(100, { left: false }), M.hw);
grab(stud, 'spare', 'stud', I);
{
  const keep = meshes.at(-1).chunks.hw;
  const p = keep.p, out = [];
  for (let k = 0; k < keep.i.length; k += 3) {
    const t = [keep.i[k], keep.i[k + 1], keep.i[k + 2]];
    if (t.every((q) => p[q * 3 + 1] <= 97.79)) out.push(...t);
  }
  keep.i = out;
}
for (const [kind, geo] of [['nut', nutGeometry()], ['washer', washerGeometry()], ['bolt30', boltGeometry(30, { left: false })]]) {
  grab(new THREE.Mesh(geo, M.hw), 'spare', kind, I);
}
grab(new THREE.Mesh(clipGeometry({ left: false }), [M.forged, M.hw]), 'spare', 'clip', I);
// The N1 clip's own M10 shank (the video forges its head): a 30 mm bolt without its head, the blank 2.2 mm under it.
grab(new THREE.Mesh(boltGeometry(30, { left: false }), M.hw), 'spare', 'shank', I);
{
  const keep = meshes.at(-1).chunks.hw;
  const p = keep.p, out = [];
  for (let k = 0; k < keep.i.length; k += 3) {
    const t = [keep.i[k], keep.i[k + 1], keep.i[k + 2]];
    if (t.every((q) => p[q * 3 + 1] <= 29.6)) out.push(...t);
  }
  keep.i = out;
}

const arm = armOf('SU 220 160');
const meta = { reach: REACH, supportH: SUPPORT_H, sgFlange: SG_FLANGE, sgT: SG_T, flangeX: arm.x1, arm, N1, M10, frames, meshes: [] };
const bufs = [];
let off = 0;
for (const m of meshes) {
  const entry = { tag: m.tag, kind: m.kind, chunks: {} };
  for (const [name, c] of Object.entries(m.chunks)) {
    const p = Buffer.from(new Float32Array(c.p).buffer), n = Buffer.from(new Float32Array(c.n).buffer), i = Buffer.from(new Uint32Array(c.i).buffer);
    entry.chunks[name] = { verts: c.p.length / 3, tris: c.i.length / 3, p: off, n: off + p.length, i: off + p.length + n.length };
    off += p.length + n.length + i.length;
    bufs.push(p, n, i);
  }
  meta.meshes.push(entry);
}
writeFileSync(join(OUT, 'guida.bin'), Buffer.concat(bufs));
writeFileSync(join(OUT, 'guida.json'), JSON.stringify(meta));
console.log(meta.meshes.map((m) => `${m.tag}:${m.kind}`).join(' '));
for (const f of frames) console.log(f.hand, 'bolts', f.bolts.length, 'clips', f.clips.length, 'washers', f.washers.length, 'rail', f.rail?.p.map((x) => x.toFixed(1)).join(','));
