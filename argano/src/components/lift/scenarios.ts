// The scenarios the simulator offers, their starting parameters, the view that shows each best, and which scenario
// replays a check of the verification (the list of checks has a "simulate" button where there is one). Pure.
import type { CheckId, Results } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';
import type { ScenarioParams, SimModel } from '@/sim';
import type { View } from '../lift3d/boot';

export const SCENARIOS = ['ride', 'brake', 'loading', 'stall', 'buffer'] as const;
export type ScenarioKey = (typeof SCENARIOS)[number];

export function defaultScenario(id: ScenarioKey, m: SimModel, main: number): ScenarioParams {
  const top = m.levels.length - 1;
  switch (id) {
    case 'ride': return { id, p: { from: main < top ? main : 0, to: top, load: m.I.Q } };
    case 'brake': return { id, p: { load: 'q', dir: 'dn', decel: 'real' } };
    case 'loading': return { id };
    case 'stall': return { id };
    case 'buffer': return { id, p: { side: 'car' } };
  }
}

export function viewFor(sc: ScenarioParams, machineAbove: boolean): View {
  if (sc.id === 'buffer') return 'pit';
  if (sc.id === 'stall' || sc.id === 'brake') return machineAbove ? 'room' : 'car';
  return 'car';
}

/** The run that replays a check, with the view to watch it from; null: nothing to replay. */
export function scenarioForCheck(id: CheckId | ShaftCheckId, res: Results, m: SimModel): { sc: ScenarioParams; view: View; zones?: boolean } | null {
  const top = m.levels.length - 1;
  switch (id) {
    case 'tr_load': return { sc: { id: 'loading' }, view: 'car' };
    case 'tr_dn': return { sc: { id: 'brake', p: { load: res.dn.load, dir: 'dn', decel: 'norm', pos: res.dn.pos } }, view: 'room' };
    case 'tr_up': return { sc: { id: 'brake', p: { load: res.up.load, dir: 'up', decel: 'norm', pos: res.up.pos } }, view: 'room' };
    case 'tr_real': return { sc: { id: 'brake', p: { load: res.real.load, dir: res.real.dir, decel: 'real', pos: res.real.pos } }, view: 'room' };
    // the largest deceleration the brake gives: its own case, not the worst for traction
    case 'b_amax': {
      const c = res.brake.aMaxCase;
      return { sc: { id: 'brake', p: { load: c.load, dir: c.dir, decel: 'real', pos: c.pos } }, view: 'room' };
    }
    case 'tr_stall': return { sc: { id: 'stall' }, view: 'room' };
    case 'd_pst': case 'd_ratio': case 'd_mp': return { sc: { id: 'ride', p: { from: 0, to: top, load: m.I.Q } }, view: 'car' };
    case 'b_car': case 'b_runby': case 'p_apron': return { sc: { id: 'buffer', p: { side: 'car' } }, view: 'pit' };
    case 'b_cw': return { sc: { id: 'buffer', p: { side: 'cw' } }, view: 'pit' };
    case 'h_refuge': case 'h_clear': case 'h_parapet': return { sc: { id: 'ride', p: { from: 0, to: top, load: 0 } }, view: 'car', zones: true };
    case 'p_refuge': return { sc: { id: 'ride', p: { from: top, to: 0, load: 0 } }, view: 'pit', zones: true };
    default: return null;
  }
}
