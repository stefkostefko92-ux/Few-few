// Impact on the buffers at 115 % of the rated speed (registry sim.ammortizzatori): the car with its rated load on
// the car buffers, or the counterweight on its buffer. Springs and polyurethane pads (on their useful stroke, 90 % of
// the height) as linear buffers, full stroke at bufferFactor times the static load: x(τ) = x_eq·(1 − cos ωτ) +
// (v₀/ω)·sin ωτ, exactly. A hydraulic buffer stops the mass over its whole stroke at a constant deceleration
// v₀²/(2·stroke). Nothing pushes the other side at the impact: it carries on at v₀ and follows the buffer's compression
// while the ropes stay taut, or flies on slowed by g when the buffer stops its side harder than g (ropes slack) — the
// higher of the two, d(τ) = max(x(τ), v₀·τ − g·τ²/2), its speed the derivative —, so the speed of each side is
// continuous at the impact and the other side never runs faster than v₀; the section's conventional jump
// (0,035·v², UNI EN 81-20:2020 5.2.5.6.1) is a clearance, not a launch speed, and the flight's height v₀²/2g stays within
// the stroke and the jump. The traction is not in play here; the channel a carries the deceleration of the mass on the
// buffer (positive while the buffer slows it down). Pure.
import { G } from '../calc/math';
import { KS } from './norme';
import { ease, runPhases, type Phase } from './phases';
import type { Frame } from './series';
import type { BufferParams, SimModel, SimRun } from './model';

const APPROACH = 1.2;
const SETTLE = 1.5;
const HOLD = 1.5;

export function buffer(m: SimModel, p: BufferParams): SimRun {
  const I = m.I, car = p.side === 'car';
  const mass = car ? I.P + I.Q : m.phys.model.Mcw, stroke = car ? m.carStroke : m.cwStroke;
  const v0 = KS.bufferSpeed * I.v, oil = (car ? m.carType : m.cwType) === 'oil';
  const k = (m.bufferFactor * mass * G) / stroke, w = Math.sqrt(k / mass), xeq = oil ? stroke : (mass * G) / k;
  const A = Math.hypot(xeq, v0 / w), phi = Math.atan2(xeq, v0 / w), aOil = (v0 * v0) / (2 * stroke);
  const xOf = (tau: number): number => (oil ? v0 * tau - (aOil * tau * tau) / 2 : xeq * (1 - Math.cos(w * tau)) + (v0 / w) * Math.sin(w * tau));
  const vOf = (tau: number): number => (oil ? v0 - aOil * tau : xeq * w * Math.sin(w * tau) + v0 * Math.cos(w * tau));
  const xMax = oil ? stroke : xeq + A, solid = !oil && xMax > stroke;
  // time of the deepest point, or of the buffer going solid
  const tauEnd = oil ? v0 / aOil : solid ? (phi + Math.asin(Math.min(1, (stroke - xeq) / A))) / w : (Math.PI / 2 + phi) / w;
  const xEnd = Math.min(xOf(tauEnd), stroke);
  // the other side past the contact: the buffer's compression with the ropes taut, its free flight (up from v₀, back
  // after 2·v₀/g) when that is higher; and its speed
  const fly = (tau: number): number => v0 * tau - (G * tau * tau) / 2, tFly = (2 * v0) / G;
  const other = (x: number, vx: number, tau: number): { d: number; v: number } => (fly(tau) > x ? { d: fly(tau), v: v0 - G * tau } : { d: x, v: vx });
  const contact = car ? m.carContact : m.cwContact;
  // the car floor for a compression x of the buffer hit (the car's buffers below, the counterweight's above)
  const sOf = (x: number): number => (car ? contact - x : contact + x);
  const frame = (x: number, vIn: number, aOut: number, tau: number | null): Omit<Frame, 't'> => {
    const s = sOf(x), o = tau == null ? { d: x, v: vIn } : other(x, vIn, tau);
    // the car on its buffers: the counterweight rises by d; the counterweight on its buffer: the car does
    return {
      s: car ? s : contact + o.d, v: car ? -vIn : o.v, a: aOut, cw: car ? m.cw0 - contact + o.d : m.cw0 - s,
      theta: m.phys.sheaveAngle(s - sOf(0)), rope: I.r * (s - sOf(0)),
      Tc: Number.NaN, Tw: Number.NaN, ratio: Number.NaN, efa: Number.NaN, torque: 0, bufCar: car ? x : 0, bufCw: car ? 0 : x, door: 0,
      load: car ? I.Q : 0, slip: 0, brake: 0,
    };
  };
  // deceleration of the mass on the spring, or the hydraulic buffer's constant one
  const decel = (x: number): number => (oil ? aOil : (k * x) / mass - G);
  const approach = (u: number): Omit<Frame, 't'> => {
    const f = frame(0, v0, 0, null);
    const back = v0 * (APPROACH - u);
    return { ...f, s: car ? f.s + back : f.s - back, cw: car ? f.cw - back : f.cw + back, rope: I.r * (car ? back : -back) };
  };
  const settle = (u: number): Omit<Frame, 't'> => {
    const q = u / SETTLE, dx = xeq - xEnd;
    return frame(xEnd + dx * ease(q), (dx * 6 * q * (1 - q)) / SETTLE, (-dx * (6 - 12 * q)) / (SETTLE * SETTLE), tauEnd + u);
  };
  const phases: Phase[] = [
    { dur: APPROACH, at: approach },
    { dur: tauEnd, at: (u) => frame(xOf(u), vOf(u), decel(xOf(u)), u), event: car ? 'carBuffer' : 'cwBuffer' },
    // the buffered return to rest on the buffer: x eased from the deepest point to x_eq, speed and deceleration its derivatives
    { dur: SETTLE, at: (u) => settle(u), event: solid ? 'solid' : 'maxCompression' },
    { dur: Math.max(HOLD, tFly - tauEnd - SETTLE), at: (u) => frame(xeq, 0, 0, tauEnd + SETTLE + u) },
  ];
  const series = runPhases(phases);
  const peakDecel = solid ? Infinity : oil ? aOil : decel(xMax);
  return {
    scenario: { id: 'buffer', p }, series, events: series.events, verdict: solid ? 'fail' : 'ok',
    summary: { util: xMax / stroke, ratio: Number.NaN, efa: Number.NaN, torque: 0, accel: peakDecel, compression: Math.min(xMax, stroke), stroke, slip: false },
  };
}
