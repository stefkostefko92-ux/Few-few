// Head bake: turns the scan ("Infinite" by Lee Perry-Smith, CC BY 3.0 — see assets/head/) into
// the two knights' heads. Opens the eyes around eyeballs and the lips over a mouth bag, builds the
// expression targets and the Warden's own face, measures the skin, writes one binary with both
// identities plus WebP maps, and returns the manifest entry.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { readGLB, toHeadFrame, weld, adjacency, vertexNormals, curvature, thickness } from './head-mesh.mjs';
import { EYE, locateEye, findSlit, shapeLids, slitBridges } from './head-eyes.mjs';
import { findLips, lipBridges, jawWeights, turnJaw, bagTest } from './head-mouth.mjs';
import { browDown, browUp, snarl, cheekRaise, wardenFace } from './head-face.mjs';
import { regionMasks } from './head-regions.mjs';

// Scan units → metres, with the rig's head joint (top of the neck, chin level) at the origin.
export const FRAME = { origin: [-0.08, -0.6, -0.05], scale: 0.0485 };
const EYE_GUESS = [[-0.0293, 0.1125, 0.078], [0.0278, 0.1125, 0.079]];
// The jaw rests a hair closed, so the parted lips still meet; it opens by `angle` from there.
export const MOUTH = { centre: [0.0005, 0.045, 0.078], pivot: [0, 0.08, 0.02], angle: 0.21, rest: -0.012 };
// Everything below this lies inside the collar and gorget.
const NECK_CUT = -0.05;
export const MORPHS = ['blinkR', 'blinkL', 'squint', 'browDown', 'browUp', 'snarl', 'jawOpen'];
const LIDS = { rise: 0.56, drop: 0.04 };
const SQUINT = { rise: 0.4, drop: -0.14 };

const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);

// glb: Buffer of the scan; albedo(u, v) → [r, g, b] 0..1. Pure: returns arrays and metadata.
export function processHead(glb, albedo) {
  const scan = readGLB(glb);
  toHeadFrame(scan, FRAME.origin, FRAME.scale);
  const P0 = scan.position;
  const n = P0.length / 3;
  const rep = weld(P0);
  const N0 = vertexNormals(P0, scan.index, rep);
  const adj = adjacency(scan.index, rep, n);
  const cut = new Set();

  // Eyes: open lids around eyeballs; the scan's closed lids (lining tucked) are the blinks.
  const eyes = EYE_GUESS.map((guess) => locateEye(scan, N0, rep, guess));
  const shape = (eye, slit, medial, opts) => {
    const out = Float32Array.from(P0);
    shapeLids(scan, N0, rep, eye, slit, out, { medial, ...opts });
    return out.map((v, i) => v - P0[i]);
  };
  const lids = eyes.map((eye, k) => {
    const medial = k === 0 ? 1 : -1;
    const slit = findSlit(scan, N0, adj, rep, eye);
    for (const t of slitBridges(scan, N0, rep, eye, slit, { medial })) cut.add(t);
    return { open: shape(eye, slit, medial, LIDS), closed: shape(eye, slit, medial, { open: 0 }), squint: shape(eye, slit, medial, SQUINT) };
  });
  let base = add(add(P0, lids[0].open), lids[1].open);

  // Mouth: lips part where the jaw turns; the corners stay sealed.
  const lips = findLips(scan, N0, adj, rep, MOUTH.centre);
  for (const t of lipBridges(scan, rep, lips, MOUTH.centre)) cut.add(t);
  const jawW = jawWeights({ position: base }, lips, MOUTH.centre, MOUTH.pivot);
  const turned = [0, 0, 0];
  for (let i = 0; i < n; i++) base.set(turnJaw(base, i, jawW[i], MOUTH.rest, MOUTH.pivot, turned), i * 3);

  const nose = [0, 0, -Infinity];
  for (let i = 0; i < n; i++) {
    if (Math.abs(P0[i * 3]) < 0.015 && P0[i * 3 + 1] > 0.06 && P0[i * 3 + 1] < 0.1 && P0[i * 3 + 2] > nose[2]) nose.splice(0, 3, P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]);
  }
  const L = { eyes, lipY: lips.y, lipZ: lips.z, nose };

  // Final triangles: no bridges across the eyes and lips, nothing below the collar.
  const tris = [];
  for (let t = 0; t < scan.index.length; t += 3) {
    const vs = [scan.index[t], scan.index[t + 1], scan.index[t + 2]];
    if (!cut.has(t) && vs.every((v) => base[v * 3 + 1] > NECK_CUT)) tris.push(...vs);
  }
  const index = Uint32Array.from(tris);
  const NB = vertexNormals(base, index, rep);

  // Expression targets as deltas from the open face.
  const jaw = new Float32Array(n * 3);
  const tmp = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    turnJaw(base, i, jawW[i], MOUTH.angle, MOUTH.pivot, tmp);
    jaw.set([tmp[0] - base[i * 3], tmp[1] - base[i * 3 + 1], tmp[2] - base[i * 3 + 2]], i * 3);
  }
  const deltas = {
    blinkR: add(lids[0].closed, lids[0].open, -1),
    blinkL: add(lids[1].closed, lids[1].open, -1),
    squint: add(add(add(lids[0].squint, lids[0].open, -1), add(lids[1].squint, lids[1].open, -1)), cheekRaise(base, NB, L)),
    browDown: browDown(base, NB, L),
    browUp: browUp(base, NB, L),
    snarl: snarl(base, NB, L),
    jawOpen: jaw,
  };
  const normalDeltas = {};
  for (const name of MORPHS) normalDeltas[name] = add(vertexNormals(add(base, deltas[name]), index, rep), NB, -1);

  // The Warden's face on the same topology; expressions carry over as they are.
  const baseB = add(base, wardenFace(base, NB, L));
  const NBB = vertexNormals(baseB, index, rep);

  const lining = (i) => eyes.some((e) => {
    const d = [P0[i * 3] - e.pocket[0], P0[i * 3 + 1] - e.pocket[1], P0[i * 3 + 2] - e.pocket[2]];
    const r = Math.hypot(...d);
    return r < 0.024 && (N0[i * 3] * d[0] + N0[i * 3 + 1] * d[1] + N0[i * 3 + 2] * d[2]) / r < -0.2;
  });
  const bag = bagTest(P0, N0, MOUTH.centre);
  const curv = curvature(base, NB, adjacency(index, rep, n), rep);
  const thick = thickness(base, NB, index);
  const regions = regionMasks(base, NB, scan.uv, albedo, L, { lining: (i) => lining(rep[i]), bag: (i) => bag(rep[i]), curv, thick });

  const keep = compact(index, n);
  return {
    count: keep.count,
    index: keep.remapIndex,
    uv: keep.pick(scan.uv, 2),
    regions: keep.pick(regions, 12),
    identities: { A: { position: keep.pick(base, 3), normal: keep.pick(NB, 3) }, B: { position: keep.pick(baseB, 3), normal: keep.pick(NBB, 3) } },
    morphs: MORPHS.map((name) => ({ name, position: keep.pick(deltas[name], 3), normal: keep.pick(normalDeltas[name], 3) })),
    eyes: eyes.map((e) => ({ centre: e.centre })),
    mouth: { pivot: MOUTH.pivot, angle: MOUTH.angle, rest: MOUTH.rest, lipY: lips.y(0), lipZ: lips.z(0), corners: [lips.lo, lips.hi] },
  };
}

// Drops vertices no triangle uses and renumbers the index.
function compact(index, n) {
  const remap = new Int32Array(n).fill(-1);
  let count = 0;
  for (const v of index) if (remap[v] < 0) remap[v] = count++;
  return {
    count,
    remapIndex: Uint16Array.from(index, (v) => remap[v]),
    pick(arr, size) {
      const out = new arr.constructor(count * size);
      for (let i = 0; i < n; i++) if (remap[i] >= 0) for (let k = 0; k < size; k++) out[remap[i] * size + k] = arr[i * size + k];
      return out;
    },
  };
}

// Int16 normalised with a per-array scale; floats elsewhere.
function quantise(arr, scale) {
  return Int16Array.from(arr, (v) => Math.max(-32767, Math.min(32767, Math.round((v / scale) * 32767))));
}

function pack(head) {
  const sections = [];
  const chunks = [];
  let offset = 0;
  const put = (name, data, extra = {}) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    sections.push({ name, type: data.constructor.name, offset, length: data.length, ...extra });
    chunks.push(bytes);
    offset += bytes.byteLength;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      offset += pad;
    }
  };
  put('index', head.index);
  put('uv', head.uv);
  put('regions', head.regions);
  for (const [id, g] of Object.entries(head.identities)) {
    put(`position${id}`, g.position);
    put(`normal${id}`, quantise(g.normal, 1), { scale: 1 });
  }
  for (const m of head.morphs) {
    const scale = Math.max(1e-6, ...m.position.map(Math.abs));
    put(`morph:${m.name}:position`, quantise(m.position, scale), { scale });
    put(`morph:${m.name}:normal`, quantise(m.normal, 2), { scale: 2 });
  }
  const buf = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  return { buf, sections };
}

// Albedo without the scan's red tracking markers (filled from the surrounding skin).
async function cleanAlbedo(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const bad = new Uint8Array(w * h);
  // The markers sit on the closed lids, well away from the lips.
  for (let y = Math.round(h * 0.23); y < Math.round(h * 0.36); y++) {
    for (let x = Math.round(w * 0.37); x < Math.round(w * 0.65); x++) {
      const i = y * w + x;
      const [r, g, b] = [data[i * c], data[i * c + 1], data[i * c + 2]];
      if (r > 160 && r - g > 70 && r - b > 70) bad[i] = 1;
    }
  }
  for (let pass = 0; pass < 12; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!bad[i]) continue;
        const acc = [0, 0, 0];
        let k = 0;
        for (const j of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) {
          if (bad[j]) continue;
          for (let ch = 0; ch < 3; ch++) acc[ch] += data[j * c + ch];
          k++;
        }
        if (k < 3) continue;
        for (let ch = 0; ch < 3; ch++) data[i * c + ch] = Math.round(acc[ch] / k);
        bad[i] = 0;
      }
    }
  }
  return { data, w, h, c };
}

export const SOURCES = ['LeePerrySmith.glb', 'Map-COL.jpg', 'Infinite-Level_02_Tangent_SmoothUV.jpg', 'Map-SPEC.jpg'];

// Writes head.json (the packed arrays as base64: JSON is served correctly by any static host)
// and the maps into outDir; returns the manifest entry.
export async function bakeHead(assetsDir, outDir) {
  const albedo = await cleanAlbedo(join(assetsDir, 'Map-COL.jpg'));
  const sample = (u, v) => {
    const x = Math.min(albedo.w - 1, Math.max(0, Math.floor(u * albedo.w)));
    const y = Math.min(albedo.h - 1, Math.max(0, Math.floor((1 - v) * albedo.h)));
    const k = (y * albedo.w + x) * albedo.c;
    return [albedo.data[k] / 255, albedo.data[k + 1] / 255, albedo.data[k + 2] / 255];
  };
  const head = processHead(readFileSync(join(assetsDir, 'LeePerrySmith.glb')), sample);
  const { buf, sections } = pack(head);
  writeFileSync(join(outDir, 'head.json'), JSON.stringify({ base64: Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('base64') }));
  const files = { albedo: 'head_albedo.webp', normal: 'head_normal.webp', spec: 'head_spec.webp', data: 'head.json' };
  await sharp(albedo.data, { raw: { width: albedo.w, height: albedo.h, channels: albedo.c } }).webp({ quality: 92, smartSubsample: true }).toFile(join(outDir, files.albedo));
  await sharp(join(assetsDir, 'Infinite-Level_02_Tangent_SmoothUV.jpg')).webp({ quality: 95 }).toFile(join(outDir, files.normal));
  await sharp(join(assetsDir, 'Map-SPEC.jpg')).greyscale().webp({ quality: 90 }).toFile(join(outDir, files.spec));
  return { files, count: head.count, indexCount: head.index.length, sections, morphs: MORPHS, eyes: head.eyes, eyeRadius: EYE.radius, mouth: head.mouth };
}
