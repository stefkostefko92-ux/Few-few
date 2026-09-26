// The virtual cinematographer: a shot list with hard cuts, real lenses (focal length, f-stop),
// rack focus, handheld drift and impact shake. Progress through a shot runs on screen time,
// so the bullet-time orbit keeps moving while the story clock nearly stops.
import * as THREE from 'three';
import { timeScaleAt, rootOf, weaponAt, toWorld, dirToWorld } from './timeline.js';
import { DURATION } from './config.js';

const SENSOR_H = 0.024;
const UP = new THREE.Vector3(0, 1, 0);

// Screen seconds elapsed at story time T (integral of 1 / time scale).
const STEP = 0.01;
// 4a.2: DURATION/TIME_SCALE вече са `let` (виж choreo.js/config.js) — тази таблица трябваше
// да е фиксирана IIFE в оригиналния boy (закон #5). recompileDirector() я преизчислява СЛЕД
// timeline.recompileTimeline() при смяна на хореографията.
function computeReal() {
  const n = Math.ceil(DURATION / STEP) + 1;
  const a = new Float32Array(n);
  for (let i = 1; i < n; i++) a[i] = a[i - 1] + STEP / Math.max(0.05, timeScaleAt((i - 0.5) * STEP));
  return a;
}
let REAL = computeReal();
export function realTimeOf(T) {
  const x = THREE.MathUtils.clamp(T / STEP, 0, REAL.length - 1);
  const i = Math.floor(x);
  const j = Math.min(i + 1, REAL.length - 1);
  return REAL[i] + (REAL[j] - REAL[i]) * (x - i);
}
export let REAL_DURATION = realTimeOf(DURATION);
export function recompileDirector() {
  REAL = computeReal();
  REAL_DURATION = realTimeOf(DURATION);
}

// Inverse of realTimeOf: the story time shown after r screen seconds (used by the scrubber).
export function storyTimeAtReal(r) {
  let lo = 0;
  let hi = DURATION;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (realTimeOf(mid) < r) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function contactAt(T, who, along) {
  const r = rootOf(who, T);
  const w = weaponAt(who, T, { p: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3() });
  const g = toWorld(r, [w.p.x, w.p.y, w.p.z]);
  return g.addScaledVector(dirToWorld(r, [w.d.x, w.d.y, w.d.z]), along);
}
const KRONE = contactAt(12.95, 'B', 0.5);
const BLOCK = contactAt(20.85, 'A', 0.62);

const ease = (u) => u * u * (3 - 2 * u);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Each shot returns camera position, look target, vertical fov, focus point, f-stop, handheld amount.
// 4a.2: преименувано от SHOTS — фиксираният кинематографичен списък на демото. Генерираните
// двубои подават своя собствен `shots` (director-gen.js) на createDirector(), защото са
// вързани за абсолютни секунди от ТАЗИ хореография (KRONE/BLOCK contactAt(12.95/20.85, ...)).
const DEFAULT_SHOTS = [
  { t0: 0.0, t1: 3.6, fn: (u) => ({ pos: V(6.5, 9.8, 14).lerp(V(3.6, 2.4, 9.2), ease(u)), target: V(0, 2.4, -9).lerp(V(0.4, 1.3, 0), ease(u)), fov: 40, focus: 'B', fstop: 5.6, hand: 0.2 }) },
  { t0: 3.6, t1: 5.0, fn: (u, S) => ({ pos: S.A.rig.w.head.clone().addScaledVector(S.fwdA, 1.9 - 0.4 * u).addScaledVector(S.v, 0.55).add(V(0, -0.22, 0)), target: S.A.rig.w.head.clone().add(V(0, -0.12, 0)), fov: 32, focus: 'A', fstop: 1.8, hand: 0.35 }) },
  { t0: 5.0, t1: 7.8, fn: (u, S) => ({ pos: S.P(-0.9 + 1.4 * u, 5.6, 1.35), target: S.P(0, 0, 1.2), fov: 38, focus: 'C', fstop: 2.8, hand: 0.5 }) },
  { t0: 7.8, t1: 9.5, fn: (u, S) => ({ pos: S.A.root.pos.clone().addScaledVector(S.u, -1.3 + 0.2 * u).addScaledVector(S.v, 0.62).add(V(0, 1.82, 0)), target: S.B.rig.w.head.clone().add(V(0, -0.1, 0)), fov: 34, focus: 'B', fstop: 2.0, hand: 0.6 }) },
  { t0: 9.5, t1: 11.3, fn: (u, S) => ({ pos: S.P(1.1 - 0.5 * u, -3.3, 0.33), target: S.P(0.1, 0, 1.25), fov: 40, focus: 'C', fstop: 2.8, hand: 0.4 }) },
  { t0: 11.3, t1: 12.8, fn: (u, S) => ({ pos: S.B.root.pos.clone().addScaledVector(S.u, 1.3 - 0.15 * u).addScaledVector(S.v, 0.66).add(V(0, 1.8, 0)), target: S.A.rig.w.head.clone().add(V(0, -0.1, 0)), fov: 34, focus: 'A', fstop: 2.0, hand: 0.6 }) },
  {
    t0: 12.8,
    t1: 13.75,
    fn: (u, S) => {
      const a = -0.35 + ease(u) * 2.6;
      const off = S.v.clone().multiplyScalar(Math.cos(a) * 2.2).addScaledVector(S.u, Math.sin(a) * 2.2);
      return { pos: KRONE.clone().add(off).add(V(0, 0.05 - 0.25 * u, 0)), target: KRONE, fov: 30, focus: KRONE, fstop: 1.4, hand: 0.1 };
    },
  },
  { t0: 13.75, t1: 16.3, fn: (u, S) => ({ pos: S.P(-0.3 + 0.5 * u, -3.7 + 0.5 * u, 1.5), target: S.P(0, 0, 1.35), fov: 36, focus: 'C', fstop: 2.4, hand: 0.45 }) },
  {
    t0: 16.3,
    t1: 19.55,
    fn: (u, S) => {
      const a = 2.2 + u * 1.1;
      const r = 4.9 - 0.7 * u;
      return { pos: S.C.clone().add(V(Math.cos(a) * r, 2.3 - 0.6 * u, Math.sin(a) * r)), target: S.P(0, 0, 1.2), fov: 36, focus: 'C', fstop: 4, hand: 0.35 };
    },
  },
  { t0: 19.55, t1: 20.7, fn: (u, S) => ({ pos: S.A.root.pos.clone().addScaledVector(S.u, -1.7 + 0.4 * u).addScaledVector(S.v, -0.95).add(V(0, 1.45, 0)), target: S.B.rig.w.head.clone(), fov: 44, focus: 'B', fstop: 2.0, hand: 1.2 }) },
  { t0: 20.7, t1: 21.4, fn: (u, S) => ({ pos: BLOCK.clone().addScaledVector(S.v, 1.35).addScaledVector(S.u, 0.15 + 0.1 * u).add(V(0, 0.08, 0)), target: BLOCK, fov: 30, focus: BLOCK, fstop: 1.8, hand: 0.5 }) },
  {
    t0: 21.4,
    t1: 23.2,
    fn: (u, S) => {
      const a = -0.5 + ease(u) * 0.8;
      const h = S.B.rig.w.head;
      const off = S.v.clone().multiplyScalar(-Math.cos(a) * 1.7).addScaledVector(S.u, -Math.sin(a) * 1.7 - 0.2);
      return { pos: h.clone().add(off).add(V(0, -0.02, 0)), target: h.clone().add(V(0, -0.05, 0)), fov: 28 + 6 * u, focus: 'B', fstop: 1.4, hand: 0.15 };
    },
  },
  {
    t0: 23.2,
    t1: DURATION,
    fn: (u, S) => {
      const k = ease(Math.min(1, u * 1.1));
      const off = S.v.clone().multiplyScalar(2.6 + 5 * k).addScaledVector(S.u, -1.2 - 2.5 * k);
      return { pos: S.C.clone().add(off).add(V(0, 1.5 + 3.6 * k, 0)), target: S.C.clone().add(V(0, 1.0 - 0.3 * k, 0)), fov: 38, focus: 'C', fstop: 4, hand: 0.3 };
    },
  },
];
export const SHOT_COUNT = DEFAULT_SHOTS.length;

export function createDirector(camera, { reducedMotion, shots = DEFAULT_SHOTS } = {}) {
  const S = { u: new THREE.Vector3(), v: new THREE.Vector3(), C: new THREE.Vector3(), fwdA: new THREE.Vector3(), A: null, B: null };
  S.P = (a, b, h) => S.C.clone().addScaledVector(S.u, a).addScaledVector(S.v, b).add(V(0, h, 0));
  const state = { shot: -1, focusDist: 5, fstop: 2.8, trauma: 0, cut: true, lensMM: 35 };
  const shotCount = shots.length;
  const look = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const noise = (t, s) => Math.sin(t * 1.1 + s) * 0.6 + Math.sin(t * 2.3 + s * 2.1) * 0.3 + Math.sin(t * 5.7 + s * 0.7) * 0.1;
  return {
    state,
    shotCount,
    addTrauma(x) {
      if (!reducedMotion) state.trauma = Math.min(1, state.trauma + x);
    },
    // Camera for the current story time. Returns true on the frame of a cut.
    update(T, dtReal, A, B) {
      S.A = A;
      S.B = B;
      S.u.subVectors(B.root.pos, A.root.pos).setY(0).normalize();
      S.v.set(-S.u.z, 0, S.u.x);
      S.C.addVectors(A.root.pos, B.root.pos).multiplyScalar(0.5);
      S.fwdA.copy(S.u);
      S.aspect = camera.aspect; // 4a.3-fix: генерираните кадри трябва да знаят портрет/пейзаж.
      S.sep = A.root.pos.distanceTo(B.root.pos);
      // 4b: рамка по РЕАЛНИЯ ръст на двамата (standHeight — fighter.js/beast-fighter.js), не
      // фиксираните ~1.15m от оригиналния демо-двубой (двама рицари) — иначе плъх до земята
      // пада извън кадъра, а дракон/титан излиза от него отгоре (виж shot-builder.js orbitShot).
      const hiH = Math.max(A.standHeight ?? 1.75, B.standHeight ?? 1.75);
      const loH = Math.min(A.standHeight ?? 1.75, B.standHeight ?? 1.75);
      // Центърът на кадъра следва ПО-ВИСОКИЯ боец (вдигнатото оръжие стига ~1.25× ръста) — с
      // нисък противник (плъх) старата формула сваляше целта до ~0.55 м и шлемът излизаше горе.
      S.midY = hiH * 0.5 + loH * 0.05;
      S.spanY = hiH;
      let i = shots.findIndex((s) => T >= s.t0 && T < s.t1);
      if (i < 0) i = shots.length - 1;
      const shot = shots[i];
      const r0 = realTimeOf(shot.t0);
      const u = THREE.MathUtils.clamp((realTimeOf(T) - r0) / (realTimeOf(shot.t1) - r0), 0, 1);
      const s = shot.fn(u, S);
      const cut = i !== state.shot;
      state.shot = i;
      state.cut = cut;
      const rt = realTimeOf(T);
      const hand = reducedMotion ? 0 : s.hand;
      camera.position.copy(s.pos);
      camera.position.x += noise(rt * 0.8, 1) * 0.02 * hand;
      camera.position.y += noise(rt * 0.8, 2) * 0.015 * hand;
      look.lookAt(camera.position, s.target, UP);
      q.setFromRotationMatrix(look);
      state.trauma = Math.max(0, state.trauma - dtReal * 1.6);
      const shake = state.trauma * state.trauma;
      e.set(noise(rt * 0.9, 3) * 0.006 * hand + noise(rt * 22, 4) * 0.03 * shake, noise(rt * 0.7, 5) * 0.008 * hand + noise(rt * 21, 6) * 0.03 * shake, noise(rt * 19, 7) * 0.02 * shake);
      camera.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(e));
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
      const fp = s.focus === 'A' ? A.rig.w.head : s.focus === 'B' ? B.rig.w.head : s.focus === 'C' ? S.C.clone().add(V(0, 1.3, 0)) : s.focus;
      const fd = camera.position.distanceTo(fp);
      state.focusDist = cut ? fd : THREE.MathUtils.lerp(state.focusDist, fd, 1 - Math.exp(-dtReal * 7));
      state.fstop = s.fstop;
      state.lensMM = (SENSOR_H / 2 / Math.tan(THREE.MathUtils.degToRad(s.fov) / 2)) * 1000;
      return cut;
    },
    // Circle-of-confusion scale in pixels for the post pass (thin-lens model).
    cocScale(screenH) {
      const f = state.lensMM / 1000;
      const s = Math.max(state.focusDist, f * 2);
      return ((f * f) / (state.fstop * (s - f)) / SENSOR_H) * screenH * 0.5;
    },
  };
}
