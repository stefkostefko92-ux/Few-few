// What stands in the studio: a single part, or the part installed with its catalogue partner and
// hardware. Everything is modelled in millimetres and shown in metres, in the drawn hand (DX) or
// its mirror (SX), centred over the origin and resting on the floor.
import * as THREE from 'three/webgpu';
import { VIEWS } from '../catalog.js';
import { partGeometry } from './model.js';
import { assemblyFor } from './assembly.js';

const MM = 0.001;

// Installed assemblies are seen from the shaft, where the joint bolts and the rail clamps are;
// the hand convention stays the one of the part drawings (B for the doors, the supports for the
// guides).
const ASSEMBLY_VIEWS = {
  door: { mirror: VIEWS.B.mirror, dir: [1, 1, -1] },
  guide: { mirror: VIEWS.support.mirror, dir: [-1, 1.6, -1] },
};

// Wraps a millimetre object in a metre holder, settled on `box` (the object's local extent).
function settle(inner, box, mirror) {
  const holder = new THREE.Group();
  holder.add(inner);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  holder.scale.set(mirror ? -MM : MM, MM, MM);
  holder.updateMatrixWorld(true);
  return { holder, box: box.clone().applyMatrix4(inner.matrixWorld) };
}

// Local extent of an assembly over its whole adjustment range, so the view never has to follow
// the slider and nothing slides out of frame.
function sweptBox(asm) {
  const box = new THREE.Box3();
  const at = (v) => {
    asm.set(v);
    asm.group.updateMatrixWorld(true);
    box.union(new THREE.Box3().setFromObject(asm.group));
  };
  const [lo, hi] = asm.range;
  for (let i = 0; i <= 4; i++) at(lo + ((hi - lo) * i) / 4);
  asm.set(asm.value);
  return box;
}

// mode 'assembly' falls back to the part when the catalogue pairs it with nothing.
// M = { part: [zinc, edge], hw, rail }. Returns { object, box (world, metres), view, asm }.
export function stage(item, hand, mode, M) {
  const view = ASSEMBLY_VIEWS[item.family === 'door' ? 'door' : 'guide'];
  const mirror = Boolean(view.mirror) !== (hand === 'SX');
  const asm = mode === 'assembly' ? assemblyFor(item, M, { left: mirror }) : null;
  if (asm) {
    const { holder, box } = settle(asm.group, sweptBox(asm), mirror);
    holder.name = `${item.code} (assembly)`;
    return { object: holder, box, view, asm };
  }
  const geo = partGeometry(item, hand);
  const mesh = new THREE.Mesh(geo, M.part);
  mesh.castShadow = mesh.receiveShadow = true;
  const { holder, box } = settle(mesh, geo.boundingBox, false);
  holder.name = item.code;
  return { object: holder, box, view: item.view, asm: null };
}

// Catalogue camera direction for the hand shown (the other hand mirrors the viewpoint).
export function viewDirection(view, hand) {
  const [x, y, z] = view.dir;
  const flip = hand === 'SX' ? -1 : 1;
  return new THREE.Vector3(x * flip, y * 0.82, z);
}
