// Assembles the mascot scene: environment, lights, ground contact glow, and the idle animation
// (breathing, jiggle, blink, tassel sway, cursor-follow pupils). Geometry itself lives in
// body.js/face.js/accessories.js — this module only places and moves what they build.
import * as THREE from 'three';
import { createMaterials, jellyMotion } from './materials.js';
import { carbonTwillTextures, satinTextures, feltTextures, radialTextures, irisTextures, scratchTextures, woodTextures, leatherTextures, windowSkyTexture } from './textures.js';
import { buildBody, GROUND_Y } from './body.js';
import { buildFace } from './face.js';
import { buildHat, buildBow, BOW_Y, BOW_Z } from './accessories.js';
import { buildDesk, animateDust } from './desk.js';

export const PALETTE = {
  bg: '#050706', deep: '#0D4A02', bottle: '#297F04', neon: '#5AB60D', olive: '#99E72A',
  softOlive: '#848D68', pale: '#C8DDA6', ink: '#0A0C0A', inkSoft: '#2A2E24', eye: '#F4FAEA', gold: '#D9A521',
};

export function addLights(scene, p) {
  // Warm practical key, aimed from the desk lamp's own position (desk.js LAMP_POS) so the cast
  // shadow lines up with the lit brass fixture instead of an invisible studio softbox — this is
  // the directional stand-in that actually casts the shadow; the lamp's own PointLight (desk.js)
  // supplies the local bulb highlight without the cost of a second shadow map.
  const key = new THREE.DirectionalLight(0xffcf9e, 1.85);
  key.position.set(1.35, 2.0, -0.1);
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

  // Cool moonlight through the window behind, opposite the lamp — kept deliberately weak (a thin
  // rim only) so the warm lamp stays the dominant read and the desk does not wash out cyan-white
  // (2026-09-25 review regression: the moonlight was overpowering the practical key).
  const fill = new THREE.DirectionalLight(0x9fb4ff, 0.28);
  fill.position.set(-2.6, 1.9, -3.4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xaebfff, 0.4);
  rim.position.set(0.4, 1.3, -3.4);
  scene.add(rim);

  // No point light lives under the bow tie. An earlier version had one here (`underglow`,
  // positioned right behind the bow at y=-0.9) — through the jelly's transmission=1 material any
  // point source that close to the surface bakes a soft green disc straight onto the belly, read
  // as a stray "glow under the bow tie" (2026-09-25 brief). The jelly's own body-wide emissive
  // gradient (materials.js `withRimGlow`) already carries the inner-light read; this light is
  // guarded absent by `test/geometry.test.js` (no PointLight within the bow's own vertical band).

  // Soft fill lifting the lower-front half from underneath/in front — the brief's "мек вътрешен
  // fill отдолу-отпред" — so the belly/legs do not fall into shadow relative to the bright crown.
  // Low and only lightly forward (NOT pulled up toward eye height — an earlier revision moved this
  // too close to the face and washed the eyes/lens out to a flat white disc, a real regression
  // caught in review) and clear of the bow's own band (test/geometry.test.js pins that distance).
  const underFill = new THREE.PointLight(new THREE.Color(p.pale), 0.45, 5, 1.7);
  underFill.position.set(0, -0.85, 2.1);
  scene.add(underFill);

  // Bright overhead top light so the crown/shoulders read the accent, warm-leaning to match the
  // lamp rather than the cool window.
  const overhead = new THREE.DirectionalLight(new THREE.Color(p.gold), 0.6);
  overhead.position.set(0.6, 5, 0.6);
  scene.add(overhead);

  // Sky side cool (window), ground side warm (wood/lamp bounce) — the ambient half of the
  // warm/cool split.
  scene.add(new THREE.HemisphereLight(0x1c2740, 0x2a1706, 0.55));
}

// A hand-authored soft studio environment instead of three/addons' RoomEnvironment: that preset's
// area lights are tuned for a plain-PBR demo and are far brighter than a close-up mascot render
// can absorb — glass/transmission surfaces (the lens, the jelly itself) sampled it as an
// unclipped hotspot that bloomed into a solid white disc over both eyes. A dim gradient sky plus
// three soft rectangular panels gives the same "photographed, not flat-lit" read at a brightness
// the tone mapper can actually resolve.
function softStudioEnvironment(renderer, p) {
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
  panel(-4, 5, 3, Math.PI * 0.15, 6, 6, 0xfff3d8, 0.7); // lamp key, warm, upper-left
  panel(4, 1.5, 4, -Math.PI * 0.2, 5, 5, 0x9fb4ff, 0.32); // moonlight fill, cool, frontal
  panel(0, -1.5, -5, Math.PI, 6, 4, new THREE.Color(0x6f8fdb), 0.45); // window rim/contra, cool blue
  // A higher blur sigma than the three.js default keeps this a soft studio glow instead of a sharp
  // mirror of the three flat panels — a crisp panel edge reflected in the lens/iris/jelly reads as
  // a stray dark diamond floating in the eye, not a photographed softbox.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.35).texture;
  sky.geometry.dispose();
  sky.material.dispose();
  return env;
}

export function buildScene(renderer, palette = PALETTE) {
  const p = palette;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(p.bg);
  scene.environment = softStudioEnvironment(renderer, p);

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
  const materials = createMaterials(textures, p);

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
