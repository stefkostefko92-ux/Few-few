// Builds the courtyard, the two knights and every light and effect, then advances them per frame.
import * as THREE from 'three/webgpu';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { noiseTexture, rippleTexture, puddleTexture } from './fields.js';
import { capeTextureAzure, capeTextureCrimson, shieldTextures, bannerTexture } from './heraldry.js';
import { loadBakedSets } from './baked.js';
import { createMaterials } from './materials.js';
import { buildKnight } from './armor.js';
import { longsword, armingSword, heaterShield } from './weapons.js';
import { shortSword, staff, bow, mace } from './weapons-ranged.js';
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
import { createProjectiles } from './ranged.js';
import { setNoise, U } from './tsl.js';
import { QUALITY } from './quality.js';
import { tintedMaterials, weaponKit, hasShieldKit, giantMaterials, ghostMaterials, ghostCapeMaterial } from './loadout.js';
import { bodyKind, beastSpecies, beastBodyType, giantScale, WRAITH_HOVER } from './beast-config.js';
import { buildBeast } from './beast-geo.js';
import { BeastFighter } from './beast-fighter.js';
import { buildSerpent } from './serpent-geo.js';
import { SerpentFighter } from './serpent-fighter.js';
import { buildSpider } from './spider-geo.js';
import { SpiderFighter } from './spider-fighter.js';
import { partBuildFor } from './fighter-scale.js';

// 4b кръг 2: „без крака, реещ се" — призракът пренася рицарската геометрия, но краката/фаулдите
// просто не влизат в batcher-а (виж kind==='wraith' клона долу); rig-ът продължава да ги смята
// (нулев риск за IK-a), само нищо не ги рисува.
const WRAITH_HIDE_PARTS = new Set(['tassetR', 'tassetL', 'thighL', 'thighR', 'shinL', 'shinR', 'footR', 'footL']);

// 4a.4 (кръг 2): избира builder-а по кита на слота. 'sword' пази ОРИГИНАЛНИЯ вид (A=longsword
// двуръчен, B=armingSword едноръчен+щит) — нулев риск за базовата линия.
function buildWeapon(kit, slot, M) {
  if (kit === 'shortsword') return shortSword(M);
  if (kit === 'staff') return staff(M);
  if (kit === 'bow') return bow(M);
  if (kit === 'heavy') return mace(M);
  return slot === 'A' ? longsword(M) : armingSword(M);
}

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
  const hemi = new THREE.HemisphereLight(0x3a4a66, 0x1a130c, 0.3);
  // Nexus: топъл преден „ключ“ откъм камерата (като отблясък от факлите). Без сянка — нулева цена
  // за shadow map; без него в картата на страницата бойците бяха черни силуети срещу луната.
  const key = new THREE.DirectionalLight(0xffc98f, 1.1);
  scene.add(moon, moon.target, rim, rim.target, hemi, key, key.target);
  return { moon, rim, hemi, key };
}

export function aimKeyLight(key, camPos, center, intensity) {
  key.intensity = intensity;
  key.target.position.copy(center).setY(1.2);
  key.position.copy(camPos).addScaledVector(UP, 3);
}

// Budget per set: the courtyard floor and walls fill the frame and get the hero resolution.
const textureBudget = (q) => ({ default: q.texSize, cobble: q.texHero, wall: q.texHero });

// 4a.4: loadout = { heroTint, foeTint, heroKit, foeKit } (виж loadout.js — clone-and-tint на
// steelA/steelB/goldB/brass/blade/bladeDark, само за клас-специфичните материали; всичко
// останало от M остава СПОДЕЛЕНО между двамата бойци и сцената, точно както в оригинала на boy;
// kit-овете решават формата на оръжието/дали B носи щит — виж buildWeapon/hasShieldKit горе).
export async function buildWorld(renderer, hud, quality, loadout = {}) {
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

  const heroKit = loadout.heroKit || 'sword';
  const foeKit = loadout.foeKit || 'sword';
  const heroM = tintedMaterials(M, loadout.heroTint);
  const foeM = tintedMaterials(M, loadout.foeTint);
  const knightA = buildKnight(heroM, 'A');
  const swordA = buildWeapon(heroKit, 'A', heroM);
  const batcher = new RigidBatcher();
  for (const name of Object.keys(knightA.pieces)) batcher.add(knightA.parts[name], knightA.pieces[name]);
  batcher.add(swordA.part, swordA.pieces);
  const capeA = new Cape(M.capeA, { length: 0.98, flare: 0.55 });

  // 4b: слот B е рицар/голям хуманоид/призрак (рицарският риг, само материал/мащаб/hover се
  // менят — виж fighter.js applyGiantScale/opts.hover) ИЛИ истински звяр (BeastRig/BeastFighter,
  // beast-rig.js/beast-fighter.js) — избрано по foe.sprite (beast-config.js bodyKind), не по
  // оръжие. Batcher-ът е СПОДЕЛЕН (общи материали = общи draw call-ове) и за двата клона. Звярът
  // няма плащ (BeastFighter.cape е инертна заглушка) — истинският Cape симулатор дори не се
  // строи, иначе статично, никога степвано платно щеше да виси в сцената (нищо не го стъпва).
  const kind = bodyKind(loadout.foeSprite);
  let B;
  let capeB = null;
  let beastSkinMesh = null;
  if (kind === 'beast') {
    // 4b кръг 3: 'quad' (rat/boar/wolf/drake) И 'spider' вече са SDF-скинирани SkinnedMesh
    // (beast-sdf.js/spider-sdf.js) — 'serpent' остава СОБСТВЕН риг (сегментна верига, вече
    // прегледан и одобрен) — виж beast-config.js bodyType.
    const species = beastSpecies(foeKit);
    const bt = beastBodyType(foeKit);
    const builder = bt === 'serpent' ? buildSerpent : bt === 'spider' ? buildSpider : buildBeast;
    const beast = builder(species);
    for (const name of Object.keys(beast.pieces)) batcher.add(beast.rig.parts[name], beast.pieces[name]);
    if (beast.skin) beastSkinMesh = beast.skin.mesh; // THREE.SkinnedMesh — извън batcher-а.
    const FighterCls = bt === 'serpent' ? SerpentFighter : bt === 'spider' ? SpiderFighter : BeastFighter;
    B = new FighterCls('B', species, beast);
  } else {
    // 4b кръг 2: призрачният плащ е тониран към същата призрачна палитра (ghostMaterials) —
    // не буквално разкъсана геометрия (cloth.js остава непипнат — нулев риск за симулацията),
    // но вече не е несъвместимото яркочервено наметало на рицар.
    const capeMat = kind === 'wraith' ? ghostCapeMaterial(M.capeB) : M.capeB;
    capeB = new Cape(capeMat, { length: kind === 'wraith' ? 1.5 : 1.24, flare: kind === 'wraith' ? 1.1 : 0.85 });
    const bodyM = kind === 'giant' ? giantMaterials(foeM, loadout.foeSprite) : kind === 'wraith' ? ghostMaterials(foeM) : foeM;
    const knightB = buildKnight(bodyM, 'B');
    const swordB = buildWeapon(foeKit, 'B', bodyM);
    // Едрите хуманоиди никога не носят щит (юмрук/боздуган — brief 4b), независимо от кита.
    const shieldB = kind !== 'giant' && hasShieldKit(foeKit) ? heaterShield(bodyM) : null;
    for (const name of Object.keys(knightB.pieces)) {
      if (kind === 'wraith' && WRAITH_HIDE_PARTS.has(name)) continue; // „без крака, реещ се" — виж бележката горе.
      batcher.add(knightB.parts[name], knightB.pieces[name]);
    }
    batcher.add(swordB.part, swordB.pieces);
    if (shieldB) batcher.add(shieldB.part, shieldB.pieces);
    if (kind === 'giant') capeB.mesh.visible = false; // мащабът на тялото не се пренася в плата — виж fighter-scale.js бележката.
    const opts = kind === 'giant' ? { scale: giantScale(loadout.foeSprite), partScale: partBuildFor(loadout.foeSprite) } : kind === 'wraith' ? { hover: WRAITH_HOVER } : {};
    B = new Fighter('B', knightB, swordB, capeB, shieldB, opts);
  }
  const batches = batcher.build();
  batches.forEach((b) => scene.add(b));
  const ranged = createProjectiles();
  scene.add(capeA.mesh, ranged.group);
  if (capeB) scene.add(capeB.mesh);
  if (beastSkinMesh) scene.add(beastSkinMesh);
  const A = new Fighter('A', knightA, swordA, capeA, null);

  // Image-based lighting captured from the courtyard itself, so the armour reflects real fires.
  hud.loading('load_shaders', 0.75);
  await nextFrame();
  // The moon's cascades must bind to the story camera, not the capture's cube camera.
  const hidden = [...batches, capeA.mesh, rain.group, fx.group, breath.mesh];
  if (capeB) hidden.push(capeB.mesh);
  if (beastSkinMesh) hidden.push(beastSkinMesh);
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
    scene, camera, sky, ground, fires, brazierShadow, gateLight, rain, fx, breath, batcher, ranged, A, B, ...lights,
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
