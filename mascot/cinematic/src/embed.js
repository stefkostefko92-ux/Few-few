// Public entry point for hosting the cinematic mascot inside another page's own DOM/UI chrome
// (agents-dashboard/index.html profile card): `mount(el, opts)` -> `{ dispose }` or `null`.
// Unlike main.js (the standalone showcase, template.html) this file owns no pause/quality
// controls and no fixed element ids — the host page supplies the container and its own affordances,
// this module only renders into it and tears itself down cleanly on `dispose()`.
import * as THREE from 'three';
import { Post } from './post.js';
import { QUALITY, initialTier, createGovernor } from './quality.js';
import { buildScene } from './scene.js';
import { tintPalette } from './palette.js';

export function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function disposeMaterial(m) {
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'sheenColorMap']) if (m[k]) m[k].dispose();
  m.dispose();
}

function disposeScene(scene) {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(disposeMaterial);
  });
  if (scene.environment) scene.environment.dispose();
}

/**
 * Mounts the mascot into `el` (any block-level, positioned container) tinted to `opts.accent`
 * (a `#rrggbb` hex — anything else falls back to the studio default, see palette.js).
 * Returns `null` when WebGL2 is unavailable so the caller's existing SVG/poster fallback stays in
 * charge — this module never throws to signal that. Only ONE instance should be live at a time
 * (one WebGL context); call the returned `dispose()` before mounting another.
 * `opts.onLowFps()` fires once if the frame rate stays low even at minimum internal resolution and
 * the lightest quality tier — the caller should `dispose()` and fall back to a static asset.
 */
export function mount(el, opts = {}) {
  if (!el || !hasWebGL2()) return null;
  const reducedMotion = opts.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  el.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const palette = tintPalette(opts.accent);
  const { scene, animate } = buildScene(renderer, palette);
  scene.background = null; // the host card paints its own backdrop behind the canvas

  const CAM_DIST = 8.0;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 40);
  camera.position.set(0, 0.3, CAM_DIST);
  camera.lookAt(0, -0.05, 0);

  let tier = coarse ? 'low' : opts.quality && opts.quality !== 'auto' ? opts.quality : initialTier(coarse, Math.min(innerWidth, innerHeight));
  const post = new Post(renderer, QUALITY[tier]);
  const governor = createGovernor();

  function resize() {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = Math.min(devicePixelRatio || 1, QUALITY[tier].maxDPR, coarse ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    const outW = Math.round(w * dpr);
    const outH = Math.round(h * dpr);
    const inW = Math.max(2, Math.round(outW * governor.scale));
    const inH = Math.max(2, Math.round(outH * governor.scale));
    renderer.setSize(w, h, false);
    post.setSize(inW, inH, outW, outH);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  const pointer = new THREE.Vector2(0, 0);
  const onMove = (e) => {
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = (e.clientY / innerHeight) * 2 - 1;
    pointer.set(nx * 0.05, -ny * 0.035);
  };
  if (!reducedMotion) window.addEventListener('mousemove', onMove, { passive: true });

  let visible = document.visibilityState === 'visible';
  let req = 0;
  const onVis = () => {
    visible = document.visibilityState === 'visible';
    if (visible && !reducedMotion && !req) req = requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', onVis);

  let last = performance.now();
  let slowStreak = 0;
  let lowFpsFired = false;
  const params = { focus: CAM_DIST, coc: 3.2, maxBlur: 5, bloom: 0.34, exposure: 1.6, grain: 0.03, ao: 0.6, streak: 0, time: 0 };

  function renderOnce() {
    post.render(scene, camera, params);
  }

  function loop(nowMs) {
    req = 0;
    if (!visible) return;
    const dt = nowMs - last;
    last = nowMs;
    if (governor.sample(dt, nowMs)) resize();
    // Watchdog: even at the lowest tier and minimum internal resolution the governor cannot go any
    // further — if frames are still slow, this WebGL context is costing more than it is worth here,
    // and the caller should tear it down and fall back (see the mode-B law: low-FPS -> CSS/SVG).
    if (tier === 'low' && governor.scale <= 0.51 && dt > 33.3) slowStreak++;
    else slowStreak = Math.max(0, slowStreak - 1);
    if (!lowFpsFired && slowStreak > 90) {
      lowFpsFired = true;
      opts.onLowFps?.();
    }
    animate(nowMs / 1000, nowMs, pointer, false);
    params.time = nowMs / 1000;
    post.render(scene, camera, params);
    req = requestAnimationFrame(loop);
  }

  if (reducedMotion) renderOnce();
  else req = requestAnimationFrame(loop);

  function dispose() {
    cancelAnimationFrame(req);
    req = 0;
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('mousemove', onMove);
    disposeScene(scene);
    post.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  return { dispose };
}
