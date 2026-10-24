// Materials of everything that is not a decor board: the raw chipboard edge, both sides of HDF, the room (floor
// boards, plaster), the mattress (quilted cover, plain border) and the beech slats. Baked like the decors.
import * as THREE from 'three';
import { surfaceSpec } from './tex-surface.js';
import { woodSpec } from './tex-wood.js';

const fabric = (sheen) => ({
  sheen,
  sheenRoughness: 0.55,
  sheenColor: new THREE.Color(0xffffff),
});

// name → [bake key, texture spec, material params, normal strength]
const SURFACES = {
  raw: [
    'chip',
    () =>
      surfaceSpec({
        style: 'chip',
        hex: '#d8c4a0',
        span: [180, 18],
        size: [1024, 128],
        gloss: 0.85,
        seed: 17,
      }),
  ],
  hdfFace: [
    'pearl:hdf',
    () =>
      surfaceSpec({
        style: 'pearl',
        hex: '#efeee9',
        span: [220, 220],
        size: [512, 512],
        gloss: 0.45,
        seed: 9,
      }),
  ],
  hdfBack: [
    'hdf:back',
    () =>
      surfaceSpec({
        style: 'hdf',
        hex: '#8f6f50',
        span: [300, 300],
        size: [512, 512],
        gloss: 0.82,
        seed: 11,
      }),
  ],
  wall: [
    'plaster',
    () =>
      surfaceSpec({
        style: 'plaster',
        hex: '#e6e2da',
        span: [1200, 1200],
        size: [1024, 1024],
        gloss: 0.9,
        seed: 5,
      }),
  ],
  fabric: [
    'quilt',
    () =>
      surfaceSpec({
        style: 'quilt',
        hex: '#eeebe3',
        span: [380, 380],
        size: [1024, 1024],
        gloss: 0.9,
        seed: 3,
      }),
    () => fabric(0.7),
    0.6,
  ],
  // the plain border of the mattress: a tight white weave
  border: [
    'border',
    () =>
      surfaceSpec({
        style: 'linen',
        hex: '#ecebe5',
        span: [120, 120],
        size: [1024, 1024],
        gloss: 0.88,
        seed: 21,
      }),
    () => fabric(0.5),
    0.5,
  ],
  // solid beech of the slats
  beech: [
    'beech',
    () => ({
      ...woodSpec({ name: 'бук', hex: '#d6b58c', finish: 'satin' }, 77),
      span: [1200, 600],
      size: [1024, 512],
    }),
  ],
  // oak floor boards: 180 mm wide, 1.4 m long, staggered, with their joints
  floor: [
    'floor',
    () => {
      const spec = woodSpec({ name: 'дъб паркет', hex: '#b08c62', finish: 'satin' }, 4242);
      const u = spec.uniforms;
      u.uPlank.value.set(180, 0);
      u.uJoint.value = 1400;
      u.uSeam.value = 1;
      u.uPlankTone.value = 0.2;
      return { ...spec, span: [2800, 1440], size: [2048, 1024] };
    },
  ],
};

export function surfaceMaterial(cache, name) {
  const [bake, spec, params, relief] = SURFACES[name];
  return cache.get(name, () => {
    const m = cache.textured(bake, spec, { metalness: 0, ...(params?.() ?? {}) });
    if (relief) m.normalScale.set(relief, relief);
    return m;
  });
}
