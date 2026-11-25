// Assembles the mascot scene: environment, lights, ground contact glow, and the idle animation
// (breathing, jiggle, blink, tassel sway, cursor-follow pupils). Geometry itself lives in
// body.js/face.js/accessories.js — this module only places and moves what they build.
import * as THREE from 'three';
import { createMaterials, jellyMotion } from './materials.js';
import { carbonTwillTextures, satinTextures, feltTextures, radialTextures, irisTextures, scratchTextures } from './textures.js';
import { woodTextures, leatherTextures, windowSkyTexture } from './desk-textures.js';
import { buildBody, GROUND_Y } from './body.js';
import { buildFace } from './face.js';
import { buildHat, buildBow, BOW_Y, BOW_Z } from './accessories.js';
import { buildDesk, animateDust } from './desk.js';
import { addLights, softStudioEnvironment } from './lighting.js';

export { addLights };

export const PALETTE = {
  bg: '#050706', deep: '#0D4A02', bottle: '#297F04', neon: '#5AB60D', olive: '#99E72A',
  softOlive: '#848D68', pale: '#C8DDA6', ink: '#0A0C0A', inkSoft: '#2A2E24', eye: '#F4FAEA', gold: '#D9A521',
};

export function buildScene(renderer, palette = PALETTE, opts = {}) {
  const p = palette;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(p.bg);
  scene.environment = softStudioEnvironment(renderer);

  const textures = {
    carbon: carbonTwillTextures(),
    satin: satinTextures(),
    felt: feltTextures(),
    radial: radialTextures(),
    iris: irisTextures(),
    scratch: scratchTextures(),
    wood: woodTextures(),
    leather: leatherTextures(),
    windowSky: windowSkyTexture(),
  };
  const materials = createMaterials(textures, p, opts);

  const mascot = new THREE.Group();
  const body = buildBody(materials, textures);
  const face = buildFace(materials);
  const hat = buildHat(materials);
  const bow = buildBow(materials);
  bow.position.set(0, BOW_Y, BOW_Z);
  mascot.add(body, face, hat, bow);
  scene.add(mascot);

  // The desk: lacquered oak top, a stack of old books, a brass lamp (the warm practical key) and
  // a night window behind (desk.js) — replaces the old flat ShadowMaterial catcher in a black
  // void. The desk's own top sits exactly at GROUND_Y, so the mascot's feet read as standing on
  // it, and it receives the mascot's contact shadow directly (a real lit surface, not a cutout).
  const desk = buildDesk(materials);
  scene.add(desk.group);

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), materials.glow);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = GROUND_Y + 0.002;
  scene.add(glow);

  // The pool of light the transmissive jelly itself throws on the floor (brief: "каустики/цветен
  // отблясък на пода от пречупената светлина") — drifts on the shared jellyMotion clock, so it
  // never reads as a static decal.
  const caustic = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), materials.caustic);
  caustic.rotation.x = -Math.PI / 2;
  caustic.position.y = GROUND_Y + 0.004;
  scene.add(caustic);

  // В three ≥0.163 `material.envMapIntensity` се чете само ако материалът има СОБСТВЕН envMap;
  // със `scene.environment` важи глобалното `scene.environmentIntensity`, та всички наши индивидуални
  // стойности (дърво 0.05, злато 1.5 …) бяха тихо игнорирани. Връзваме средата към всеки физичен
  // материал (и към клонираните книги) — така отражението се регулира по материал.
  scene.traverse((o) => {
    const m = o.material;
    if (m?.isMeshStandardMaterial) m.envMap = scene.environment;
  });

  addLights(scene, p);

  const pupils = [face.getObjectByName('pupilL'), face.getObjectByName('pupilR')];
  const eyelids = [face.getObjectByName('eyelidL'), face.getObjectByName('eyelidR')];
  const eyeBase = pupils.map((p) => p.position.clone());
  const tassel = hat.getObjectByName('tassel');

  const state = {
    blinkAt: performance.now() + 2400 + Math.random() * 2000,
    blinkPhase: 0,
    jiggle: 0,
  };

  // `impulse()` lets main.js kick a click/tap into the jelly's secondary motion.
  function impulse() {
    state.jiggle = 1;
  }

  function animate(t, nowMs, pointer, reducedMotion) {
    if (reducedMotion) return;
    const breathe = Math.sin(t * 1.1) * 0.016;
    mascot.scale.set(1 - breathe * 0.6, 1 + breathe, 1 - breathe * 0.6);

    state.jiggle *= 0.92;
    jellyMotion.uTime.value = t;
    jellyMotion.uJiggle.value = 0.07 + state.jiggle * 0.85;
    animateDust(desk.dust, t);

    if (tassel) {
      tassel.rotation.z = Math.sin(t * 1.6) * 0.05;
      tassel.rotation.x = Math.cos(t * 1.3) * 0.03;
    }

    if (nowMs > state.blinkAt && state.blinkPhase === 0) state.blinkPhase = 0.0001;
    if (state.blinkPhase > 0) {
      state.blinkPhase += 0.09;
      const s = state.blinkPhase < 1 ? Math.sin(state.blinkPhase * Math.PI) : 0;
      for (const lid of eyelids) if (lid) lid.scale.y = 0.02 + s * 1.05;
      if (state.blinkPhase >= 1) {
        state.blinkPhase = 0;
        state.blinkAt = nowMs + 3600 + Math.random() * 2400;
      }
    }

    pupils.forEach((p, i) => {
      if (!p) return;
      const base = eyeBase[i];
      const tx = base.x + pointer.x;
      const ty = base.y + pointer.y;
      p.position.x += (tx - p.position.x) * 0.15;
      p.position.y += (ty - p.position.y) * 0.15;
    });
  }

  return { scene, mascot, materials, animate, impulse };
}
