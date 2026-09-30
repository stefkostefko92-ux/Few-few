// The stage: a dark machine room with a studio key light, a cool rim light and room reflections; the machine on
// its bedplate; the camera slowly swaying around it. Lighting set-up after boy's world.js (key / rim / hemisphere).
// Loaded only through boot.ts, after the prefers-reduced-motion and save-data gate of MachineStage.tsx.
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaterials } from './materials';
import { buildMachine, DIM, ROPE_LENGTH } from './parts';
import type { Quality } from './quality';

/** Background of the stage; the page paints the same colour behind the picture (globals.css, .stage). */
export const STAGE_BG = '#0e1422';
const TARGET = new THREE.Vector3(0.24, 0.31, 0.06);
const RATIO = 43; // example A: 1:43
const SHEAVE_SPEED = 0.2; // rad/s, slowed down for the eye: the handwheel turns 43 times faster

export interface Pointer {
  x: number;
  y: number;
}
export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** t: seconds of animation; pointer: -1…1 on each axis, 0 at rest. */
  update(t: number, dt: number, pointer: Pointer): void;
  /** Frames the machine for the stage's aspect ratio. */
  frame(aspect: number): void;
  dispose(): void;
}

function makeLights(scene: THREE.Scene, quality: Quality): void {
  const key = new THREE.DirectionalLight(0xffe2c6, 3.4);
  key.position.set(2.4, 3.3, 2.4);
  key.target.position.copy(TARGET);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  Object.assign(key.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 0.5, far: 9 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  // Cool back light drawing a rim along the silhouette, as in boy's duel.
  const rim = new THREE.DirectionalLight(0x9fb8ff, 2.3);
  rim.position.set(-2.4, 2.0, -2.2);
  rim.target.position.copy(TARGET);
  const hemi = new THREE.HemisphereLight(0xb8c6ff, 0x2a2118, 0.42);
  scene.add(key, key.target, rim, rim.target, hemi);
}

export function buildWorld(renderer: THREE.WebGPURenderer, quality: Quality): World {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is gone from the WebGPU renderer (r186)
  renderer.toneMapping = THREE.NoToneMapping; // the grade does it (grade.ts)

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE_BG);
  scene.fog = new THREE.Fog(STAGE_BG, 4.6, 10);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.7;

  const M = createMaterials(ROPE_LENGTH);
  const machine = buildMachine(M);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), M.floor);
  floor.receiveShadow = true;
  scene.add(machine.group, floor);
  makeLights(scene, quality);

  const camera = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 30);
  const view = { yaw: 0, pitch: 0, radius: 3.0 };

  return {
    scene,
    camera,
    frame(aspect) {
      camera.aspect = aspect;
      // A narrow stage (phone) steps back so the whole machine stays in the picture.
      view.radius = 3.0 * Math.pow(Math.max(1, 1.45 / aspect), 0.85);
      camera.updateProjectionMatrix();
    },
    update(t, dt, pointer) {
      const angle = t * SHEAVE_SPEED;
      machine.sheave.rotation.z = -angle;
      for (const part of machine.worm) part.rotation.x = angle * RATIO;
      M.ropeShift.value = (angle * DIM.rp) / ROPE_LENGTH;
      const k = 1 - Math.exp(-dt * 3);
      view.yaw += (pointer.x * 0.09 - view.yaw) * k;
      view.pitch += (pointer.y * 0.04 - view.pitch) * k;
      const az = 0.74 + 0.1 * Math.sin((t * Math.PI * 2) / 26) + view.yaw;
      const el = 0.36 + view.pitch;
      camera.position.set(TARGET.x + view.radius * Math.sin(az) * Math.cos(el), TARGET.y + view.radius * Math.sin(el), TARGET.z + view.radius * Math.cos(az) * Math.cos(el));
      camera.lookAt(TARGET);
    },
    dispose() {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      M.dispose();
      env.dispose();
      pmrem.dispose();
      room.dispose();
    },
  };
}
