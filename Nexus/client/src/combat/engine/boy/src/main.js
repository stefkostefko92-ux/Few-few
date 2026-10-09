// Duel at Ravenhold: boots the renderer (WebGPU, WebGL 2 fallback), runs the story clock, camera
// and frame loop. A frame-time governor holds 60fps by moving internal resolution, not effects.
// 4a.2/4a.3 (Nexus порт): main() → export async function bootDuel(canvas, opts), приема
// opts.choreography (choreo-gen.js), връща { dispose(), togglePlay, setSpeed, toggleSound, skip }
// — реалните битки карат СВОЯ дуел през същия конвейер; auto-run долу пази `import('./main.js')`.
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld, animateWorld, aimKeyLight } from './world.js';
import { QUALITY, initialTier, createGovernor } from './quality.js';
import { createDirector, realTimeOf, storyTimeAtReal, recompileDirector } from './director.js';
import { createPipeline } from './pipeline.js';
import { U } from './tsl.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createEvents } from './events.js';
import { timeScaleAt, recompileTimeline } from './timeline.js';
import { CAPTIONS, CHAPTERS, EVENTS, setChoreography, resetChoreography } from './choreo.js';
import { DURATION, MOON_DIR, setDuration } from './config.js';
import { reportFrame } from './hud-report.js';
import { acceptIdentitySwizzle } from './gpu-compat.js';
import { installDevHooks } from './dev-hooks.js';
import { mobileGrade } from './mobile-grade.js';
import { classLoadout, foeLoadout, weaponKit } from './loadout.js';

const UP = new THREE.Vector3(0, 1, 0);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Стартира дуела в canvas. opts.choreography (choreo-gen.js) подменя хореографията преди
 * построяването на света; без него тръгва фиксираният демо-филм. Връща { dispose() } за пълно
 * почистване (GPU памет, слушатели, rAF, AudioContext) — 4a.5 гейтва растеж на ресурсите. */
export async function bootDuel(canvas, opts = {}) {
  if (opts.choreography) { setChoreography(opts.choreography); setDuration(opts.choreography.duration); }
  else resetChoreography();
  recompileTimeline();
  recompileDirector();

  const reducedMotion = opts.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  let qualityMode = 'auto';
  let tier = initialTier(matchMedia('(pointer: coarse)').matches, Math.min(screen.width, screen.height));
  let quality = QUALITY[tier];
  const clock = { T: 0, playing: true, speed: 1, jumped: true };
  let free = false;
  let showStats = false;
  const h = {};
  const hud = createHud(h);
  let disposed = false;

  // Абортира РАНО (преди buildWorld()/compileAsync), ако StrictMode вече е размонтирал —
  // без това двете double-invoke копия се борят за GPU едновременно под софтуерен рендер.
  function bailIfAborted() {
    if (!opts.signal?.aborted) return false;
    try { renderer?.dispose(); } catch { /* backend already gone */ }
    return true;
  }

  let renderer;
  try {
    const forceWebGL = new URLSearchParams(location.search).has('webgl');
    acceptIdentitySwizzle();
    renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', forceWebGL });
    await renderer.init();
  } catch { hud.fatal(); return { failed: true, dispose() {} }; }
  if (bailIfAborted()) return { dispose() {} };
  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  // 4a.4: тон по opts.heroClass/opts.region, оръжие/щит по opts.heroClass/opts.foeName — виж
  // loadout.js. choreo-gen.js (roundsToChoreo.ts) чете СЪЩИТЕ heroClass/foeName — един избор.
  const W = await buildWorld(renderer, hud, quality, {
    heroTint: classLoadout(opts.heroClass), foeTint: foeLoadout(opts.region),
    heroKit: weaponKit(opts.heroClass), foeKit: weaponKit(opts.foeName),
  });
  if (bailIfAborted()) return { dispose() {} };
  const { scene, camera, A, B, fx } = W;
  const pipe = createPipeline(renderer, W);
  pipe.setQuality(quality);
  const csm = W.moon.shadow.shadowNode;
  const director = createDirector(camera, { reducedMotion, shots: opts.choreography?.shots });
  const audio = createAudio();
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enabled: false, enableDamping: true, minDistance: 1.2, maxDistance: 22, maxPolarAngle: Math.PI * 0.495 });

  const lightning = { at: -10, power: 0 };
  const events = createEvents({
    A, B, fx, audio, director, camera, projectiles: W.ranged,
    onLightning(p) {
      lightning.at = performance.now() / 1000;
      lightning.power = p;
      setTimeout(() => { if (!disposed) audio.play('thunder', p); }, 1100);
    },
    onImpact: opts.onImpact, // 4a.3: React се синхронизира ТОЧНО в кадъра, не по отделен таймер.
  });
  for (const f of [A, B]) {
    f.feet.onStep = (pos, dist) => {
      if (dist < 0.08 || !clock.playing) return;
      fx.impact(pos.clone().setY(0.02), UP, 0.15 + dist * 0.4, 'water');
      audio.play('step', 0.5 + dist, 0, timeScaleAt(clock.T));
    };
  }

  // The canvas is laid out at display size; its drawing buffer (where every pass renders) is a
  // governed fraction of the device resolution, and the browser scales it up to the display.
  const governor = createGovernor();
  const out = new THREE.Vector2();
  const internal = new THREE.Vector2();
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const hh = canvas.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.max(0.25, Math.min(dpr, quality.maxDPR) * governor.scale));
    renderer.setSize(w, hh, false);
    renderer.getDrawingBufferSize(internal);
    out.set(Math.round(w * dpr), Math.round(hh * dpr));
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
    if (csm?.camera) csm.updateFrustums();
  }
  window.addEventListener('resize', resize);
  resize();

  Object.assign(h, {
    togglePlay() { clock.playing = !clock.playing; hud.setPlaying(clock.playing); },
    seek(frac) {
      clock.T = Math.min(DURATION - 0.01, storyTimeAtReal(frac * director.realDuration));
      clock.jumped = true;
    },
    setSpeed(v) { clock.speed = v; hud.setSpeed(v); },
    toggleCamera() {
      free = !free;
      controls.enabled = free;
      if (free) controls.target.copy(A.root.pos).add(B.root.pos).multiplyScalar(0.5).setY(1.2);
      hud.setCamera(free);
    },
    toggleSound() { hud.setSound(audio.toggle()); },
    toggleStats() { showStats = !showStats; hud.setStats(showStats); },
    setQuality(mode) {
      qualityMode = mode;
      tier = mode === 'auto' ? tier : mode;
      quality = QUALITY[tier];
      governor.reset(performance.now());
      W.ground.setReflections(quality.reflections);
      W.rain.setCount(quality.rain);
      W.brazierShadow.castShadow = quality.shadow;
      W.gateLight.castShadow = quality.godrays;
      pipe.setQuality(quality);
      resize();
      hud.setQuality(mode);
    },
    onLang() { hud.setPlaying(clock.playing); hud.setCamera(free); hud.setSound(audio.enabled); hud.setStats(showStats); },
  });
  h.onLang();
  hud.setSpeed(clock.speed);
  hud.setQuality(qualityMode);
  const realDuration = realTimeOf(DURATION);
  director.realDuration = realDuration;
  hud.setTicks(CHAPTERS.map((c, i) => [realTimeOf(c.t) / realDuration, ['I', 'II', 'III'][i]]));

  // Warm up every shader and pipeline before the curtain rises.
  animateWorld(W, 0, 0);
  director.update(0, 0, A, B);
  await renderer.compileAsync(scene, camera);
  if (bailIfAborted()) return { dispose() {} };
  pipe.render({ focus: 5, coc: 4, maxBlur: 8, time: 0, bars: 0, fade: 1 });
  hud.loading('load_ready', 1);
  await nextFrame();
  if (bailIfAborted()) return { dispose() {} };
  hud.ready();

  const prevTip = [new THREE.Vector3(), new THREE.Vector3()];
  const center = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const perf = { last: performance.now(), fps: 60, ms: 16.7, statsAt: 0 };
  let startReal = perf.last / 1000;
  governor.reset(perf.last);

  let lastFov = 0;
  function frame(now) {
    const dtMs = now - perf.last;
    const dtReal = Math.min(0.05, Math.max(0, dtMs / 1000));
    perf.last = now;
    if (qualityMode === 'auto' && governor.sample(dtMs, now)) resize();
    const ts = timeScaleAt(clock.T);
    const prevT = clock.T;
    if (clock.playing) clock.T += dtReal * clock.speed * ts;
    let jump = clock.jumped;
    clock.jumped = false;
    if (clock.T >= DURATION) {
      clock.T = opts.loop === false ? DURATION - 0.001 : 0;
      jump = true;
      startReal = now / 1000;
      if (opts.loop === false) { clock.playing = false; opts.onEnd?.(); }
    }
    const T = clock.T;
    const dT = jump ? 0 : T - prevT;
    if (jump) {
      A.resetDynamics();
      B.resetDynamics();
      fx.clear();
      W.breath.clear();
      events.reset();
    }
    animateWorld(W, T, dT);
    W.ranged.update(T);
    events.step(prevT, T, ts, jump);
    fx.update(dT, THREE.MathUtils.clamp(dT * 1.2, 0.012, 0.03), dtReal);

    center.addVectors(A.root.pos, B.root.pos).multiplyScalar(0.5);
    let focusDist, coc;
    if (!free) {
      director.update(T, dtReal, A, B);
      focusDist = director.state.focusDist;
      coc = director.cocScale(internal.y);
    } else {
      controls.target.lerp(tmp.copy(center).setY(1.2), 1 - Math.exp(-dtReal * 2));
      controls.update();
      focusDist = camera.position.distanceTo(controls.target);
      camera.fov = 38;
      camera.updateProjectionMatrix();
      coc = internal.y * 0.004;
    }
    if (csm?.camera && camera.fov !== lastFov) csm.updateFrustums();
    lastFov = camera.fov;
    W.rain.streak.value = 0.32 * THREE.MathUtils.clamp(clock.playing ? ts * clock.speed : 0.05, 0.05, 1);

    // Lightning: two quick pulses, never a strobe; reduced motion keeps only a faint glow.
    const since = now / 1000 - lightning.at;
    const flash = since >= 0 && since < 1.4 ? (Math.exp(-since / 0.07) + (since > 0.16 ? 0.7 * Math.exp(-(since - 0.16) / 0.09) : 0)) * lightning.power * (reducedMotion ? 0.2 : 1) : 0;
    U.flash.value = flash;
    const aspect = (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight);
    const mg = mobileGrade(aspect);
    W.hemi.intensity = 0.3 + flash * 2.2 + mg.hemi;
    W.rim.intensity = 0.45 + flash * 2.5 + mg.rim;
    scene.environmentIntensity = 0.5 + flash * 0.4;
    W.moon.target.position.copy(center);
    W.moon.position.copy(center).addScaledVector(MOON_DIR, 40);
    W.rim.target.position.copy(center).setY(1.3);
    W.rim.position.copy(W.rim.target.position).add(tmp.subVectors(W.rim.target.position, camera.position).setY(0).normalize().multiplyScalar(6)).addScaledVector(UP, 9);
    aimKeyLight(W.key, camera.position, center, mg.key + flash * 0.6);

    const fadeIn = Math.max(0, 1 - (now / 1000 - startReal) / 1.2);
    pipe.render({
      focus: focusDist,
      coc,
      maxBlur: Math.min(22, internal.y / 50),
      bloom: 0.42 + (ts < 0.5 ? 0.12 : 0),
      streak: 0.35,
      exposure: mg.exposure,
      vignette: mg.vignette,
      time: now / 1000,
      grain: 0.04,
      aspect,
      sharp: internal.x < out.x * 0.98 ? 0.35 : 0.9,
      bars: aspect > 1.35 ? Math.max(0, (1 - aspect / 2.39) / 2) : 0,
      fade: Math.max(fadeIn, THREE.MathUtils.smoothstep(T, DURATION - 1.0, DURATION - 0.1)),
    });

    const tipSpeeds = [A, B].map((f, i) => {
      const s = dtReal > 0 ? f.bladeTip.distanceTo(prevTip[i]) / dtReal : 0;
      prevTip[i].copy(f.bladeTip);
      return jump ? 0 : s;
    });
    audio.update(dtReal, tipSpeeds, [-0.6, 0.6]);
    reportFrame({
      hud, showStats, perf, now, dtMs, internal, out, qualityMode, tier, backend, renderer,
      CAPTIONS, CHAPTERS, T, realDuration, free, director, clock, ts, DURATION, realTimeOf,
    });
  }
  renderer.setAnimationLoop(frame);
  installDevHooks(clock, events, () => EVENTS);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', resize);
      audio.dispose?.();
      try { renderer.dispose(); } catch { /* backend already gone */ }
      const gl = renderer.getContext?.();
      const ext = gl?.getExtension?.('WEBGL_lose_context');
      ext?.loseContext?.();
    },
    // 4a.3: CombatScene.tsx кара собствените си бутони вместо вградените на boy (скрити —
    // виж boy-hud.css .embedded), затова трябват handle-и към същия clock.
    togglePlay: h.togglePlay,
    setSpeed: h.setSpeed,
    toggleSound: h.toggleSound,
    skip() {
      clock.T = Math.max(0, DURATION - 0.05);
      clock.jumped = true;
    },
  };
}

// Guard: авто-run само за голия <script type="module"> демо път (без choreography).
// BoyDuelStage.tsx вика bootDuel() програмно и не разчита на този страничен ефект.
if (typeof document !== 'undefined' && document.getElementById('view') && !window.__boyNoAutoboot) {
  bootDuel(document.getElementById('view')).catch((err) => {
    const el = document.getElementById('load-step');
    if (el) el.textContent = `Rendering stopped: ${err && err.message ? err.message : String(err)}`;
  });
}
