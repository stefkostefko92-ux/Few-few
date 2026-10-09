// The camera of the 3D view: the first look at a model (the furniture whole, from a three-quarter view above) and the
// step back that keeps an exploded assembly in view.
import * as THREE from 'three';
import { S } from './viewer-hw.js';

// How much farther the camera stands for an exploded assembly (e: 0 assembled … 1 fully exploded).
const explodeZoom = (e) => 1 + 0.55 * e;

// ext: the model's extents in mm (viewer-scene.js). The furniture itself is framed, from its lowest board to its top:
// a wall cabinet hangs high, and framed from the floor it was small at the top of an empty scene.
export function frameCamera(camera, controls, ext, explode) {
  const W = (ext.x1 - ext.x0) * S;
  const D = (ext.z1 - ext.z0) * S;
  const y0 = ext.y0 * S;
  const H = (ext.y1 - ext.y0) * S;
  const radius = Math.hypot(W, H, D) * 0.5;
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(camera.aspect, 0.2));
  const dist = (radius / Math.sin(Math.min(vHalf, hHalf))) * 1.06 * explodeZoom(explode);
  const dir = new THREE.Vector3(0.62, 0.42, 1).normalize();
  controls.target.set(0, y0 + H / 2, 0);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  camera.near = dist / 60;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  controls.minDistance = radius * 0.5;
  controls.maxDistance = dist * 3;
  controls.update();
}

// From one explode to another the camera keeps its direction and steps back or in with the assembly.
export function explodeCamera(camera, controls, from, to) {
  const k = explodeZoom(to) / explodeZoom(from);
  const offset = camera.position.clone().sub(controls.target);
  camera.position.copy(controls.target).addScaledVector(offset, k);
  controls.maxDistance = Math.max(controls.maxDistance, offset.length() * k * 1.2);
}
