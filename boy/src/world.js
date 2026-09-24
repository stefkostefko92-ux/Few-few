// Builds the courtyard, the two knights and every light and effect, then advances them per frame.
import * as THREE from 'three';
import { installHeightFog } from './shaders.js';
import { setMaxAnisotropy, cobbleTextures, wallTextures, metalTextures, fabricTextures, mailTextures, leatherTextures, woodTextures, dropletTextures } from './textures.js';
import { noiseTexture, rippleTexture, puddleTexture } from './fields.js';
import { capeTextureAzure, capeTextureCrimson, shieldTextures, bannerTexture } from './heraldry.js';
import { createMaterials, applyGrime } from './materials.js';
import { buildKnight } from './armor.js';
import { longsword, armingSword, heaterShield } from './weapons.js';
import { RigidBatcher } from './batcher.js';
import { Cape } from './cloth.js';
import { Fighter } from './fighter.js';
import { createSky } from './sky.js';
import { createGround } from './ground.js';
import { createCastle, createBanners } from './castle.js';
import { createFires } from './fire.js';
import { createRain } from './rain.js';
import { createFX } from './fx.js';
import { createBreath } from './atmos.js';
import { QUALITY } from './quality.js';
import { FOG } from './config.js';

export const FX_LAYER = 1;
const UP = new THREE.Vector3(0, 1, 0);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function makeTextures(hud) {
  const T0 = {};
  const steps = [
    ['load_forge', () => Object.assign(T0, { metal: metalTextures(), drops: dropletTextures(), mail: mailTextures(), leather: leatherTextures(), fabric: fabricTextures(), noise: noiseTexture() })],
    ['load_cobbles', () => Object.assign(T0, { cobble: cobbleTextures(1024), ripple: rippleTexture(), puddle: puddleTexture() })],
    ['load_walls', () => Object.assign(T0, { wall: wallTextures(1024), wood: woodTextures(), capeA: capeTextureAzure(), capeB: capeTextureCrimson(), shield: shieldTextures(), banner: bannerTexture() })],
  ];
  for (let i = 0; i < steps.length; i++) {
    hud.loading(steps[i][0], i / 5);
    await nextFrame();
    steps[i][1]();
  }
  return T0;
}

function makeLights(scene) {
  const moon = new THREE.DirectionalLight(0xa9bbff, 1.25);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 90 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.025;
  moon.shadow.radius = 3;
  // Cool back light that follows the camera and draws a rim along armour silhouettes.
  const rim = new THREE.DirectionalLight(0x9db4ff, 0.45);
  const hemi = new THREE.HemisphereLight(0x223149, 0x0b0907, 0.3);
  scene.add(moon, moon.target, rim, rim.target, hemi);
  return { moon, rim, hemi };
}

export async function buildWorld(renderer, hud, quality) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
  installHeightFog();
  const T0 = await makeTextures(hud);
  hud.loading('load_fire', 3 / 5);
  await nextFrame();

  const M = createMaterials(T0);
  applyGrime([M.steelA, M.steelB, M.mail, M.leather], T0.noise);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG.color.clone(), 0, 1);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 300);
  camera.position.set(6, 9, 14);
  camera.layers.enable(FX_LAYER);

  const sky = createSky(T0.noise);
  const ground = createGround(T0, { reflections: quality.reflections, noise: T0.noise, ripple: T0.ripple, puddle: T0.puddle });
  const bannerTime = { value: 0 };
  scene.add(sky.mesh, ground.mesh, createCastle(M).group, createBanners(M, bannerTime));
  const fires = createFires(M, { shadowBrazier: 1, noise: T0.noise });
  const brazierShadow = fires.lights[1].light;
  brazierShadow.castShadow = quality.shadow;
  fires.particles[1].layers.set(FX_LAYER);
  fires.particles[2].layers.set(FX_LAYER);
  const rain = createRain(QUALITY.ultra.rain);
  rain.setCount(quality.rain);
  rain.group.traverse((o) => o.layers.set(FX_LAYER));
  const fx = createFX();
  for (const o of fx.overlays) o.traverse((c) => c.layers.set(FX_LAYER));
  const breath = createBreath(T0.noise);
  breath.mesh.layers.set(FX_LAYER);
  scene.add(fires.group, rain.group, fx.group, breath.mesh);
  const lights = makeLights(scene);

  const knightA = buildKnight(M, 'A');
  const knightB = buildKnight(M, 'B');
  const swordA = longsword(M);
  const swordB = armingSword(M);
  const shieldB = heaterShield(M);
  const batcher = new RigidBatcher();
  for (const k of [knightA, knightB]) for (const name of Object.keys(k.pieces)) batcher.add(k.parts[name], k.pieces[name]);
  batcher.add(swordA.part, swordA.pieces);
  batcher.add(swordB.part, swordB.pieces);
  batcher.add(shieldB.part, shieldB.pieces);
  const batches = batcher.build();
  batches.forEach((b) => scene.add(b));
  const capeA = new Cape(M.capeA, { length: 0.98, flare: 0.55 });
  const capeB = new Cape(M.capeB, { length: 1.24, flare: 0.85 });
  scene.add(capeA.mesh, capeB.mesh);
  const A = new Fighter('A', knightA, swordA, capeA, null);
  const B = new Fighter('B', knightB, swordB, capeB, shieldB);

  // Image-based lighting captured from the courtyard itself, so the armour reflects real fires.
  hud.loading('load_shaders', 4 / 5);
  await nextFrame();
  const hidden = [...batches, capeA.mesh, capeB.mesh, rain.group, fx.group, breath.mesh];
  hidden.forEach((o) => (o.visible = false));
  ground.setReflections(false);
  fires.update(0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(scene, 0, 0.1, 200, { size: 256, position: new THREE.Vector3(0.2, 1.6, 0.6) }).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  hidden.forEach((o) => (o.visible = true));
  ground.setReflections(quality.reflections);

  return {
    scene, camera, sky, ground, fires, brazierShadow, rain, fx, breath, batcher, A, B, bannerTime, ...lights,
    wind: { x: 1.2, y: 0, z: 0.5, phase: 0 },
    prevBreath: [0, 0],
  };
}

const back = new THREE.Vector3();
const tmp = new THREE.Vector3();
const jitter = new THREE.Vector3();
const headFwd = new THREE.Vector3();

// Rain drops bursting on helmets and pauldrons.
function splashOnArmour(W, f, dT) {
  const w = f.rig.w;
  for (let n = dT * 14; n > 0; n -= 1) {
    if (Math.random() >= n) continue;
    const pick = Math.random();
    const p = pick < 0.34 ? w.head : pick < 0.67 ? w.shoulderR : w.shoulderL;
    jitter.set((Math.random() - 0.5) * 0.12, pick < 0.34 ? 0.21 : 0.1, (Math.random() - 0.5) * 0.12);
    W.fx.impact(tmp.copy(p).add(jitter), UP, 0.05, 'water');
  }
}

// Story-time animation of everything except camera, lights and post-processing.
export function animateWorld(W, T, dT) {
  const { wind, A, B } = W;
  W.scene.fog.near = T;
  W.fires.update(T);
  W.sky.uniforms.uTime.value = T;
  W.ground.uniforms.uTime.value = T;
  W.rain.uniforms.uTime.value = T;
  W.bannerTime.value = T;
  wind.x = 1.4 + Math.sin(T * 0.7) * 1.1 + Math.sin(T * 2.3) * 0.5;
  wind.z = 0.6 + Math.sin(T * 0.5 + 1) * 0.5;
  wind.phase = T;
  W.fires.uniforms.uWind.value.set(wind.x * 0.4, 0, wind.z * 0.4);
  W.rain.uniforms.uWind.value.set(wind.x * 0.8, 0, wind.z * 0.8);

  A.update(T, dT, B);
  B.update(T, dT, A);
  W.batcher.update();
  [A, B].forEach((f, i) => {
    back.set(-Math.sin(f.root.yaw), 0, -Math.cos(f.root.yaw));
    f.cape.step(dT, f.rig.capeAnchorsWorld, f.rig.colliders, wind, back);
    if (dT <= 0) return;
    splashOnArmour(W, f, dT);
    const br = f.P.breath;
    if (W.prevBreath[i] > 0 && br <= 0) {
      headFwd.set(0, 0, 1).applyQuaternion(f.rig.w.qHead);
      W.breath.emit(tmp.copy(f.rig.w.head).addScaledVector(headFwd, 0.17).addScaledVector(UP, 0.05), headFwd);
    }
    W.prevBreath[i] = br;
  });
  W.breath.update(dT, wind);
  W.fx.trails[0].push(T, A.bladeBase, A.bladeTip);
  W.fx.trails[1].push(T, B.bladeBase, B.bladeTip);
  W.fx.trails[0].update(T);
  W.fx.trails[1].update(T);
}
