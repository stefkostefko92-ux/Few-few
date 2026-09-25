// World layout and look constants shared by the scene, shaders and the director.
import * as THREE from 'three';

export const BRAZIERS = [
  new THREE.Vector3(-5.2, 0, -4.2),
  new THREE.Vector3(5.4, 0, -3.6),
  new THREE.Vector3(1.4, 0, 5.8),
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

export const DURATION = 28.5;

// A knight's eyes in his head frame (the head joint sits at the top of the neck): what the other
// knight looks at and where the camera focuses.
export const EYES_LOCAL = [0, 0.112, 0.085];
