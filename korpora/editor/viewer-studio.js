// The light around the furniture: a photo studio built as an environment map (soft boxes and bounce for the
// reflections and the soft fill), one key light that casts the shadows, and what the furniture stands in —
// a seamless studio corner (floor and back wall that fade into the background) or a furnished room.
import * as THREE from 'three';
import { S } from './viewer-hw.js';
import { buildRoom, clearRoom } from './viewer-room.js';

// Studio levels, linear radiance. Calibrated so that a front facing the camera shows its decor colour as printed
// (the tone mapping below keeps colours up to ~0.8 untouched); the top reads lighter, the far side darker.
export const KEY = 1.7; // key light, also the only shadow caster
const ENV = 1.0; // environment (soft boxes) intensity
export const KEY_DIR = new THREE.Vector3(-0.35, 0.72, 0.6).normalize(); // front left, high: the camera sits front right
const SOFT = THREE.MathUtils.degToRad(5); // angular radius of the key light: shadows soften with distance

// Khronos PBR Neutral with its toe at 2 % instead of 4 %. The toe takes away the Fresnel reflection of a white
// surround at unit radiance; the studio walls are darker (so that the soft boxes show in gloss), a front reflects
// about half of that, and dark decors came out darker than their swatch. The curve is the same otherwise.
const IDENTITY = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
const NEUTRAL_TOE = /* glsl */ `vec3 CustomToneMapping( vec3 color ) {
  const float Toe = 0.02;
  const float StartCompression = 0.8 - Toe;
  const float Desaturation = 0.15;
  color *= toneMappingExposure;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 2.0 * Toe ? x - x * x / ( 4.0 * Toe ) : Toe;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < StartCompression ) return color;
  float d = 1. - StartCompression;
  float newPeak = 1. - d * d / ( peak + d - StartCompression );
  color *= newPeak / peak;
  float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
  return mix( color, vec3( newPeak ), g );
}`;
const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
// a three.js without the custom hook keeps the stock curve
export const TONE_MAPPING = chunk.includes(IDENTITY)
  ? THREE.CustomToneMapping
  : THREE.NeutralToneMapping;
if (TONE_MAPPING === THREE.CustomToneMapping)
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(IDENTITY, NEUTRAL_TOE);

const THEMES = {
  light: { surface: 0xe7e7e1, background: 0xdcddd6 },
  dark: { surface: 0x2b2d30, background: 0x232528 },
};

function softbox(w, h, radiance, at, look = [0, 1.2, 0]) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  m.color.setScalar(radiance);
  const box = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  box.position.set(...at);
  box.lookAt(...look);
  return box;
}

// The studio as seen by reflections: darker walls so the soft boxes read as shapes in gloss and chrome, a light
// floor for the bounce, a big key box front left, a fill right, a long strip overhead and a rim light behind.
export function studioScene() {
  const env = new THREE.Scene();
  const geo = new THREE.BoxGeometry(30, 14, 30, 1, 10, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + 7) / 14;
    const v = y <= -6.99 ? 0.5 : y >= 6.99 ? 0.3 : 0.2 + 0.12 * t;
    colors.set([v, v, v * 0.98], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  env.add(
    new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })),
  );
  const key = KEY_DIR.clone().multiplyScalar(9);
  env.add(
    softbox(6, 4.5, 9, [key.x, key.y, key.z]),
    softbox(4, 5, 2.8, [9, 2.6, 5]),
    softbox(10, 1.4, 6, [0.5, 6.9, 0.8], [0.5, 0, 0.8]),
    softbox(7, 1.6, 4, [2.5, 4.5, -11]),
    softbox(5, 2.2, 1.4, [-2, 1, 12]),
  );
  return env;
}

export function disposeScene(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}

export function studioEnvironment(renderer) {
  const env = studioScene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  disposeScene(env);
  return texture;
}

export class Stage {
  constructor(viewer) {
    this.v = viewer;
    const scene = viewer.scene;
    scene.environment = studioEnvironment(viewer.renderer);
    scene.environmentIntensity = ENV;
    this.key = new THREE.DirectionalLight(0xffffff, KEY);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 2.5;
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.012;
    scene.add(this.key, this.key.target);
    this.surface = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0 });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.surface);
    this.floor.rotation.x = -Math.PI / 2;
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.surface);
    for (const m of [this.floor, this.wall]) m.receiveShadow = true;
    this.studio = new THREE.Group();
    this.studio.add(this.floor, this.wall);
    this.room = new THREE.Group();
    this.room.visible = false;
    scene.add(this.studio, this.room);
    scene.fog = new THREE.Fog(0xffffff, 10, 40);
    this.base = new THREE.Vector3();
    this.dark = window.matchMedia?.('(prefers-color-scheme: dark)');
    this.onTheme = () => {
      this.applyTheme();
      viewer.changed();
    };
    this.dark?.addEventListener?.('change', this.onTheme);
    this.applyTheme();
  }

  // The theme listener is the scene's one tie to the page: a viewer that is given up drops it, or the page keeps the
  // whole scene graph alive (landing/story.js releases its viewer on a slow device or a lost context).
  dispose() {
    this.dark?.removeEventListener?.('change', this.onTheme);
  }

  applyTheme() {
    const t = this.dark?.matches ? THEMES.dark : THEMES.light;
    this.surface.color.setHex(t.surface);
    this.v.scene.background = new THREE.Color(t.background);
    this.v.scene.fog.color.setHex(t.background);
  }

  // After a new model: the studio corner behind it, the room (only while it shows: its floor and plaster are big
  // bakes), the key light and the shadow frustum around it.
  fit(ext, off) {
    const W = (ext.x1 - ext.x0) * S;
    const D = (ext.z1 - ext.z0) * S;
    const H = ext.y1 * S;
    const back = (ext.z0 + off[2]) * S - 0.0015;
    this.floor.scale.set(60, 60, 1);
    this.floor.position.set(0, 0, back + 30);
    this.wall.scale.set(60, 14, 1);
    this.wall.position.set(0, 7, back);
    this.roomSize = { W, back };
    clearRoom(this.room);
    this.updateRoom();
    const r = Math.hypot(W, H, D) * 0.5;
    this.radius = r;
    const target = new THREE.Vector3(0, H / 2, back + D / 2);
    this.key.target.position.copy(target);
    this.base.copy(target).addScaledVector(KEY_DIR, r * 4);
    this.key.position.copy(this.base);
    const cam = this.key.shadow.camera;
    const span = r * 1.9 + 0.4;
    cam.left = cam.bottom = -span;
    cam.right = cam.top = span;
    cam.near = 0.05;
    cam.far = r * 8 + 2;
    cam.updateProjectionMatrix();
  }

  setRoom(on) {
    if (!on) clearRoom(this.room);
    this.room.visible = on;
    this.studio.visible = !on;
    this.updateRoom();
  }

  // The room is built only while it is shown, once per model: its floor, plaster and skirting are baked textures
  // (tens of MB on the GPU) that the studio view never needs.
  updateRoom() {
    if (this.room.visible && this.roomSize && !this.room.children.length)
      buildRoom(this.v, this.room, this.roomSize);
  }

  // Fog starts behind the furniture, so only the far floor and wall melt into the background.
  updateFog(camera, target) {
    const fog = this.v.scene.fog;
    if (!fog) return;
    const d = camera.position.distanceTo(target);
    fog.near = d + (this.radius ?? 1) * 2.5 + 2;
    fog.far = fog.near + 22;
  }

  // Sample k of the still image: the key light moves within its disc, so shadows get a real penumbra.
  jitter(k) {
    if (!k) {
      this.key.position.copy(this.base);
      return;
    }
    const dir = this.base.clone().sub(this.key.target.position);
    const len = dir.length();
    const a = halton(k, 2) * Math.PI * 2;
    const rr = Math.sqrt(halton(k, 3)) * Math.tan(SOFT) * len;
    const u = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const w = dir.clone().cross(u).normalize();
    this.key.position
      .copy(this.base)
      .addScaledVector(u, Math.cos(a) * rr)
      .addScaledVector(w, Math.sin(a) * rr);
  }
}

export function halton(i, b) {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= b;
    r += f * (n % b);
    n = Math.floor(n / b);
  }
  return r;
}
