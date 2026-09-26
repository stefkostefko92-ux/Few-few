// Catalogue item → three.js geometry of its sheet-metal solid, in millimetres, folded into a root
// frame and cached (the builder runs once per part, frame and hand).
import * as THREE from 'three/webgpu';

const cache = new Map();

export function toGeometry(data) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  g.setIndex(new THREE.BufferAttribute(data.index, 1));
  for (const gr of data.groups) g.addGroup(gr.start, gr.count, gr.material);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// The drawn hand is DX; SX is its mirror image (the brackets are ambidextrous).
export const isMirrored = (item, hand) => Boolean(item.view.mirror) !== (hand === 'SX');

export function partGeometry(item, hand) {
  return framedGeometry(item, item.view.frame, isMirrored(item, hand));
}

// The part folded into an arbitrary root frame (assemblies place parts in their installed pose).
export function framedGeometry(item, frame, mirror = false) {
  const key = `${item.id}:${JSON.stringify(frame)}:${mirror}`;
  if (!cache.has(key)) {
    const mb = item.build().build(frame);
    if (mirror) mb.mirrorX();
    cache.set(key, toGeometry(mb.build()));
  }
  return cache.get(key);
}
