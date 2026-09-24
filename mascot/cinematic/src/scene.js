// Assembles the mascot scene: environment, lights, ground contact glow, and the idle animation
// (breathing, jiggle, blink, tassel sway, cursor-follow pupils). Geometry itself lives in
// body.js/face.js/accessories.js — this module only places and moves what they build.
import * as THREE from 'three';
import { createMaterials, jellyMotion } from './materials.js';
import { carbonTwillTextures, satinTextures, feltTextures, radialTextures, coreGlowTexture } from './textures.js';
import { buildBody, GROUND_Y } from './body.js';
import { buildFace } from './face.js';
import { buildHat, buildBow, BOW_Y, BOW_Z } from './accessories.js';

export const PALETTE = {
  bg: '#050706', deep: '#0D4A02', bottle: '#297F04', neon: '#5AB60D', olive: '#99E72A',
  softOlive: '#848D68', pale: '#C8DDA6', ink: '#0A0C0A', inkSoft: '#2A2E24', eye: '#F4FAEA', gold: '#D9A521',
};

function addLights(scene) {
  // Softer, off-axis key: the previous steep top-down angle plus a tight clearcoat was exactly
  // what burned a hard white disc into the crown under the hat. Lower angle, a touch less
  // intensity, and a much rougher clearcoat (materials.js) spread that highlight into a soft glint.
  const key = new THREE.DirectionalLight(0xfff2d6, 1.5);
  key.position.set(-2.8, 2.2, 4.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 10;
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 2;
  key.shadow.camera.bottom = -2;
  key.shadow.bias = -0.0018;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdfeee0, 1.0);
  fill.position.set(3, 1.6, 3.2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xc8dda6, 1.1);
  rim.position.set(0.4, 1.3, -3.4);
  scene.add(rim);

  const underglow = new THREE.PointLight(0x99e72a, 0.9, 4, 2);
  underglow.position.set(0, -0.9, 1.1);
  scene.add(underglow);

  // Soft fill lifting the lower-front half from underneath/in front — the brief's "мек вътрешен
  // fill отдолу-отпред" — so the belly/chin do not fall into shadow relative to the bright crown.
  const underFill = new THREE.PointLight(0xcdf29a, 0.7, 5, 1.6);
  underFill.position.set(0, -0.4, 2.4);
  scene.add(underFill);

  // Bright overhead top light so the crown/shoulders read lime, not olive-black.
  const overhead = new THREE.DirectionalLight(0xeaffcf, 0.75);
  overhead.position.set(0, 5, 1.2);
  scene.add(overhead);

  scene.add(new THREE.HemisphereLight(0x3a5424, 0x0a1206, 0.6));
}

// A hand-authored soft studio environment instead of three/addons' RoomEnvironment: that preset's
// area lights are tuned for a plain-PBR demo and are far brighter than a close-up mascot render
// can absorb — glass/transmission surfaces (the lens, the jelly itself) sampled it as an
// unclipped hotspot that bloomed into a solid white disc over both eyes. A dim gradient sky plus
// three soft rectangular panels gives the same "photographed, not flat-lit" read at a brightness
// the tone mapper can actually resolve.
function softStudioEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color(0x141d10) }, bottom: { value: new THREE.Color(0x020302) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }',
    }),
  );
  envScene.add(sky);
  const panel = (x, y, z, ry, w, h, color, intensity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.material.color.multiplyScalar(intensity);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    envScene.add(m);
  };
  panel(-4, 5, 3, Math.PI * 0.15, 6, 6, 0xfff3d8, 0.7); // key, warm, upper-left
  panel(4, 1.5, 4, -Math.PI * 0.2, 5, 5, 0xdfeee0, 0.3); // fill, frontal
  panel(0, -1.5, -5, Math.PI, 6, 4, 0x5ab60d, 0.5); // rim/contra, green
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.03).texture;
  sky.geometry.dispose();
  sky.material.dispose();
  return env;
}

export function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.bg);
  scene.environment = softStudioEnvironment(renderer);

  const textures = {
    carbon: carbonTwillTextures(),
    satin: satinTextures(),
    felt: feltTextures(),
    radial: radialTextures(),
    core: coreGlowTexture(),
  };
  const materials = createMaterials(textures, PALETTE);

  const mascot = new THREE.Group();
  const body = buildBody(materials, textures);
  const face = buildFace(materials);
  const hat = buildHat(materials);
  const bow = buildBow(materials);
  bow.position.set(0, BOW_Y, BOW_Z);
  mascot.add(body, face, hat, bow);
  scene.add(mascot);

  // Contact shadow + a soft radial glow instead of the stray beam/blob the previous version had
  // in the top-left corner (defect #7): both sit flush on the ground, centered under the mascot.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), materials.glow);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = GROUND_Y + 0.002;
  scene.add(glow);

  // Three small twinkle accents in the scene air, as in the flat brief's sparkle marks — not on
  // the body itself, so they read as studio dust/glints rather than a light source on the jelly.
  const sparkleGeo = new THREE.PlaneGeometry(1, 1);
  for (const [x, y, z, s] of [[-1.55, 0.75, 0.6, 0.05], [1.5, -0.15, 0.9, 0.035], [-1.15, -0.85, 1.1, 0.03]]) {
    const spark = new THREE.Mesh(sparkleGeo, materials.sparkle);
    spark.position.set(x, y, z);
    spark.scale.setScalar(s);
    spark.rotation.z = Math.PI / 4;
    scene.add(spark);
  }

  addLights(scene);

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
