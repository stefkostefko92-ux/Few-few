// The two cases where the machine stands or turns against a car that cannot move as it should:
// - loading: at the end position of the verification, with the brake closed, people load the car up to 1.25·Q;
//   if T1/T2 passes e^(f·α) the ropes slip and the car slides down (onto its buffers at the lowest floor);
// - car stalled: the machine turns upwards past the top floor until the counterweight lands on its buffer; the
//   ropes must then slip (the car stays), otherwise the car is lifted into the headroom.
// Stepped in time, the same pulls as the verification. Pure.
import { K } from '../calc/norme';
import { G } from '../calc/math';
import { KS } from './norme';
import { recorder } from './series';
import { travelLimits, type SimModel, type SimRun } from './model';

const RAMP = 6;
const HOLD = 3;

/** The upward acceleration (≤ 0) at which T1/T2 falls back to e^(f·α): the car sliding down. */
function slideAccel(u: (a: number) => number): number {
  let lo = -G, hi = 0;
  if (u(lo) > 1) return lo;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (u(mid) > 1) hi = mid;
    else lo = mid;
  }
  return lo;
}

export function loading(m: SimModel): SimRun {
  const P = m.phys, I = m.I, s0 = m.res.load.pos === 'b' ? 0 : m.H, Lmax = K.loadTestFactor * I.Q, dt = KS.step;
  const rec = recorder(dt);
  let s = s0, v = 0, slipping = false, landed = false, t = 0, worst = 0, wRatio = 0, wEfa = 0;
  const util = (at: number, L: number, a: number): number => P.pull(at, a, L).ratio / P.efa('loading', at);
  while (t <= RAMP + HOLD + 1e-9) {
    const L = Lmax * Math.min(1, t / RAMP);
    let a = 0;
    if (!landed) {
      const u0 = util(s, L, 0);
      if (u0 > worst) { worst = u0; wRatio = P.pull(s, 0, L).ratio; wEfa = P.efa('loading', s); }
      if (u0 > 1 && !slipping) { slipping = true; rec.event('slip'); }
      if (slipping) a = slideAccel((x) => util(s, L, x));
      v += a * dt;
      const lim = travelLimits(m, s + v * dt);
      if (lim.s !== s + v * dt || lim.bufCar > 0) {
        if (!landed) rec.event('carBuffer');
        landed = true;
        v = 0;
        a = 0;
      }
      s = lim.s;
    }
    const pl = P.pull(s, a, L), lim = travelLimits(m, s);
    rec.push({
      s, v, a, cw: m.cw0 - s, theta: 0, rope: I.r * (s - s0), Tc: pl.Tc, Tw: pl.Tw, ratio: pl.ratio, efa: P.efa('loading', s), torque: 0,
      bufCar: lim.bufCar, bufCw: lim.bufCw, door: 1, load: L, slip: slipping && !landed ? 1 : 0, brake: 1,
    });
    if (Math.abs(t - RAMP) < dt / 2) rec.event('loadFull');
    t += dt;
  }
  const series = rec.done();
  const verdict = worst > 1 ? 'fail' : worst > K.tractionWarn ? 'warn' : 'ok';
  return { scenario: { id: 'loading' }, series, events: series.events, verdict, summary: { util: worst, ratio: wRatio, efa: wEfa, torque: 0, accel: 0, slip: slipping } };
}

export function stall(m: SimModel): SimRun {
  const P = m.phys, I = m.I, M = m.M, dt = KS.step, vUp = Math.min(KS.stallSpeed, I.v), Mcw = P.model.Mcw;
  // the counterweight hangs on the ropes less and less as its buffer compresses; fully on it at stroke / factor
  const xFull = m.cwStroke / m.bufferFactor;
  const hanging = (x: number): number => Mcw * Math.max(0, 1 - x / xFull);
  const rec = recorder(dt);
  const ratioAt = (at: number): { ratio: number; efa: number; x: number } => {
    const x = Math.max(0, at - m.cwContact);
    return { ratio: P.pull(at, 0, 0, hanging(x)).ratio, efa: P.efa('stalled', at), x };
  };
  let s = m.H, t = 0, sheave = 0, slipping = false, lifted = false, tEnd = Infinity, touched = false, rSlip = 0, eSlip = 0;
  const eta = M.etaD * I.etaShaft;
  while (t <= Math.min(tEnd, 30) + 1e-9) {
    const { x } = ratioAt(s), mw = hanging(x), pl = P.pull(s, 0, 0, mw), efa = P.efa('stalled', s);
    const moving = !slipping;
    rec.push({
      s, v: moving ? vUp : 0, a: 0, cw: m.cw0 - Math.min(s, m.cwContact + xFull), theta: P.sheaveAngle(sheave), rope: I.r * (s - m.H),
      Tc: pl.Tc, Tw: pl.Tw, ratio: pl.ratio, efa, torque: ((pl.Tc - pl.Tw) * P.model.R) / (M.i * eta), bufCar: 0, bufCw: Math.min(x, xFull),
      door: 0, load: 0, slip: slipping ? 1 : 0, brake: 0,
    });
    sheave += vUp * dt;
    t += dt;
    if (!moving) continue;
    let next = s + vUp * dt;
    const nx = ratioAt(next);
    if (nx.x > 0 && !touched) { touched = true; rec.event('cwBuffer'); }
    if (!lifted && nx.x > 0 && nx.ratio >= nx.efa) {
      // the ropes start to slip within this step: where exactly (bisection on the car position)
      let lo = s, hi = next;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2, q = ratioAt(mid);
        if (q.x > 0 && q.ratio >= q.efa) hi = mid;
        else lo = mid;
      }
      next = hi;
      const q = ratioAt(next);
      slipping = true;
      rSlip = q.ratio;
      eSlip = q.efa;
      rec.event('slip');
      tEnd = t + HOLD;
    } else if (!lifted && hanging(nx.x) === 0) {
      lifted = true;
      rSlip = nx.ratio;
      eSlip = nx.efa;
      rec.event('lifted');
      tEnd = t + HOLD;
    }
    s = next;
  }
  const series = rec.done();
  let torque = 0;
  for (let i = 0; i < series.n; i++) torque = Math.max(torque, Math.abs(series.data.torque[i]));
  // the verification's case: the counterweight wholly on its buffer, the car at the top (res.stall)
  const verdict = m.res.stall.ratio >= m.res.stall.efa && !lifted ? 'ok' : 'fail';
  return {
    scenario: { id: 'stall' }, series, events: series.events, verdict,
    summary: { util: eSlip > 0 ? eSlip / Math.max(rSlip, 1e-9) : 0, ratio: rSlip, efa: eSlip, torque, accel: 0, slip: slipping },
  };
}
