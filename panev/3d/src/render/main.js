// Panev 3D: boots the renderer (WebGPU, WebGL 2 as fallback), the studio and what stands in it —
// a part, or the part installed with its catalogue partner — runs the real-time view with orbit
// controls and exposes the API used by the interface and the batch renderer (window.panev3d).
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG, byId } from '../catalog.js';
import { LOOKS, environmentMap, backdropNode, createStudio, aimKey, aimRoom } from './studio.js';
import { FINISHES, createMaterials, createHardware, createForged } from './materials.js';
import { stage, viewDirection } from './stage.js';
import { partnerOf } from './assembly.js';
import { frame } from './framing.js';
import { lookUniforms, createInteractive } from './pipeline.js';
import { createStills } from './photo.js';
import { loadSets } from './textures.js';

// Older Chromium builds reject the identity swizzle three.js passes to createView (see boy/).
function acceptIdentitySwizzle() {
  const proto = globalThis.GPUTexture?.prototype;
  if (!proto) return;
  const createView = proto.createView;
  proto.createView = function view(desc) {
    if (desc?.swizzle !== 'rgba') return createView.call(this, desc);
    const { swizzle, ...rest } = desc;
    return createView.call(this, rest);
  };
}

// Frames rendered after the last change (about a second on a real GPU): enough for TRAA and the
// temporal AO to converge, then the view idles and the GPU rests.
const SETTLE_FRAMES = 60;

export async function boot({ canvas, onReady, texBase = 'tex/' }) {
  const params = new URLSearchParams(location.search);
  acceptIdentitySwizzle();
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, forceWebGL: params.has('webgl') });
  await renderer.init();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 50);
  const P = lookUniforms();
  let settle = SETTLE_FRAMES;
  const wake = () => {
    settle = SETTLE_FRAMES;
  };
  let lookName = LOOKS[params.get('look')] ? params.get('look') : 'studio';
  let envTarget = null;
  const studio = createStudio(scene, LOOKS[lookName]);
  function setLook(name) {
    if (!LOOKS[name]) return;
    lookName = name;
    envTarget?.dispose();
    envTarget = environmentMap(renderer, LOOKS[name]);
    scene.environment = envTarget.texture;
    scene.backgroundNode = backdropNode(LOOKS[name]);
    studio.floor.material.backdrop = backdropNode(LOOKS[name]);
    studio.floor.material.strength.value = LOOKS[name].shadow;
    studio.floor.material.needsUpdate = true;
    wake();
  }
  setLook(lookName);
  const sets = await loadSets(texBase);
  let finish = 'electro';
  const M = { part: createMaterials(sets, finish), ...createHardware(finish, sets) };

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 0.12, maxDistance: 3, maxPolarAngle: Math.PI * 0.5 - 0.02, autoRotateSpeed: 0.8 });
  controls.addEventListener('change', wake);
  const state = { item: CATALOG[0], hand: 'DX', mode: 'part', object: null, asm: null, box: new THREE.Box3(), radius: 0.2, azimuth: 0 };

  // Moves the assembly's adjustment (degrees for the door brackets, mm of reach for the guides).
  function adjust(value) {
    const asm = state.asm;
    if (!asm) return null;
    asm.value = Math.max(asm.range[0], Math.min(asm.range[1], Number(value)));
    asm.set(asm.value);
    wake();
    return asm.value;
  }

  // Shows a catalogue item on its own (mode 'part') or installed with its catalogue partner
  // (mode 'assembly'; parts without one stay on their own). `reframe: false` keeps the camera.
  function show(id, { hand = state.hand, mode = state.mode, reframe = true } = {}) {
    if (mode === 'assembly') forged();
    const item = byId(id) ?? CATALOG[0];
    const keep = state.asm && item === state.item ? state.asm.value : null;
    if (state.object) scene.remove(state.object);
    const s = stage(item, hand === 'SX' ? 'SX' : 'DX', mode, M);
    Object.assign(state, { item, hand: hand === 'SX' ? 'SX' : 'DX', mode: mode === 'assembly' ? 'assembly' : 'part', object: s.object, asm: s.asm });
    if (s.asm && keep !== null) adjust(keep);
    scene.add(s.object);
    state.box.copy(s.box);
    state.radius = state.box.getBoundingSphere(new THREE.Sphere()).radius;
    if (reframe) {
      const dir = viewDirection(s.view, state.hand);
      const { target } = frame(camera, state.box, dir);
      state.azimuth = aimRoom(scene, dir);
      controls.target.copy(target);
      controls.update();
    }
    aimKey(studio.key, state.box.getCenter(new THREE.Vector3()), state.radius, state.azimuth);
    wake();
    return state;
  }

  // Only assemblies have clips: their forged grain loads with the first one, then the view is
  // staged again with it. A photo waits for it.
  let forging = null;
  function forged() {
    forging ??= loadSets(texBase, ['forged']).then((loaded) => {
      Object.assign(sets, loaded);
      const old = M.forged;
      M.forged = createForged(finish, sets);
      show(state.item.id, { reframe: false });
      old.dispose();
    });
    return forging;
  }

  // Resolves once the finish is on screen: its baked sets may still have to load (hot-dip grains).
  async function setFinish(name) {
    if (!FINISHES[name] || name === finish) return;
    finish = name;
    const need = [FINISHES[name].set, FINISHES[name].edgeSet].filter((n) => !(n in sets));
    if (need.length) Object.assign(sets, await loadSets(texBase, need));
    if (finish !== name) return;
    const old = [...M.part, M.hw, M.rail, M.forged];
    Object.assign(M, { part: createMaterials(sets, finish), ...createHardware(finish, sets) });
    show(state.item.id, { reframe: false });
    old.forEach((m) => m.dispose());
  }

  let interactive = createInteractive(renderer, scene, camera, P);
  let paused = false;
  // A resize during a photo waits for it: the photo owns the drawing buffer while it shoots.
  function resize() {
    if (paused) return;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wake();
  }
  window.addEventListener('resize', resize);
  // The view's box also changes without a window resize: on desktop the panels around it fill in
  // once the interface is up and take height from it. TRAA sets the camera's aspect from the drawing
  // buffer every frame, so a buffer left at the first size showed the part squashed (about 9%).
  new ResizeObserver(() => resize()).observe(canvas);
  resize();
  show(params.get('code') || CATALOG[0].id, { hand: params.get('hand') || 'DX', mode: params.get('mode') || 'part' });

  renderer.setAnimationLoop(() => {
    if (paused || (settle <= 0 && !controls.autoRotate)) return;
    settle--;
    controls.update();
    interactive.render();
  });

  const still = createStills({
    renderer,
    scene,
    camera,
    controls,
    P,
    studio,
    state,
    pause() {
      paused = true;
      return () => {
        paused = false;
        resize();
        interactive.dispose();
        interactive = createInteractive(renderer, scene, camera, P);
        wake();
      };
    },
  });

  const photo = async (options) => {
    await forging;
    return still(options);
  };

  const api = { show, adjust, photo, setLook, setFinish, wake, partnerOf, renderer, camera, controls, state, backend, uniforms: P, studio, get look() { return lookName; }, get finish() { return finish; }, get idle() { return settle <= 0 && !controls.autoRotate; } };
  onReady?.(api);
  return api;
}
