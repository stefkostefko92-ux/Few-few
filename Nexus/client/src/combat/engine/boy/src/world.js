// Builds the courtyard, the two knights and every light and effect, then advances them per frame.
import * as THREE from 'three/webgpu';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { noiseTexture, rippleTexture, puddleTexture } from './fields.js';
import { capeTextureAzure, capeTextureCrimson, shieldTextures, bannerTexture } from './heraldry.js';
import { loadBakedSets } from './baked.js';
import { createMaterials } from './materials.js';
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
import { installFog } from './fog.js';
import { setNoise, U } from './tsl.js';
import { QUALITY } from './quality.js';

export const FX_LAYER = 1;
const UP = new THREE.Vector3(0, 1, 0);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function makeLights(scene, quality) {
  const moon = new THREE.DirectionalLight(0xa9bbff, 1.25);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 90 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.025;
  moon.shadow.radius = 3;
  // Cascades cover the whole courtyard in wide shots and stay crisp at the fighters' feet.
  if (quality.csm) moon.shadow.shadowNode = new CSMShadowNode(moon, { cascades: 3, maxFar: 70, mode: 'practical', lightMargin: 30 });
  // Cool back light that follows the camera and draws a rim along armour silhouettes.
  const rim = new THREE.DirectionalLight(0x9db4ff, 0.45);
  const hemi = new THREE.HemisphereLight(0x223149, 0x0b0907, 0.3);
  scene.add(moon, moon.target, rim, rim.target, hemi);
  return { moon, rim, hemi };
}

// Budget per set: the courtyard floor and walls fill the frame and get the hero resolution.
const textureBudget = (q) => ({ default: q.texSize, cobble: q.texHero, wall: q.texHero });

export async function buildWorld(renderer, hud, quality) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  const aniso = renderer.backend.isWebGPUBackend ? 16 : 8;
  hud.loading('load_forge', 0.02);
  await nextFrame();
  const noise = noiseTexture();
  setNoise(noise);
  const S = await loadBakedSets('tex/', textureBudget(quality), aniso, (k, n) => hud.loading(k < n * 0.5 ? 'load_forge' : 'load_cobbles', 0.05 + (k / n) * 0.45));
  hud.loading('load_walls', 0.55);
  await nextFrame();
  const T0 = { capeA: capeTextureAzure(), capeB: capeTextureCrimson(), shield: shieldTextures(), banner: bannerTexture(), ripple: rippleTexture(), puddle: puddleTexture() };

  const M = createMaterials(S, T0);
  const scene = new THREE.Scene();
  installFog(scene);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 300);
  camera.position.set(6, 9, 14);
  camera.layers.enable(FX_LAYER);

  hud.loading('load_fire', 0.65);
  await nextFrame();
  const sky = createSky();
  const ground = createGround(S, { ripple: T0.ripple, puddle: T0.puddle, camera, reflections: quality.reflections });
  scene.add(sky.mesh, ground.mesh, createCastle(M).group, createBanners(M));
  const fires = createFires(M, { shadowBrazier: 1 });
  const brazierShadow = fires.lights[1].light;
  brazierShadow.castShadow = quality.shadow;
  // The burning gate casts the portcullis into the fog as god rays (ultra tier).
  const gateLight = fires.lights[fires.lights.length - 1].light;
  gateLight.shadow.camera.far = 40;
  gateLight.castShadow = quality.godrays;
  fires.particles[1].layers.set(FX_LAYER);
  fires.particles[2].layers.set(FX_LAYER);
  const rain = createRain(QUALITY.ultra.rain);
  rain.setCount(quality.rain);
  rain.group.traverse((o) => o.layers.set(FX_LAYER));
  const fx = createFX();
  for (const o of fx.overlays) o.traverse((c) => c.layers.set(FX_LAYER));
  const breath = createBreath();
  breath.mesh.layers.set(FX_LAYER);
  scene.add(fires.group, rain.group, fx.group, breath.mesh);
  const lights = makeLights(scene, quality);

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
  hud.loading('load_shaders', 0.75);
  await nextFrame();
  // The moon's cascades must bind to the story camera, not the capture's cube camera.
  const hidden = [...batches, capeA.mesh, capeB.mesh, rain.group, fx.group, breath.mesh];
  hidden.forEach((o) => (o.visible = false));
  ground.setReflections(false);
  lights.moon.castShadow = false;
  fires.update(0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(scene, 0, 0.1, 200, { size: 256, position: new THREE.Vector3(0.2, 1.6, 0.6) }).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  hidden.forEach((o) => (o.visible = true));
  ground.setReflections(quality.reflections);
  lights.moon.castShadow = true;

  return {
    scene, camera, sky, ground, fires, brazierShadow, gateLight, rain, fx, breath, batcher, A, B, ...lights,
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
  U.time.value = T;
  W.fires.update(T);
  wind.x = 1.4 + Math.sin(T * 0.7) * 1.1 + Math.sin(T * 2.3) * 0.5;
  wind.z = 0.6 + Math.sin(T * 0.5 + 1) * 0.5;
  wind.phase = T;
  U.wind.value.set(wind.x * 0.4, 0, wind.z * 0.4);

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
