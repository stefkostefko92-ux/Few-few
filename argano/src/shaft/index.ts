// Public API of the shaft module: plan, section A-A and machine room of the shaft, car, doors, rails, counterweight and
// their checks, as numbers and as model entities for the drawing kernel. No I/O, no framework: it runs in the browser
// and on the server.
export { layout, defaultInputs, verdictOf, counterweightSide } from './layout';
export { isUpperLimit } from './checks';
export { maxArea, loadForArea, passengers } from './area';
export { SHAFT_ENGINE_VERSION, shaftSnapshot, projectLayout } from './snapshot';
export type { ShaftSnapshot } from './snapshot';
export { KV, DEFAULTS, VOCI_VANO, vociOfDesign } from './norme';
export type { Allowance, CostanteVano, GruppoVano, VoceVano } from './norme';
export { KV_VERT, VOCI_VERT, COSTANTI_VERT } from './norme-vert';
export type { CostanteVert } from './norme-vert';
export { RAILS, RAIL_TYPES, railLabel } from './rails';
export type { RailSize, RailType } from './rails';
export { DEFAULT_FLOORS, DEFAULT_VERTICAL, levels, travel } from './vertical';
export type { Floor, VerticalInputs } from './vertical';
export { DEFAULT_ROOM } from './room';
export type { RoomInputs } from './room';
export { section, sectionChecks, roofGap } from './section';
export type { Section } from './section';
export { planEntities, doorsAt, roofSpaces, pitSpace, buffersAt } from './plan-view';
export type { PlanLevel } from './plan-view';
export { planDims } from './plan-dims';
export type { PlanLabels } from './plan-dims';
export { sectionEntities, mapZ } from './section-view';
export type { SectionView, ZMap } from './section-view';
export { sectionDims } from './section-dims';
export type { SectionKind } from './section-dims';
export { roomGeo, roomChecks } from './machine-room';
export type { MachineSpec, RoomGeo } from './machine-room';
export { roomPlanEntities, roomSectionEntities } from './room-view';
export type * from './types';
