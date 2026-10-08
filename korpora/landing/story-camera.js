// Where the landing scene's camera stands at each moment of the story: in front of the furniture (as the editor frames
// it), farther back while it is exploded, high over all the sheets, then nearly straight above sheet 1 for the router.
// Loaded only through story.js, which main.js imports only when prefers-reduced-motion allows motion.
import * as THREE from 'three';
import { ramp } from './timeline.js';

// Distance at which a sphere of `radius` fills the view (both directions), with a margin.
function fitDistance(camera, radius, margin) {
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(camera.aspect, 0.2));
  return (radius / Math.sin(Math.min(vHalf, hHalf))) * margin;
}

function key(target, dir, distance) {
  const d = new THREE.Vector3(...dir).normalize();
  return { target, pos: target.clone().addScaledVector(d, distance) };
}

// ext: the furniture's extents in metres around the scene origin; sheets: { centre, radius } of all the sheets and of
// sheet 1, in metres.
export function cameraKeys(camera, ext, sheets) {
  const radius = Math.hypot(ext.W, ext.H, ext.D) * 0.5;
  const furniture = new THREE.Vector3(0, ext.H / 2, 0);
  const dist = fitDistance(camera, radius, 0.88);
  // the furniture's own framing in the editor: front right, a little from above — closer, it is the hero
  const hero = key(furniture, [0.62, 0.42, 1], dist);
  const exploded = key(furniture.clone().setY(ext.H * 0.55), [0.66, 0.5, 1], dist * 1.4);
  // over the sheets the camera has no sideways offset: their edges stay level on the screen
  const all = key(sheets.all.centre, [0, 1.15, 0.62], fitDistance(camera, sheets.all.radius, 0.96));
  const one = key(sheets.one.centre, [0, 1, 0.42], fitDistance(camera, sheets.one.radius, 1.02));
  return { hero, exploded, all, one };
}

const mix = (a, b, k) => ({
  pos: a.pos.clone().lerp(b.pos, k),
  target: a.target.clone().lerp(b.target, k),
});

// The camera at t: one move per step, each eased, never two at once.
export function cameraAt(keys, t) {
  let cam = mix(keys.hero, keys.exploded, ramp(t, 0.5, 1.4));
  cam = mix(cam, keys.all, ramp(t, 1.45, 2.2));
  return mix(cam, keys.one, ramp(t, 2.5, 3.15));
}
