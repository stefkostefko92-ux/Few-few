// What each face does in story time: blinks (idle and reflex), effort on the knight's own blows,
// bracing against the other's, pain when struck, mouth breathing when spent, the Warden's defeat
// on his knees and Ser Aldric's relief. Pure data: the renderer turns it into expression targets.
import { EVENTS, A_KEYS, B_KEYS, BREATH, B_LOOK_DOWN } from './choreo.js';
import { track1 } from './timeline.js';
import { DURATION } from './config.js';

export const EXPRESSIONS = ['blinkR', 'blinkL', 'squint', 'browDown', 'browUp', 'snarl', 'jawOpen'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ramp = (a, b, v) => clamp01((v - a) / (b - a));

// Rises before the moment, peaks just after it, fades out.
const envelope = (t, before, after) => (t < -before || t > after ? 0 : t < 0 ? Math.sin(((t + before) / before) * Math.PI * 0.5) ** 2 : (1 - t / after) ** 2);

function blinkShape(t) {
  if (t < 0 || t > 0.22) return 0;
  if (t < 0.07) return t / 0.07;
  if (t < 0.1) return 1;
  return 1 - (t - 0.1) / 0.12;
}

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const REFLEX = new Set(['clash', 'shield', 'pauldron', 'bash', 'lightning']);

export class FaceDriver {
  constructor(who) {
    this.who = who;
    const rnd = seeded(who === 'A' ? 4711 : 1291);
    const blinks = [];
    for (let t = rnd() * 2; t < DURATION + 4; t += 2.3 + rnd() * 3.4) blinks.push(t);
    for (const ev of EVENTS) if (REFLEX.has(ev.type)) blinks.push(ev.t - 0.03);
    this.blinks = blinks.sort((a, b) => a - b);
    this.saccades = Array.from({ length: Math.ceil(DURATION / 0.4) + 8 }, () => [rnd() - 0.5, rnd() - 0.5, 0.45 + rnd() * 0.8]);
    const own = (who === 'A' ? A_KEYS : B_KEYS).filter((k) => k.aim).map((k) => k.t);
    if (who === 'B') own.push(...EVENTS.filter((e) => e.type === 'bash').map((e) => e.t));
    this.strikes = own;
    // Blows the knight meets with blade or shield, and the ones that land on him.
    this.braces = EVENTS.filter((e) => e.type === 'clash' || (who === 'B' && e.type === 'shield')).map((e) => e.t);
    this.hits = EVENTS.filter((e) => (who === 'A' ? e.type === 'bash' : e.type === 'pauldron')).map((e) => [e.t, e.power ?? 1]);
    this.out = Object.fromEntries(EXPRESSIONS.map((k) => [k, 0]));
    this.look = { dx: 0, dy: 0, down: 0 };
    this.pupil = 0.5;
  }

  // breath: the body's breathing phase (-1..1). Returns expression weights (0..1).
  sample(T, breath = 0) {
    let blink = 0;
    for (const b of this.blinks) {
      if (b > T) break;
      blink = Math.max(blink, blinkShape(T - b));
    }
    let effort = 0;
    for (const s of this.strikes) effort = Math.max(effort, envelope(T - s, 0.35, 0.5));
    let brace = 0;
    for (const s of this.braces) brace = Math.max(brace, envelope(T - s, 0.12, 0.45));
    let pain = 0;
    for (const [t, p] of this.hits) pain = Math.max(pain, T < t ? 0 : Math.min(1, p * 0.75) * envelope(T - t, 0.01, p > 1.2 ? 3.2 : 1.1) * ramp(0, 0.06, T - t));
    const tired = clamp01((track1(BREATH, T) - 1) / 1.8);
    const defeat = this.who === 'B' ? ramp(22.4, 23.9, T) : 0;
    const relief = this.who === 'A' ? ramp(23.3, 24.8, T) : 0;
    const exhale = Math.max(0, -breath);
    const o = this.out;
    o.squint = clamp01(0.45 * effort + 0.5 * brace + 0.9 * pain) * (1 - blink);
    o.browDown = clamp01(0.85 * effort + 0.4 * brace + 0.45 * pain - 0.5 * defeat);
    o.browUp = clamp01(0.35 * pain * ramp(0.4, 1.4, T - (this.hits[0]?.[0] ?? Infinity)) + 0.55 * defeat + 0.15 * relief);
    o.snarl = clamp01(0.75 * effort + 0.35 * brace + 0.95 * pain - 0.3 * relief);
    o.jawOpen = Math.min(0.85, tired * (0.1 + 0.18 * exhale) + 0.3 * effort * exhale + 0.6 * pain + 0.15 * defeat);
    o.blinkR = blink;
    o.blinkL = Math.min(1, blink * 1.02);
    // Gaze: on the other knight's eyes with small saccades; the beaten Warden looks at the stones.
    let t = 0;
    for (const [dx, dy, hold] of this.saccades) {
      t += hold;
      if (t > T) {
        this.look.dx = dx * 0.018;
        this.look.dy = dy * 0.012;
        break;
      }
    }
    this.look.down = this.who === 'B' ? track1(B_LOOK_DOWN, T) : 0;
    this.pupil = 0.5 + 0.06 * pain;
    return o;
  }
}
