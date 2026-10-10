// One entry point for the scenarios, and the list the interface offers. Pure.
import { brake } from './brake';
import { buffer } from './buffer';
import { ride } from './ride';
import { loading, stall } from './statics';
import type { ScenarioParams, SimModel, SimRun } from './model';

export function runScenario(m: SimModel, sc: ScenarioParams): SimRun {
  switch (sc.id) {
    case 'ride': return ride(m, sc.p);
    case 'brake': return brake(m, sc.p);
    case 'loading': return loading(m);
    case 'stall': return stall(m);
    case 'buffer': return buffer(m, sc.p);
  }
}
