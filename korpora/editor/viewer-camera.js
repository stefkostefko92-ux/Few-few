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
  const dir = new THREE.Vector3(0.62, 0.42, 1).normalize();
  controls.target.set(0, y0 + H / 2, 0);
  // the sphere around the furniture, and every corner of its box in view: the wing of a Г or П kitchen nearest the
  // camera is larger in perspective than the sphere allows for
  const fit = Math.max(
    radius / Math.sin(Math.min(vHalf, hHalf)),
    boxDistance(W, H, D, dir, vHalf, hHalf),
  );
  const dist = fit * 1.06 * explodeZoom(explode);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  camera.near = dist / 60;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  controls.minDistance = radius * 0.5;
  controls.maxDistance = dist * 3;
  controls.update();
}

// The least distance along dir from the box's centre at which all its corners are inside the view: a corner v (from the
// centre) stands at depth d − v·dir in front of the camera and must be within its half-angles there.
function boxDistance(W, H, D, dir, vHalf, hHalf) {
  const right = new THREE.Vector3()
    .crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0))
    .normalize();
  const up = new THREE.Vector3().crossVectors(right, dir.clone().negate());
  let d = 0;
  for (const x of [-W / 2, W / 2])
    for (const y of [-H / 2, H / 2])
      for (const z of [-D / 2, D / 2]) {
        const v = new THREE.Vector3(x, y, z);
        const ahead = v.dot(dir);
        d = Math.max(
          d,
          ahead + Math.abs(v.dot(right)) / Math.tan(hHalf),
          ahead + Math.abs(v.dot(up)) / Math.tan(vHalf),
        );
      }
  return d;
}

// From one explode to another the camera keeps its direction and steps back or in with the assembly.
export function explodeCamera(camera, controls, from, to) {
  const k = explodeZoom(to) / explodeZoom(from);
  const offset = camera.position.clone().sub(controls.target);
  camera.position.copy(controls.target).addScaledVector(offset, k);
  controls.maxDistance = Math.max(controls.maxDistance, offset.length() * k * 1.2);
}

const TURN = THREE.MathUtils.degToRad(15);
const TILT = THREE.MathUtils.degToRad(8);
const STEP = 0.85;

// The keyboard on the 3D view (it takes the focus): the arrows turn the camera around the furniture, + and − come
// closer or step back, 0 shows the whole furniture again — what the mouse and two fingers do.
export function bindCameraKeys(canvas, camera, controls, { reframe, moved }) {
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const offset = camera.position.clone().sub(controls.target);
    const at = new THREE.Spherical().setFromVector3(offset);
    const turn = { ArrowLeft: -TURN, ArrowRight: TURN }[ev.key];
    const tilt = { ArrowUp: -TILT, ArrowDown: TILT }[ev.key];
    const zoom = { '+': STEP, '=': STEP, '-': 1 / STEP }[ev.key];
    if (ev.key === '0') {
      ev.preventDefault();
      reframe();
      return;
    }
    if (turn) at.theta += turn;
    else if (tilt) at.phi = Math.min(controls.maxPolarAngle, Math.max(0.05, at.phi + tilt));
    else if (zoom)
      at.radius = Math.min(controls.maxDistance, Math.max(controls.minDistance, at.radius * zoom));
    else return;
    ev.preventDefault();
    camera.position.copy(controls.target).add(offset.setFromSpherical(at));
    moved();
    controls.update();
  });
}
