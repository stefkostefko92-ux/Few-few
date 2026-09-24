// Fight events: finds where steel actually meets steel this frame and fires sparks, sound,
// body reactions and camera shake from that exact point.
import * as THREE from 'three';
import { EVENTS } from './choreo.js';

const UP = new THREE.Vector3(0, 1, 0);

// Closest points between segments p1q1 and p2q2 (Ericson, Real-Time Collision Detection 5.1.9).
export function closestSegSeg(p1, q1, p2, q2, outA, outB) {
  const d1 = new THREE.Vector3().subVectors(q1, p1);
  const d2 = new THREE.Vector3().subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  const c = d1.dot(r);
  const b = d1.dot(d2);
  const denom = a * e - b * b;
  s = denom > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = THREE.MathUtils.clamp(-c / a, 0, 1);
  } else if (t > 1) {
    t = 1;
    s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
  }
  outA.copy(p1).addScaledVector(d1, s);
  outB.copy(p2).addScaledVector(d2, t);
}

function closestOnSegment(a, b, p, out) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
  return out.copy(a).addScaledVector(ab, t);
}

export function createEvents({ A, B, fx, audio, director, camera, onLightning }) {
  const scrapes = [];
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const right = new THREE.Vector3();
  const panOf = (p) => {
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    return THREE.MathUtils.clamp(right.dot(new THREE.Vector3().subVectors(p, camera.position)) / 4, -1, 1);
  };

  function bladeContact() {
    closestSegSeg(A.bladeBase, A.bladeTip, B.bladeBase, B.bladeTip, pa, pb);
    return pa.clone().add(pb).multiplyScalar(0.5);
  }

  function shieldContact(att) {
    const n = B.shieldNormal;
    const o = B.shieldCenter;
    const base = att.bladeBase;
    const tip = att.bladeTip;
    const den = n.dot(new THREE.Vector3().subVectors(tip, base));
    let p;
    if (Math.abs(den) > 1e-5) {
      const s = THREE.MathUtils.clamp(n.dot(new THREE.Vector3().subVectors(o, base)) / den, 0, 1);
      p = base.clone().lerp(tip, s);
    } else p = closestOnSegment(base, tip, o, new THREE.Vector3());
    const off = p.clone().sub(o);
    off.addScaledVector(n, -off.dot(n));
    if (off.length() > 0.3) off.setLength(0.3);
    return o.clone().add(off).addScaledVector(n, 0.02);
  }

  function away(from, to) {
    return new THREE.Vector3().subVectors(to.root.pos, from.root.pos).setY(0).normalize();
  }

  function fire(ev, ts) {
    const p = ev.power ?? 1;
    if (ev.type === 'lightning') {
      onLightning(p);
      return;
    }
    if (ev.type === 'clash') {
      const c = bladeContact();
      const n = new THREE.Vector3().crossVectors(A.dir, B.dir).normalize();
      if (n.lengthSq() < 0.5) n.copy(UP);
      fx.impact(c, n.clone().addScaledVector(UP, 0.4), p * 0.6);
      fx.impact(c, n.negate().addScaledVector(UP, 0.4), p * 0.6);
      A.react('recoil', 0.7 * p, away(B, A));
      B.react('recoil', 0.7 * p, away(A, B));
      director.addTrauma(0.22 * p);
      audio.play('clash', p, panOf(c), ts);
      if (p >= 1.2) audio.play('boom', 0.8, 0, ts);
    } else if (ev.type === 'shield') {
      const att = ev.by === 'A' ? A : B;
      const c = shieldContact(att);
      fx.impact(c, B.shieldNormal.clone().addScaledVector(UP, 0.5), p * 0.7);
      B.react('block', p, away(A, B));
      att.react('recoil', 0.9 * p, away(B, A));
      director.addTrauma(0.2 * p);
      audio.play('shield', p, panOf(c), ts);
    } else if (ev.type === 'tap') {
      const c = shieldContact(B);
      fx.impact(c, B.shieldNormal.clone().addScaledVector(UP, 0.6), p * 0.35);
      audio.play('tap', p, panOf(c), ts);
    } else if (ev.type === 'bash') {
      const c = A.rig.w.chest.clone().addScaledVector(away(A, B), 0.2);
      fx.impact(c, away(B, A).addScaledVector(UP, 0.5), p * 0.3);
      A.react('bash', p, away(B, A));
      director.addTrauma(0.6 * p);
      audio.play('bash', p, panOf(c), ts);
    } else if (ev.type === 'helm') {
      const head = B.rig.w.head.clone().add(new THREE.Vector3(0, 0.1, 0));
      const c = closestOnSegment(A.bladeBase, A.bladeTip, head, new THREE.Vector3());
      c.lerp(head, 0.35);
      fx.impact(c, c.clone().sub(head).normalize().addScaledVector(UP, 0.4), p * 0.6);
      fx.impact(c, away(A, B).addScaledVector(UP, 0.3), p * 0.35);
      B.react('helm', p, away(A, B));
      A.react('recoil', 0.6, away(B, A));
      director.addTrauma(0.8);
      audio.play('helm', p, panOf(c), ts);
      audio.play('boom', 1, 0, ts);
    } else if (ev.type === 'disarm') {
      audio.play('tap', 0.5, panOf(B.grip), ts);
    } else if (ev.type === 'kneel') {
      const k = B.rig.w.kneeR.clone().setY(0.03);
      fx.impact(k, UP, p, 'water');
      audio.play('bash', 0.45, panOf(k), ts);
    } else if (ev.type === 'scrape') {
      scrapes.push({ until: ev.t + ev.dur, power: p, next: 0 });
    }
  }

  return {
    step(prevT, T, ts, jumped) {
      if (jumped) {
        scrapes.length = 0;
        return;
      }
      for (const ev of EVENTS) if (ev.t > prevT && ev.t <= T) fire(ev, ts);
      const land = B.landingTime();
      if (land > prevT && land <= T) {
        const g = B.grip.clone().setY(0.03);
        fx.impact(g, UP, 0.5, 'water');
        fx.impact(g, UP, 0.25);
        audio.play('clatter', 1, panOf(g), ts);
      }
      for (let i = scrapes.length - 1; i >= 0; i--) {
        const s = scrapes[i];
        if (T > s.until) {
          scrapes.splice(i, 1);
          continue;
        }
        const c = bladeContact();
        if (pa.distanceTo(pb) > 0.25) continue;
        fx.impact(c, new THREE.Vector3().crossVectors(A.dir, B.dir).normalize().addScaledVector(UP, 0.8), s.power, 'scrape');
        s.next -= 1;
        if (s.next <= 0) {
          audio.play('scrape', s.power, panOf(c), ts);
          s.next = 4;
        }
      }
    },
    reset() {
      scrapes.length = 0;
    },
  };
}
