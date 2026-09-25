// Duel at Ravenhold: boots the renderer (WebGPU, WebGL 2 as fallback), runs the story clock, the
// camera and the frame loop. A frame-time governor holds 60 fps by moving the internal
// resolution, not by cutting effects.
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld, animateWorld } from './world.js';
import { QUALITY, initialTier, createGovernor } from './quality.js';
import { createDirector, realTimeOf, storyTimeAtReal, REAL_DURATION, SHOT_COUNT, FRAME_ASPECT } from './director.js';
import { createPipeline } from './pipeline.js';
import { U } from './tsl.js';
import { FACE_LIGHT } from './face-light.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createEvents } from './events.js';
import { timeScaleAt } from './timeline.js';
import { CAPTIONS, CHAPTERS } from './choreo.js';
import { DURATION, MOON_DIR } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

// Older Chromium builds type GPUTextureViewDescriptor.swizzle as a dictionary and reject the
// identity string 'rgba' that three.js always passes. Dropping an identity swizzle changes nothing.
function acceptIdentitySwizzle() {
  const proto = globalThis.GPUTexture?.prototype;
  if (!proto) return;
  const createView = proto.createView;
  proto.createView = function view(desc) {
    if (desc?.swizzle !== 'rgba') return createView.call(this, desc);
    const { swizzle, ...rest } = desc;
    return createView.call(this, swizzle === 'rgba' ? rest : desc);
  };
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function main() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let qualityMode = 'auto';
  let tier = initialTier(matchMedia('(pointer: coarse)').matches, Math.min(screen.width, screen.height));
  let quality = QUALITY[tier];
  const clock = { T: 0, playing: true, speed: 1, jumped: true };
  let free = false;
  let showStats = false;
  const h = {};
  const hud = createHud(h);

  let renderer;
  try {
    const forceWebGL = new URLSearchParams(location.search).has('webgl');
    acceptIdentitySwizzle();
    renderer = new THREE.WebGPURenderer({ canvas: document.getElementById('view'), antialias: false, alpha: false, powerPreference: 'high-performance', forceWebGL });
    await renderer.init();
  } catch {
    hud.fatal();
    return;
  }
  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  const W = await buildWorld(renderer, hud, quality);
  const { scene, camera, A, B, fx } = W;
  const pipe = createPipeline(renderer, W);
  pipe.setQuality(quality);
  const csm = W.moon.shadow.shadowNode;
  const director = createDirector(camera, { reducedMotion });
  const audio = createAudio();
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enabled: false, enableDamping: true, minDistance: 1.2, maxDistance: 22, maxPolarAngle: Math.PI * 0.495 });

  const lightning = { at: -10, power: 0 };
  const events = createEvents({
    A, B, fx, audio, director, camera,
    onLightning(p) {
      lightning.at = performance.now() / 1000;
      lightning.power = p;
      setTimeout(() => audio.play('thunder', p), 1100);
    },
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
  const MIN_SHORT_SIDE = 600;
  const out = new THREE.Vector2();
  const internal = new THREE.Vector2();
  function resize() {
    const w = window.innerWidth;
    const hh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    // A phone's short side is ~400 CSS px: at the tier's ratio a face would be a dozen pixels,
    // so small screens render at least 600 px across it when the display has them.
    const ratio = Math.max(Math.min(dpr, quality.maxDPR), Math.min(dpr, MIN_SHORT_SIDE / Math.min(w, hh)));
    renderer.setPixelRatio(Math.max(0.25, ratio * governor.scale));
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
    togglePlay() {
      clock.playing = !clock.playing;
      hud.setPlaying(clock.playing);
    },
    seek(frac) {
      clock.T = Math.min(DURATION - 0.01, storyTimeAtReal(frac * REAL_DURATION));
      clock.jumped = true;
    },
    setSpeed(v) {
      clock.speed = v;
      hud.setSpeed(v);
    },
    toggleCamera() {
      free = !free;
      controls.enabled = free;
      if (free) controls.target.copy(A.root.pos).add(B.root.pos).multiplyScalar(0.5).setY(1.2);
      hud.setCamera(free);
    },
    toggleSound() {
      hud.setSound(audio.toggle());
    },
    toggleStats() {
      showStats = !showStats;
      hud.setStats(showStats);
    },
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
    onLang() {
      hud.setPlaying(clock.playing);
      hud.setCamera(free);
      hud.setSound(audio.enabled);
      hud.setStats(showStats);
    },
  });
  h.onLang();
  hud.setSpeed(clock.speed);
  hud.setQuality(qualityMode);
  hud.setTicks(CHAPTERS.map((c, i) => [realTimeOf(c.t) / REAL_DURATION, ['I', 'II', 'III'][i]]));

  // Warm up every shader and pipeline before the curtain rises.
  animateWorld(W, 0, 0);
  director.update(0, 0, A, B);
  await renderer.compileAsync(scene, camera);
  pipe.render({ focus: 5, coc: 4, maxBlur: 8, time: 0, bars: 0, fade: 1 });
  hud.loading('load_ready', 1);
  await nextFrame();
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
      clock.T = 0;
      jump = true;
      startReal = now / 1000;
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
    events.step(prevT, T, ts, jump);
    fx.update(dT, THREE.MathUtils.clamp(dT * 1.2, 0.012, 0.03), dtReal);

    center.addVectors(A.root.pos, B.root.pos).multiplyScalar(0.5);
    let focusDist;
    let coc;
    if (!free) {
      director.update(T, dtReal, A, B);
      focusDist = director.state.focusDist;
      coc = director.cocScale(Math.min(internal.y, internal.x / FRAME_ASPECT));
    } else {
      controls.target.lerp(tmp.copy(center).setY(1.2), 1 - Math.exp(-dtReal * 2));
      controls.update();
      focusDist = camera.position.distanceTo(controls.target);
      camera.fov = 38;
      camera.updateProjectionMatrix();
      coc = internal.y * 0.004;
    }
    // The face light: always enough for the faces to read, more in close-ups, with the
    // fires' slow breathing.
    FACE_LIGHT.level.value = (0.5 + 0.6 * (free ? 0 : director.state.key)) * (0.95 + 0.05 * Math.sin(T * 9.1) * Math.sin(T * 3.7));
    if (csm?.camera && camera.fov !== lastFov) csm.updateFrustums();
    lastFov = camera.fov;
    W.rain.streak.value = 0.32 * THREE.MathUtils.clamp(clock.playing ? ts * clock.speed : 0.05, 0.05, 1);

    // Lightning: two quick pulses, never a strobe; reduced motion keeps only a faint glow.
    const since = now / 1000 - lightning.at;
    const flash = since >= 0 && since < 1.4 ? (Math.exp(-since / 0.07) + (since > 0.16 ? 0.7 * Math.exp(-(since - 0.16) / 0.09) : 0)) * lightning.power * (reducedMotion ? 0.2 : 1) : 0;
    U.flash.value = flash;
    W.hemi.intensity = 0.3 + flash * 2.2;
    W.rim.intensity = 0.45 + flash * 2.5;
    scene.environmentIntensity = 0.5 + flash * 0.4;
    W.moon.target.position.copy(center);
    W.moon.position.copy(center).addScaledVector(MOON_DIR, 40);
    W.rim.target.position.copy(center).setY(1.3);
    W.rim.position.copy(W.rim.target.position).add(tmp.subVectors(W.rim.target.position, camera.position).setY(0).normalize().multiplyScalar(6)).addScaledVector(UP, 9);

    const aspect = window.innerWidth / window.innerHeight;
    const fadeIn = Math.max(0, 1 - (now / 1000 - startReal) / 1.2);
    pipe.render({
      focus: focusDist,
      coc,
      maxBlur: Math.min(22, internal.y / 50),
      bloom: 0.42 + (ts < 0.5 ? 0.12 : 0),
      streak: 0.35,
      exposure: 1.15,
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
    report(now, dtMs, T, ts);
  }

  function report(now, dtMs, T, ts) {
    if (dtMs > 0 && dtMs < 250) {
      perf.fps = perf.fps * 0.94 + (1000 / dtMs) * 0.06;
      perf.ms = perf.ms * 0.94 + dtMs * 0.06;
    }
    if (showStats && now - perf.statsAt > 250) {
      perf.statsAt = now;
      const r = renderer.info.render;
      hud.stats({ fps: perf.fps, ms: perf.ms, w: internal.x, h: internal.y, pct: Math.round((internal.x / out.x) * 100), calls: r.drawCalls, tris: r.triangles, tier: qualityMode === 'auto' ? `auto · ${tier}` : tier, backend });
    }
    const cap = CAPTIONS.find((c) => T >= c.t && T < c.t + c.d);
    let chapter = CHAPTERS[0].k;
    for (const c of CHAPTERS) if (T >= c.t) chapter = c.k;
    hud.update({
      progress: realTimeOf(T) / REAL_DURATION,
      realTime: realTimeOf(T),
      shot: free ? 0 : director.state.shot,
      shotCount: SHOT_COUNT,
      lens: free ? 35 : director.state.lensMM,
      fstop: free ? 4 : director.state.fstop,
      timeScale: clock.playing ? ts : 0,
      speed: clock.speed,
      fps: perf.fps,
      caption: cap ? cap.k : '',
      chapter,
      end: T > 24.0 && T < DURATION - 0.15,
    });
  }
  renderer.setAnimationLoop(frame);
}

main().catch((err) => {
  const el = document.getElementById('load-step');
  if (el) el.textContent = `Rendering stopped: ${err && err.message ? err.message : String(err)}`;
});
