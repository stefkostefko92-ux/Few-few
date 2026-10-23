// Scenarios made of phases (doors, start, cruise, braking…): each phase gives the state at u seconds into it; the
// phases are sampled one after the other on one clock, and a phase's events are recorded at its first sample. Pure.
import { KS } from './norme';
import { recorder, type EventId, type Frame, type Series } from './series';

export interface Phase {
  /** duration [s] (0: skipped) */
  dur: number;
  at(u: number): Omit<Frame, 't'>;
  event?: EventId | readonly EventId[];
}

export function runPhases(phases: readonly Phase[]): Series {
  const rec = recorder(KS.step), live = phases.filter((p) => p.dur > 1e-9), total = live.reduce((s, p) => s + p.dur, 0);
  if (!live.length) return rec.done();
  const steps = Math.max(1, Math.ceil(total / KS.step - 1e-9));
  let idx = 0, acc = 0, entered = -1;
  for (let k = 0; k <= steps; k++) {
    const t = Math.min(k * KS.step, total);
    while (idx < live.length - 1 && t >= acc + live[idx].dur - 1e-9) {
      acc += live[idx].dur;
      idx += 1;
    }
    const ph = live[idx];
    rec.push(ph.at(Math.min(t - acc, ph.dur)));
    if (entered !== idx) {
      entered = idx;
      const ev = ph.event;
      if (ev) for (const id of typeof ev === 'string' ? [ev] : ev) rec.event(id);
    }
  }
  return rec.done();
}

/** Smooth 0 → 1 (doors). */
export const ease = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
