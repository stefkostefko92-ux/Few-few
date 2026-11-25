// Meshes for the mounting video: the catalogue pair A 45 175 2 + B 45 320 as the site builds it (DX,
// installed pose, millimetres, wall on z = 0, shaft towards +z), every mesh on its own with a tag, and
// spare M10 hardware for the wall anchors. Internal working files only (geometry never leaves).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// node video/export_mesh.mjs [out dir] — from panev/3d after `npm ci`; writes pair.bin + pair.json (default video/mesh/).
const SRC = new URL('../src/', import.meta.url);
const THREE = await import(new URL('../node_modules/three/build/three.webgpu.js', import.meta.url).href);
const { byId } = await import(new URL('catalog.js', SRC).href);
const { assemblyFor } = await import(new URL('render/assembly.js', SRC).href);
const { B_SECTIONS, A_LEGS } = await import(new URL('parts/door.js', SRC).href);
const { boltGeometry, nutGeometry, washerGeometry, M10 } = await import(new URL('render/hardware.js', SRC).href);

const OUT = process.argv[2] ?? fileURLToPath(new URL('mesh/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const MIRROR = true; // DX, as the catalogue pages draw it (stage.js: VIEWS.B.mirror)
const mat = (name) => ({ name });
const M = { part: [mat('zinc'), mat('edge')], hw: mat('hw'), forged: mat('forged'), rail: mat('rail') };
const asm = assemblyFor(byId('A 45 175 2'), M, { left: MIRROR });
asm.set(0);
const root = new THREE.Group();
root.add(asm.group);
if (MIRROR) root.scale.set(-1, 1, 1);
root.updateMatrixWorld(true);

const turn = asm.group.children.find((c) => c.isGroup);
const under = (o, g) => { for (let p = o; p; p = p.parent) if (p === g) return true; return false; };

const meshes = [];
function grab(o, tag, matrix = o.matrixWorld) {
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
  meshes.push({ tag, kind: o.name || 'part', chunks });
}

let count = { B: 0, A: 0 };
asm.group.traverse((o) => {
  if (!o.isMesh) return;
  const inTurn = under(o, turn);
  const isPart = !o.name || o.name === '';
  let tag;
  if (isPart) tag = inTurn ? 'A' : 'B';
  else tag = inTurn ? 'lock' : 'joint';
  if (isPart) count[tag]++;
  grab(o, tag);
});

// Spare hardware at the origin, axis +y: an M10 stud for the wedge anchors (a 100 mm bolt without its
// head: everything below the bearing face), a nut and a washer.
const I = new THREE.Matrix4();
const stud = new THREE.Mesh(boltGeometry(100, { left: false }), M.hw);
stud.name = 'stud';
grab(stud, 'spare', I);
const keep = meshes.at(-1).chunks.hw;
{
  const p = keep.p, out = [];
  for (let k = 0; k < keep.i.length; k += 3) {
    const t = [keep.i[k], keep.i[k + 1], keep.i[k + 2]];
    if (t.every((q) => p[q * 3 + 1] <= 97.79)) out.push(...t);
  }
  keep.i = out;
}
for (const [kind, geo] of [['nut', nutGeometry()], ['washer', washerGeometry()], ['bolt30', boltGeometry(30, { left: false })]]) {
  const m = new THREE.Mesh(geo, M.hw);
  m.name = kind;
  grab(m, 'spare', I);
}

// Where A turns: the joint bolt axis (x) through the pivot, after the mirror.
const s = B_SECTIONS[45];
const pivot = new THREE.Vector3(0, 320 - s.pivot, s.col).applyMatrix4(root.matrixWorld);
const meta = { pivot: pivot.toArray(), range: asm.range, B: { L: 320, face: s.face, anchorSlot: [320 - 160, 320 - 30], openTo: 95, slotW: 12 }, A: { length: 175, width: 60, legs: A_LEGS[45] }, M10, meshes: [] };
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
writeFileSync(join(OUT, 'pair.bin'), Buffer.concat(bufs));
writeFileSync(join(OUT, 'pair.json'), JSON.stringify(meta));
console.log(meta.meshes.map((m) => `${m.tag}:${m.kind}`).join(' '), 'pivot', meta.pivot.map((x) => x.toFixed(1)).join(','), count);
