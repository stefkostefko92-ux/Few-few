// The photographic studio: a dark room hung with softboxes that the zinc reflects (prefiltered
// into the environment map), a seamless pale backdrop that the camera sees, a shadow-catching
// floor and one key light for the cast shadow. Metres; the part stands on y = 0.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, abs, max, min, mix, smoothstep, normalize, positionLocal, screenUV, length, uniform } from 'three/tsl';

// A softbox: bright, slightly hotter in the middle, with a soft rim (diffusion fabric).
function softbox(w, h, power, tint = [1, 1, 1]) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
  const e = abs(uv().sub(0.5)).mul(2);
  const rim = smoothstep(1, 0.8, max(e.x, e.y));
  const hot = float(1).sub(e.x.mul(e.x).add(e.y.mul(e.y)).mul(0.35));
  m.colorNode = vec3(...tint).mul(power).mul(rim).mul(hot);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

// Studio presets: what the metal sees (room + softboxes) and what the camera sees (backdrop).
// Softboxes are placed for a camera at azimuth 0 (on +Z, 30° up); scene.environmentRotation turns
// the rig to the catalogue view, so top faces always mirror the big box behind the part, faces
// turned to the side catch the strips and the bevels trace the edges with light.
export const LOOKS = {
  studio: {
    backdrop: { top: [0.9, 0.915, 0.94], bottom: [0.77, 0.79, 0.825] },
    // Dome bands by height (sine of elevation): white table under the part, falling away to a
    // dark gap below the horizon, a thin glow at the horizon, dark walls and ceiling above.
    room: { table: [0.6, 0.6, 0.61], gap: [0.05, 0.052, 0.058], horizon: [0.34, 0.345, 0.355], wall: [0.045, 0.047, 0.052], ceiling: [0.028, 0.029, 0.033] },
    boxes: [
      { size: [8, 3.2], at: [0, 4.4, -8.5], power: 1.6 },
      { size: [7, 7], at: [0, 10, 0], power: 1.4 },
      { size: [2.2, 6.5], at: [-9, 3, 2.5], power: 5 },
      { size: [1.8, 6.5], at: [8, 3.2, -6], power: 4, tint: [0.94, 0.97, 1.0] },
      { size: [6, 3], at: [3, 2, 9.5], power: 0.9 },
    ],
    shadow: 0.36,
  },
  night: {
    backdrop: { top: [0.03, 0.036, 0.052], bottom: [0.008, 0.01, 0.016] },
    room: { table: [0.07, 0.07, 0.075], gap: [0.008, 0.009, 0.012], horizon: [0.06, 0.062, 0.07], wall: [0.01, 0.011, 0.014], ceiling: [0.004, 0.004, 0.006] },
    boxes: [
      { size: [8, 3.5], at: [0, 4.2, -8.5], power: 3 },
      { size: [1.4, 8], at: [-9, 3, 1.5], power: 9, tint: [1.0, 0.92, 0.82] },
      { size: [1.4, 8], at: [8.5, 3.5, -4.5], power: 11, tint: [0.76, 0.85, 1.0] },
    ],
    shadow: 0.72,
  },
};

export function environmentMap(renderer, look) {
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide }));
  const y = normalize(positionLocal).y;
  const { table, gap, horizon, wall, ceiling } = look.room;
  const below = mix(vec3(...table), vec3(...gap), smoothstep(-0.62, -0.08, y));
  const glow = mix(below, vec3(...horizon), smoothstep(-0.05, -0.005, y));
  const sky = mix(glow, vec3(...wall), smoothstep(0.005, 0.12, y));
  dome.material.colorNode = mix(sky, vec3(...ceiling), smoothstep(0.3, 0.9, y));
  env.add(dome);
  for (const b of look.boxes) {
    const box = softbox(b.size[0], b.size[1], b.power, b.tint);
    box.position.set(...b.at);
    box.lookAt(0, 0.5, 0);
    env.add(box);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.015);
  pmrem.dispose();
  env.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return target;
}

// Screen-space sweep: lighter behind the product, falling off towards the bottom and corners.
export function backdropNode(look) {
  const { top, bottom } = look.backdrop;
  const st = screenUV;
  const grad = mix(vec3(...top), vec3(...bottom), smoothstep(0.15, 1.05, st.y));
  const d = length(st.sub(vec2(0.5, 0.42)).mul(vec2(1.25, 1)));
  return grad.mul(float(1).sub(min(d.mul(d).mul(0.22), 0.3)));
}

// Seamless floor: opaque (so it writes depth and normals and the contact occlusion lands on it)
// but painted with the backdrop's own screen-space colour, darkened only where the key light's
// shadow falls, towards a cool shadow tint.
class FloorModel extends THREE.LightingModel {
  constructor(floor) {
    super();
    this.floor = floor;
    this.mask = float(1).toVar('floorShadowMask');
  }

  direct({ lightNode }) {
    if (lightNode.shadowNode !== null) this.mask.mulAssign(lightNode.shadowNode);
  }

  finish({ context }) {
    const shade = this.mask.oneMinus().mul(this.floor.strength);
    const base = this.floor.backdrop;
    context.outgoingLight.rgb.assign(mix(base, base.mul(this.floor.tint), shade));
  }
}

export class FloorMaterial extends THREE.NodeMaterial {
  constructor() {
    super();
    this.lights = true;
    this.strength = uniform(0.4);
    this.tint = uniform(new THREE.Vector3(0.16, 0.18, 0.24));
    this.backdrop = vec3(0.8);
  }

  setupLightingModel() {
    return new FloorModel(this);
  }
}

export function createStudio(scene, look) {
  const mat = new FloorMaterial();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.radius = 10;
  key.shadow.blurSamples = 16;
  scene.add(key, key.target);
  return { floor, key };
}

// The softboxes are placed for a camera 30° up (the catalogue views). A camera looking from `dir`
// (part → camera) turns and tilts the reflected room with it, as a photographer moves the lights
// with the camera, so top faces keep mirroring the big box at any height. Returns the azimuth.
const RIG_ELEVATION = Math.atan2(0.82, Math.SQRT2);
export function aimRoom(scene, dir) {
  const az = Math.atan2(dir.x, dir.z);
  const el = THREE.MathUtils.clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), 0.17, 1.2);
  scene.environmentRotation.set(RIG_ELEVATION - el, az, 0, 'YXZ');
  return az;
}

// Aims the key light relative to the camera azimuth `camAz` (radians): from above and to the
// camera's left, so the shadow falls behind and to the right of the part. `jitter` [az, el]
// (radians) moves it across the softbox for the photo mode's soft shadows. The shadow camera is
// fitted round the part's bounding sphere.
export function aimKey(key, center, radius, camAz, jitter = [0, 0]) {
  const az = camAz - 0.75 + jitter[0];
  const el = 1.12 + jitter[1];
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  key.target.position.copy(center);
  key.position.copy(center).addScaledVector(dir, radius * 6 + 1);
  const cam = key.shadow.camera;
  const r = radius * 1.8;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  cam.near = 0.05;
  cam.far = radius * 12 + 2;
  cam.updateProjectionMatrix();
  key.target.updateMatrixWorld();
  key.updateMatrixWorld();
}
