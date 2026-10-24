// Entry point: renderer, camera, drag-to-orbit, the quality/fps governor, the post pipeline and
// the DOM wiring (pause, quality select, fallbacks). Scene content lives in scene.js.
import * as THREE from 'three';
import { Post } from './post.js';
import { QUALITY, initialTier, createGovernor } from './quality.js';
import { buildScene } from './scene.js';
import { upgradeDeskTextures } from './baked.js';

const stageWrap = document.getElementById('stage-wrap');
const canvas = document.getElementById('stage');
const fallback = document.getElementById('fallback');
const hint = document.getElementById('hint');
const controls = document.getElementById('controls');
const pauseBtn = document.getElementById('pause-btn');
const qualitySel = document.getElementById('quality-select');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const reducedData = matchMedia('(prefers-reduced-data: reduce)').matches;

function showFallback() {
  canvas.classList.add('hidden');
  hint.classList.add('hidden');
  controls.classList.add('hidden');
  fallback.classList.remove('hidden');
}

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

if (!hasWebGL2() || reducedData) {
  showFallback();
} else {
  init();
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping; // post.js does ACES itself
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const { scene, materials, animate, impulse } = buildScene(renderer);
  // Procedural desk textures are already live (instant, no network); this only upgrades them to
  // the offline-baked hero-resolution set (bake/index.mjs) when dist/tex/ is deployed alongside
  // the page — non-blocking, silent no-op otherwise (src/baked.js).
  upgradeDeskTextures(materials, renderer.capabilities.getMaxAnisotropy());

  const CAM_DIST = 11.0;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 40);
  camera.position.set(0, 0.3, CAM_DIST);

  let tier = initialTier(matchMedia('(pointer: coarse)').matches, Math.min(innerWidth, innerHeight));
  const post = new Post(renderer, QUALITY[tier]);
  const governor = createGovernor();

  function resize() {
    const w = stageWrap.clientWidth;
    const h = stageWrap.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = Math.min(devicePixelRatio || 1, QUALITY[tier].maxDPR);
    renderer.setPixelRatio(dpr);
    const outW = Math.round(w * dpr);
    const outH = Math.round(h * dpr);
    const inW = Math.max(2, Math.round(outW * governor.scale));
    const inH = Math.max(2, Math.round(outH * governor.scale));
    renderer.setSize(w, h, false);
    post.setSize(inW, inH, outW, outH);
  }
  addEventListener('resize', resize);
  resize();

  // ---------- drag-to-orbit, limited angle, no zoom (never steal page scroll) ----------
  const orbit = { az: 0, pol: 0.05, targetAz: 0, targetPol: 0.05, dragging: false, lastX: 0, lastY: 0 };
  const AZ_LIMIT = 0.6;
  const POL_MIN = -0.26;
  const POL_MAX = 0.36;
  function applyOrbit() {
    camera.position.x = Math.sin(orbit.az) * CAM_DIST;
    camera.position.z = Math.cos(orbit.az) * CAM_DIST;
    camera.position.y = 0.3 + Math.sin(orbit.pol) * 1.8;
    camera.lookAt(0, -0.05, 0);
  }
  applyOrbit();

  const pointer = new THREE.Vector2(0, 0);
  canvas.addEventListener('pointerdown', (e) => {
    orbit.dragging = true;
    orbit.lastX = e.clientX;
    orbit.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    hint.classList.add('faded');
    impulse();
  });
  canvas.addEventListener('pointerup', () => {
    orbit.dragging = false;
  });
  canvas.addEventListener('pointercancel', () => {
    orbit.dragging = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (orbit.dragging) {
      const dx = e.clientX - orbit.lastX;
      const dy = e.clientY - orbit.lastY;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      orbit.targetAz = Math.max(-AZ_LIMIT, Math.min(AZ_LIMIT, orbit.targetAz - dx * 0.0045));
      orbit.targetPol = Math.max(POL_MIN, Math.min(POL_MAX, orbit.targetPol - dy * 0.003));
    }
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = (e.clientY / innerHeight) * 2 - 1;
    pointer.set(nx * 0.05, -ny * 0.035);
  }, { passive: true });

  // ---------- pause (WCAG 2.2.2) ----------
  let paused = reducedMotion;
  pauseBtn.setAttribute('aria-pressed', String(paused));
  pauseBtn.textContent = paused ? 'Продължи' : 'Пауза';
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? 'Продължи' : 'Пауза';
    if (!paused) requestAnimationFrame(loop);
  });

  // ---------- quality select ----------
  qualitySel.addEventListener('change', () => {
    const v = qualitySel.value;
    tier = v === 'auto' ? initialTier(matchMedia('(pointer: coarse)').matches, Math.min(innerWidth, innerHeight)) : v;
    governor.reset(performance.now());
    post.setQuality(QUALITY[tier]);
    renderer.shadowMap.enabled = QUALITY[tier].shadow;
    resize();
  });

  let visible = true;
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible';
    if (visible && !paused) requestAnimationFrame(loop);
  });

  let last = performance.now();
  const params = { focus: CAM_DIST, coc: 3.2, maxBlur: 5, bloom: 0.34, exposure: 1.6, grain: 0.03, ao: 0.6, streak: 0.15, time: 0 };

  function renderOnce() {
    applyOrbit();
    post.render(scene, camera, params);
  }

  function loop(nowMs) {
    if (!visible || paused) return;
    const dt = nowMs - last;
    last = nowMs;
    if (governor.sample(dt, nowMs)) resize();

    if (!reducedMotion) {
      orbit.az += (orbit.targetAz - orbit.az) * 0.12;
      orbit.pol += (orbit.targetPol - orbit.pol) * 0.12;
    }
    applyOrbit();
    animate(nowMs / 1000, nowMs, pointer, reducedMotion);
    params.time = nowMs / 1000;
    post.render(scene, camera, params);
    if (!paused) requestAnimationFrame(loop);
  }

  if (reducedMotion) renderOnce();
  else requestAnimationFrame(loop);
}
