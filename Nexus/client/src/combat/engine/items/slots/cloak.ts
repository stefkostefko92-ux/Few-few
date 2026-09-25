// Наметало — изви(та) плоскост с гънки, стеснена към раменете (не правоъгълник), яка + катарама.
import * as THREE from 'three/webgpu';
import { mesh, xf } from '../geoHelpers';
import type { Role } from '../materials';

function foldedPlane(rand: () => number): THREE.BufferGeometry {
  const wSeg = 22;
  const hSeg = 26;
  const g = new THREE.PlaneGeometry(0.42, 0.62, wSeg, hSeg);
  const pos = g.attributes.position;
  const amp = 0.022 + rand() * 0.016;
  const freq = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (y + 0.31) / 0.62; // 0 top (яка) .. 1 hem (подгъв)
    // Стеснено при раменете, разширява се към подгъва — силует на наметало, не лист хартия.
    const taper = 0.5 + 0.5 * Math.pow(Math.max(0, Math.min(1, t)), 0.7);
    const z = Math.sin(x * freq * Math.PI + 1.2) * amp * (0.3 + t);
    const bow = -t * t * 0.14;
    pos.setX(i, x * taper);
    pos.setZ(i, z + bow);
  }
  g.computeVertexNormals();
  return g;
}

export function buildCloak(M: Record<Role, THREE.Material>, rand: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const plane = foldedPlane(rand);
  g.add(mesh(plane, M.primary, { cast: true, receive: false }));
  // Изправена яка (отворен цилиндър около врата).
  g.add(mesh(xf(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 20, 1, true, -0.5, Math.PI + 1), [0, 0.315, -0.01]), M.secondary));
  g.add(mesh(xf(new THREE.TorusGeometry(0.048, 0.007, 8, 20, Math.PI), [0, 0.3, 0.012], [0, 0, Math.PI]), M.trim));
  g.add(mesh(xf(new THREE.CircleGeometry(0.02, 12), [-0.06, 0.3, 0.014], [0, 0, 0]), M.trim));
  g.add(mesh(xf(new THREE.CircleGeometry(0.02, 12), [0.06, 0.3, 0.014], [0, 0, 0]), M.trim));
  return g;
}
