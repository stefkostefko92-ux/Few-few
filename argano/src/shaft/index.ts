// Public API of the shaft module (plan of the shaft, car, doors, counterweight). No I/O, no framework: it runs in the
// browser and on the server.
export { layout, defaultInputs, verdictOf } from './layout';
export { maxArea, loadForArea, passengers } from './area';
export { drawPlan, explodeDim } from './drawing';
export type { DimPrim, Drawing, Fill, PlanLabels, PlanLayer, Prim, Pt } from './drawing';
export { SHAFT_ENGINE_VERSION, shaftSnapshot, projectLayout } from './snapshot';
export type { ShaftSnapshot } from './snapshot';
export { KV, DEFAULTS, VOCI_VANO } from './norme';
export type { Allowance, CostanteVano, GruppoVano, VoceVano } from './norme';
export type * from './types';
