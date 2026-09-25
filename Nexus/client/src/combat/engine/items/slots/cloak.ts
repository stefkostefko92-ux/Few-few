// Наметало — извита плоскост с гънки (синусоидално изместване по ширина), закопчалка на врата.
import * as THREE from 'three/webgpu';
import { mesh, xf } from '../geoHelpers';
import type { Role } from '../materials';

function foldedPlane(rand: () => number): THREE.BufferGeometry {
  const wSeg = 20;
  const hSeg = 24;
  const g = new THREE.PlaneGeometry(0.4, 0.6, wSeg, hSeg);
  const pos = g.attributes.position;
  const amp = 0.02 + rand() * 0.015;
  const freq = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (y + 0.3) / 0.6; // 0 top .. 1 hem
    const z = Math.sin(x * freq * Math.PI + 1.2) * amp * (0.3 + t);
    const bow = -t * t * 0.12;
    pos.setZ(i, z + bow);
  }
  g.computeVertexNormals();
  return g;
}

export function buildCloak(M: Record<Role, THREE.Material>, rand: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const plane = foldedPlane(rand);
  g.add(mesh(plane, M.primary, { cast: true, receive: false }));
  g.add(mesh(xf(new THREE.TorusGeometry(0.05, 0.006, 8, 20, Math.PI), [0, 0.3, 0.01], [0, 0, Math.PI]), M.trim));
  g.add(mesh(xf(new THREE.CircleGeometry(0.018, 12), [-0.06, 0.3, 0.012], [0, 0, 0]), M.trim));
  g.add(mesh(xf(new THREE.CircleGeometry(0.018, 12), [0.06, 0.3, 0.012], [0, 0, 0]), M.trim));
  return g;
}
