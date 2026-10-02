// Physical materials for the 3D view. Every decor is baked on the GPU from its kind and name (wood, stone,
// concrete, metal look, fabric, plain) into colour, normal and roughness maps at real size, its average colour
// calibrated to the catalogue. Lacquered MDF, the raw chipboard edge, HDF, the metals of the hardware, the mattress
// cover and the room are built the same way. No photographs are used.
import * as THREE from 'three';
import { decor } from '../engine/materials.js';
import { Baker, disposeBake } from './tex-bake.js';
import { woodSpec } from './tex-wood.js';
import { stoneSpec } from './tex-stone.js';
import { surfaceSpec, decorSurface } from './tex-surface.js';
import { metalLook } from './viewer-metals.js';
import { surfaceMaterial } from './viewer-surfaces.js';

const hashStr = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const LACQUER = {
  gloss: { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 },
  'high-gloss': { roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 },
  satin: { roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 },
  matt: { roughness: 0.62, clearcoat: 0, clearcoatRoughness: 0.5 },
};
// tile size (mm) and texture size per surface style: fine structures need small tiles to be resolved
const SURFACE_TILE = {
  pearl: [
    [220, 220],
    [512, 512],
  ],
  groove: [
    [240, 240],
    [512, 512],
  ],
  linen: [
    [160, 160],
    [1024, 1024],
  ],
  canvas: [
    [200, 200],
    [1024, 1024],
  ],
  oxidized: [
    [900, 900],
    [1024, 1024],
  ],
  sparkle: [
    [260, 260],
    [1024, 1024],
  ],
};
const MAX_BAKES = 10; // decors kept on the GPU; the oldest unused one is freed first

// The baked textures repeat mirrored, so every other tile runs backwards: its normals must turn round with it, or
// a groove there lights up as a ridge.
const MIRRORED_NORMALS = THREE.ShaderChunk.normal_fragment_maps.replace(
  'mapN.xy *= normalScale;',
  'mapN.xy *= normalScale * (1.0 - 2.0 * mod(floor(vNormalMapUv), 2.0));',
);
function mirrorNormals(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    MIRRORED_NORMALS,
  );
}

export class MaterialCache {
  constructor(renderer) {
    this.baker = new Baker(renderer);
    this.bakes = new Map();
    this.materials = new Map();
  }

  // the decors of the model on screen are never evicted (`pinned` is reset by the viewer for each model)
  baked(key, spec) {
    this.pinned?.add(key);
    let b = this.bakes.get(key);
    if (b) {
      this.touch(key);
      return b;
    }
    b = this.baker.bake(typeof spec === 'function' ? spec() : spec);
    this.bakes.set(key, b);
    return b;
  }

  // a new model is being built: what it uses is pinned or live again
  begin() {
    this.pinned = new Set();
    this.live = new Set();
  }

  // most recently used last
  touch(key) {
    const b = this.bakes.get(key);
    if (!b) return;
    this.bakes.delete(key);
    this.bakes.set(key, b);
  }

  // After a model or the room is built (never during: a decor needed further on would be baked twice): free the
  // least recently used decors that no live mesh needs, down to MAX_BAKES, with their materials; and the materials
  // of no decor (the cups of recessed pulls) that the model on screen no longer uses.
  trim() {
    for (const [key, b] of this.bakes) {
      if (this.bakes.size <= MAX_BAKES) return;
      if (this.pinned?.has(key)) continue;
      disposeBake(b);
      this.bakes.delete(key);
      for (const [mk, m] of this.materials)
        if (m.userData.bake === key) {
          m.dispose();
          this.materials.delete(mk);
        }
    }
    for (const [key, m] of this.materials)
      if (m.userData.transient && !this.live?.has(key)) {
        m.dispose();
        this.materials.delete(key);
      }
  }

  // after a lost WebGL context the baked textures are gone: forget everything, the next model bakes again
  reset() {
    for (const b of this.bakes.values()) disposeBake(b);
    for (const m of this.materials.values()) m.dispose();
    this.bakes.clear();
    this.materials.clear();
  }

  get(key, make) {
    if (!this.materials.has(key)) this.materials.set(key, make());
    const m = this.materials.get(key);
    this.live?.add(key);
    if (m.userData.bake) {
      this.pinned?.add(m.userData.bake);
      this.touch(m.userData.bake);
    }
    return m;
  }

  textured(bakeKey, spec, params) {
    const b = this.baked(bakeKey, spec);
    const m = new THREE.MeshPhysicalMaterial({
      map: b.map,
      normalMap: b.normalMap ?? null,
      roughnessMap: b.ormMap ?? null,
      metalnessMap: b.ormMap ?? null,
      roughness: 1,
      metalness: 1,
      ...params,
    });
    m.userData.bake = bakeKey;
    m.onBeforeCompile = mirrorNormals;
    return m;
  }

  decorBake(d, id) {
    const seed = hashStr(id);
    if (d.category === 'wood') return [`wood:${id}`, () => woodSpec(d, seed)];
    if (d.category === 'stone' || d.category === 'concrete')
      return [`stone:${id}`, () => stoneSpec(d, seed)];
    const look = decorSurface(d);
    const [span, size] = SURFACE_TILE[look.style] ?? [
      [300, 300],
      [1024, 1024],
    ];
    return [`surf:${id}`, () => surfaceSpec({ ...look, hex: d.hex, seed, span, size })];
  }

  // Board face or edge band in a decor, or a RAL lacquer (MDF fronts are painted on the edges too).
  board(decorId, edge = false) {
    return this.get(`${edge ? 'band' : 'face'}:${decorId}`, () => {
      const d = decor(decorId);
      if (d.painted) return this.lacquer(d);
      const [key, spec] = this.decorBake(d, decorId);
      const gloss = d.finish === 'gloss' || d.finish === 'high-gloss';
      // the ABS band is extruded, a touch smoother than the pressed face; plain decors have only a fine pearl
      const relief =
        (key.startsWith('surf:') && decorSurface(d).style === 'pearl' ? 0.45 : 1) *
        (edge ? 0.5 : 1);
      return this.textured(key, spec, {
        normalScale: new THREE.Vector2(relief, relief),
        roughness: edge ? 0.9 : 1,
        clearcoat: gloss ? 1 : 0,
        clearcoatRoughness: 0.04,
      });
    });
  }

  lacquer(d) {
    const finish = LACQUER[d.finish] ?? LACQUER.satin;
    const m = this.textured(
      'pearl:lacquer',
      () =>
        surfaceSpec({
          style: 'pearl',
          hex: '#ffffff',
          span: [160, 160],
          size: [512, 512],
          gloss: 1,
          match: false,
        }),
      {
        map: null,
        color: new THREE.Color(d.hex),
        roughness: finish.roughness,
        metalness: 0,
        metalnessMap: null,
        ...finish,
      },
    );
    m.normalScale.set(0.35, 0.35);
    return m;
  }

  raw() {
    return surfaceMaterial(this, 'raw');
  }

  hdf(face) {
    return surfaceMaterial(this, face ? 'hdfFace' : 'hdfBack');
  }

  metal(finish = '', color = '') {
    const look = metalLook(finish, color);
    return this.get(`metal:${look.key}`, () => {
      if (look.wood) return this.board('demo:walnut');
      return new THREE.MeshPhysicalMaterial(look.params);
    });
  }

  floor() {
    return surfaceMaterial(this, 'floor');
  }

  wall() {
    return surfaceMaterial(this, 'wall');
  }

  skirting() {
    return this.get('skirting', () => this.lacquer({ hex: '#f1f0ea', finish: 'satin' }));
  }

  fabric() {
    return surfaceMaterial(this, 'fabric');
  }

  border() {
    return surfaceMaterial(this, 'border');
  }

  beech() {
    return surfaceMaterial(this, 'beech');
  }

  plain(key, params) {
    return this.get(key, () => new THREE.MeshPhysicalMaterial(params));
  }
}
