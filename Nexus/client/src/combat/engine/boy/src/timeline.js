// Resolves the stunt sheet into concrete poses and evaluates any moment of the fight.
// Contact keys are solved geometrically so blades, shields and helms actually meet.
import * as THREE from 'three';
import * as C from './choreo.js';

const UP = new THREE.Vector3(0, 1, 0);
const EASE = {
  io: (u) => u * u * (3 - 2 * u),
  in: (u) => Math.pow(u, 2.1),
  out: (u) => 1 - Math.pow(1 - u, 2.1),
  lin: (u) => u,
};
export const TARGETS = { head: [0, 1.62, 0.03], headL: [-0.08, 1.6, 0.0], lshoulder: [-0.2, 1.42, 0.0], chest: [0, 1.25, 0.1] };
const MAX_ALONG = { A: 1.0, B: 0.84 };
// Right shoulder and chest in the fighter frame for a key's crouch and lean, and how far from
// the shoulder the grip may sit (arm plus hand offset).
const shoulderOf = (k, r = 0.19) => {
  const handF = k.aim ? k.aim.hand[2] : 0.3;
  const lean = (k.lean ?? 0) + THREE.MathUtils.clamp((handF - 0.3) * 0.45, -0.08, 0.2);
  return [r, 1.35 - (k.crouch ?? 0.08), 0.02 + lean * 0.33];
};
const REACH = 0.54;
// Two-handed grip: the right hand sits this far up the grip from the centre between both hands.
const HALF_GRIP = 0.0625;

export function track1(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const u = (t - t0) / (t1 - t0 || 1);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return keys[keys.length - 1][1];
}

export function timeScaleAt(t) {
  const k = C.TIME_SCALE;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * u;
    }
  }
  return 1;
}

function frameAt(t) {
  const K = C.ROOT_KEYS;
  const out = [0, 0, 0, 0];
  for (let j = 1; j <= 4; j++) out[j - 1] = track1(K.map((k) => [k[0], k[j]]), t);
  return out;
}
const FRAME_CACHE = new Map();
function frameCached(t) {
  const key = Math.round(t * 1000);
  let f = FRAME_CACHE.get(key);
  if (!f) {
    f = frameAt(t);
    if (FRAME_CACHE.size > 4000) FRAME_CACHE.clear();
    FRAME_CACHE.set(key, f);
  }
  return f;
}

// World root of a fighter: ground position and facing yaw (towards the opponent).
export function rootOf(who, t, out = { pos: new THREE.Vector3(), yaw: 0 }) {
  const [cx, cz, sep, th] = frameCached(t);
  const ux = Math.cos(th);
  const uz = Math.sin(th);
  const advA = track1(C.A_ADV, t);
  const advB = track1(C.B_ADV, t);
  const ax = cx - (ux * sep) / 2 + ux * advA;
  const az = cz - (uz * sep) / 2 + uz * advA;
  const bxp = cx + (ux * sep) / 2 - ux * advB;
  const bzp = cz + (uz * sep) / 2 - uz * advB;
  if (who === 'A') {
    out.pos.set(ax, 0, az);
    out.yaw = Math.atan2(bxp - ax, bzp - az);
  } else {
    out.pos.set(bxp, 0, bzp);
    out.yaw = Math.atan2(ax - bxp, az - bzp);
  }
  return out;
}

export function toWorld(root, l, out = new THREE.Vector3()) {
  return out.set(-l[0], l[1], l[2]).applyAxisAngle(UP, root.yaw).add(root.pos);
}
export function dirToWorld(root, l, out = new THREE.Vector3()) {
  return out.set(-l[0], l[1], l[2]).applyAxisAngle(UP, root.yaw).normalize();
}
function toLocal(root, w, isDir) {
  const v = w.clone();
  if (!isDir) v.sub(root.pos);
  v.applyAxisAngle(UP, -root.yaw);
  return [-v.x, v.y, v.z];
}
function ortho(e, d) {
  const o = e.clone().addScaledVector(d, -e.dot(d));
  if (o.lengthSq() < 1e-6) o.set(0, 1, 0).addScaledVector(d, -d.y);
  return o.normalize();
}

// Weapon pose of a resolved key in world space.
function keyWorld(who, key) {
  const root = rootOf(who, key.t);
  return { H: toWorld(root, key.p), d: dirToWorld(root, key.d), e: dirToWorld(root, key.e), root };
}

function resolveAim(who, key) {
  const other = who === 'A' ? 'B' : 'A';
  const root = rootOf(who, key.t);
  const target = toWorld(rootOf(other, key.t), TARGETS[key.aim.target]);
  const H = toWorld(root, key.aim.hand);
  let d = target.clone().sub(H).normalize();
  const maxA = MAX_ALONG[who];
  if (target.distanceTo(H) > maxA) H.addScaledVector(d, Math.min(target.distanceTo(H) - maxA, 0.18));
  // The sword hand never leaves the reach of its shoulder; the blade falls short instead.
  const shoulder = toWorld(root, shoulderOf(key));
  if (H.distanceTo(shoulder) > REACH) H.sub(shoulder).setLength(REACH).add(shoulder);
  d = target.clone().sub(H).normalize();
  const dist = target.distanceTo(H);
  const along = Math.min(Math.max(dist, 0.55), maxA);
  const e = ortho(dirToWorld(root, key.e || [0, 1, 0]), d);
  key.p = toLocal(root, H);
  key.d = toLocal(root, d, true);
  key.e = toLocal(root, e, true);
  key.contactAlong = Math.min(key.aim.contact ?? along, along);
  key.targetWorld = target;
}

function attackerKey(keys, t) {
  return keys.find((k) => Math.abs(k.t - t) < 1e-4 && k.p);
}

function resolveParry(who, key, keysOf) {
  const att = key.parry.vs;
  const ak = attackerKey(keysOf[att], key.t);
  if (!ak) return false;
  const A = keyWorld(att, ak);
  const Cp = A.H.clone().addScaledVector(A.d, ak.contactAlong ?? 0.6);
  const root = rootOf(who, key.t);
  const n = rootOf(att, key.t).pos.clone().sub(root.pos).setY(0).normalize();
  const left = dirToWorld(root, [-1, 0, 0]);
  let c;
  if (key.parry.style === 'up') {
    const lat = new THREE.Vector3().crossVectors(A.d, UP).normalize();
    if (lat.dot(left) < 0) lat.negate();
    c = lat.multiplyScalar(0.45).addScaledVector(UP, 0.9).normalize();
  } else {
    c = new THREE.Vector3().crossVectors(A.d, A.e).normalize();
    if (key.parry.style === 'hang') {
      if (c.y > 0) c.negate();
      c.addScaledVector(n, 0.35).normalize();
    } else {
      if (c.y < 0) c.negate();
      if (Math.abs(c.y) < 0.25 && c.dot(left) < 0) c.negate();
    }
  }
  // Grip on the blade line closest to the body: to the shoulder for a one-handed sword, to the
  // chest for the longsword so that both hands stay within reach.
  const twoHanded = who === 'A';
  const anchor = toWorld(root, shoulderOf(key, twoHanded ? 0 : 0.19));
  const s = THREE.MathUtils.clamp(Cp.clone().sub(anchor).dot(c) - (twoHanded ? HALF_GRIP : 0), 0.14, 0.7);
  const H = Cp.clone().addScaledVector(c, -s);
  const shoulder = toWorld(root, shoulderOf(key));
  if (H.distanceTo(shoulder) > REACH) {
    H.sub(shoulder).setLength(REACH).add(shoulder);
    c = Cp.clone().sub(H).normalize();
  }
  const e = ortho(A.e.clone().negate(), c);
  key.p = toLocal(root, H);
  key.d = toLocal(root, c, true);
  key.e = toLocal(root, e, true);
  return true;
}

function resolveBlock(key, keysOf) {
  const ak = attackerKey(keysOf[key.block.vs], key.t);
  if (!ak) return false;
  const A = keyWorld(key.block.vs, ak);
  const Cp = A.H.clone().addScaledVector(A.d, ak.contactAlong ?? 0.6);
  const root = rootOf('B', key.t);
  const n = rootOf(key.block.vs, key.t).pos.clone().sub(root.pos).setY(0).normalize();
  n.addScaledVector(UP, key.block.high ? 0.35 : 0.1).normalize();
  const right = dirToWorld(root, [1, 0, 0]);
  const xs = right.addScaledVector(n, -right.dot(n)).normalize();
  const ys = new THREE.Vector3().crossVectors(n, xs);
  const O = Cp.clone().addScaledVector(n, -0.03).addScaledVector(ys, 0.06);
  const W = O.clone().addScaledVector(xs, 0.1).addScaledVector(ys, -0.08).addScaledVector(n, -0.075);
  key.sh = { w: toLocal(root, W), n: toLocal(root, n, true) };
  return true;
}

function resolveAll() {
  const keysOf = { A: C.A_KEYS.map((k) => ({ ...k })), B: C.B_KEYS.map((k) => ({ ...k })) };
  const shield = C.B_SHIELD.map((k) => ({ ...k }));
  for (const who of ['A', 'B']) {
    let lead = 'L';
    for (const k of keysOf[who]) {
      k.ease = k.ease || 'io';
      k.tw = k.tw ?? 0;
      k.lean = k.lean ?? 0;
      k.crouch = k.crouch ?? 0.08;
      lead = k.lead || lead;
      k.lead = lead;
      if (k.pose) Object.assign(k, { p: k.pose.p, d: k.pose.d, e: k.pose.e });
      else if (k.aim) resolveAim(who, k);
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const who of ['A', 'B']) {
      const list = keysOf[who];
      list.forEach((k, i) => {
        if (k.p) return;
        if (k.parry) resolveParry(who, k, keysOf);
        else if (k.hold && list[i - 1]?.p) Object.assign(k, { p: list[i - 1].p, d: list[i - 1].d, e: list[i - 1].e });
      });
    }
  }
  for (const k of shield) {
    k.ease = k.ease || 'io';
    if (k.block) resolveBlock(k, keysOf);
  }
  for (const who of ['A', 'B']) {
    for (const k of keysOf[who]) {
      if (!k.p) throw new Error(`Unresolved key ${who} @ ${k.t}`);
      k.p = new THREE.Vector3(...k.p);
      k.d = new THREE.Vector3(...k.d).normalize();
      k.e = ortho(new THREE.Vector3(...k.e), k.d);
    }
  }
  for (const k of shield) {
    k.w = new THREE.Vector3(...k.sh.w);
    k.n = new THREE.Vector3(...k.sh.n).normalize();
  }
  return { keysOf, shield };
}

// 4a.2: resolveAll() решава геометрията (aim/parry/block) ЕДНОКРАТНО при зареждане на модула
// в оригиналния boy (закон #5). За генерирани двубои трябва да се пререшава при всяка нова
// C.A_KEYS/B_KEYS/B_SHIELD. RESOLVED е `let`; recompileTimeline() се вика от boot.js СЛЕД
// choreo.setChoreography(), ПРЕДИ director.recompileDirector().
export let RESOLVED = resolveAll();
export function recompileTimeline() {
  FRAME_CACHE.clear();
  RESOLVED = resolveAll();
  DYNAMIC_AIMS = computeDynamicAims();
}

function cr(p0, p1, p2, p3, u, out) {
  const u2 = u * u;
  const u3 = u2 * u;
  return out.set(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3),
  );
}

function segment(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const raw = THREE.MathUtils.clamp((t - k1.t) / (k2.t - k1.t || 1), 0, 1);
  return { i, u: EASE[k2.ease](raw), k0: keys[Math.max(0, i - 1)], k1, k2, k3: keys[Math.min(keys.length - 1, i + 2)] };
}

// Local weapon pose plus body drives at time t.
export function weaponAt(who, t, out) {
  const s = segment(RESOLVED.keysOf[who], t);
  cr(s.k0.p, s.k1.p, s.k2.p, s.k3.p, s.u, out.p);
  cr(s.k0.d, s.k1.d, s.k2.d, s.k3.d, s.u, out.d).normalize();
  cr(s.k0.e, s.k1.e, s.k2.e, s.k3.e, s.u, out.e);
  out.e.addScaledVector(out.d, -out.e.dot(out.d));
  if (out.e.lengthSq() < 1e-6) out.e.set(0, 1, 0).addScaledVector(out.d, -out.d.y);
  out.e.normalize();
  out.tw = s.k1.tw + (s.k2.tw - s.k1.tw) * s.u;
  out.lean = s.k1.lean + (s.k2.lean - s.k1.lean) * s.u;
  out.crouch = s.k1.crouch + (s.k2.crouch - s.k1.crouch) * s.u;
  out.lead = s.u < 0.5 ? s.k1.lead : s.k2.lead;
  out.strike = s.k2.aim ? s.u : 0;
  return out;
}

export function shieldAt(t, out) {
  const s = segment(RESOLVED.shield, t);
  cr(s.k0.w, s.k1.w, s.k2.w, s.k3.w, s.u, out.w);
  cr(s.k0.n, s.k1.n, s.k2.n, s.k3.n, s.u, out.n).normalize();
  return out;
}

// Keys whose contact is re-aimed at the live target around their moment of impact.
function computeDynamicAims() {
  return ['A', 'B'].flatMap((who) =>
    RESOLVED.keysOf[who].filter((k) => k.aim?.dynamic).map((k) => ({ who, t: k.t, target: k.aim.target, world: k.targetWorld })),
  );
}
export let DYNAMIC_AIMS = computeDynamicAims();
