// World layout and look constants shared by the scene, shaders and the director.
import * as THREE from 'three';

// 4a.3-fix: пуснати ~40% по-навън спрямо оригиналния (стационарен, широкоекранен) boy демо —
// генерираните ракурси (shot-builder.js) орбитират по-близо до бойците (MIN_DIST 4.2m) от
// оригиналните фиксирани кадри, и мангалът в (1.4,5.8) редовно влизаше право в обектива на
// мобилен портрет (реален бъг, докладван при преглед).
export const BRAZIERS = [
  new THREE.Vector3(-7.3, 0, -5.9),
  new THREE.Vector3(7.6, 0, -5.0),
  new THREE.Vector3(2.0, 0, 8.1),
];
export const FLAME_Y = 1.36;
export const GATE_FIRE = new THREE.Vector3(0, 2.4, -19.5);
export const MOON_DIR = new THREE.Vector3(-0.42, 0.55, -0.72).normalize();

export const FOG = {
  color: new THREE.Color(0.017, 0.021, 0.03),
  density: 0.033,
  falloff: 0.3,
};

// Warm in-scattering around each fire, used by the height-fog shader chunk.
export const FIRE_GLOWS = [
  ...BRAZIERS.map((b) => ({ pos: new THREE.Vector3(b.x, FLAME_Y + 0.25, b.z), col: [0.07, 0.028, 0.008] })),
  { pos: GATE_FIRE.clone(), col: [0.17, 0.06, 0.016] },
];

// 4a.2: DURATION е `let` — генерираните двубои имат различна дължина от EVENTS/CHAPTERS
// на хореографията. setDuration() се вика от boot.js заедно с choreo.setChoreography().
export let DURATION = 28.5;
export function setDuration(seconds) {
  DURATION = seconds;
}
