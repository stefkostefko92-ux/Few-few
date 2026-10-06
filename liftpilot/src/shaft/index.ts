// Public API of the shaft module: plan, section A-A and machine room of the shaft, car, doors, rails, counterweight and
// their checks, as numbers and as model entities for the drawing kernel. No I/O, no framework: it runs in the browser
// and on the server.
export { layout, defaultInputs, verdictOf, counterweightSide } from './layout';
export { decimalsShown, isUpperLimit, mergeChecks, shownValue } from './checks';
export { maxArea, loadForArea, passengers } from './area';
export { SHAFT_ENGINE_VERSION, shaftSnapshot, projectLayout } from './snapshot';
export type { ShaftSnapshot } from './snapshot';
export { KV, DEFAULTS, VOCI_VANO, vociOfDesign } from './norme';
export type { Allowance, CostanteVano, GruppoVano, VoceVano } from './norme';
export { KV_VERT, VOCI_VERT, COSTANTI_VERT } from './norme-vert';
export type { CostanteVert } from './norme-vert';
export { FISHPLATES, GENERIC_BRACKET, RAILS, RAIL_TYPES, railClip, railLabel } from './rails';
export { RAIL_LENGTH, bracketCount, bracketHeights, railSpan, withPitches, type BracketPitches } from './brackets';
export { NO_HEAD, hasHead, headBox, headCheck, headClearances, headOf, mainBox, type WallBox } from './head';
export type { Fishplate, RailClip, RailSize, RailType } from './rails';
export { DEFAULT_FLOORS, DEFAULT_VERTICAL, levels, travel } from './vertical';
export type { BufferType, Floor, VerticalInputs } from './vertical';
export { BUFFER_TYPES, bufferStroke, bufferType, maxSpeed, strokeNeeded, typicalBuffer, withBufferType } from './buffers';
export { DEFAULT_ROOM } from './room';
export { PROFILES, PROFILE_NAMES, isChannel } from './profiles';
export type { Profile, ProfileName } from './profiles';
export { SUPPORT_KINDS, hasProfile, padsOf, profileOf, sheaveAxisOn, supportHeight, supportLength, supportOf, supportSpan } from './support';
export type { MachineSupport, SupportKind } from './support';
export type { RoomInputs } from './room';
export { section, sectionChecks, roofGap } from './section';
export type { Section } from './section';
export { planEntities, doorsAt, roofSpaces } from './plan-view';
export { BUFFER_R, bufferChecks, bufferMargin, bufferPlan, pitSpace } from './pit';
export type { BufferPlan, BufferSpot } from './pit';
export type { PlanLevel } from './plan-view';
export { planDims } from './plan-dims';
export { callStationAt, callStationOf } from './callstation';
export { landingKey, landingOf, landingShift } from './landing';
export { PANEV_BACK, cwBracketsOf } from './staffe';
export { CW_CHOICES, CW_SPECIALS, CW_SUPPORTS, DOOR_PAIRS, isCwSpecial } from './staffe-ids';
export type { CwChoice, CwSpecial, CwSupportCode, DoorPairId } from './staffe-ids';
export {
  DOOR_PAIR_DEFAULT, PLATES_A, bracketsAlong, doorBracketCount, doorPair, doorPairOf, plateReach, topBracketSpan, topBracketsAt, topPairRoom, topPairStops,
} from './staffe-porte';
export type { DoorPair, DoorSection, PlateA } from './staffe-porte';
export { SC_SUPPORTS } from './staffe-sc';
export type { ScPlace, ScSupport } from './staffe-sc';
export { bracketCode, cwBracket, cwBracketMargin, cwSpecialOf } from './staffe-scelta';
export type { ArmBracket, CwBracket, SlideBracket } from './staffe-scelta';
export { GOVERNORS, LEVER_REACH, freeSides, govSize, governorSpot } from './governor';
export type { Governor, GovernorSpot } from './governor';
export { CALC_KEYS, PLAN_KEYS, applyEdit, editKeys, editLabel, editValue, keptPlan, planValues, valueOf, withChoice, withValue, withoutFix } from './edit';
export { FRAME_STD, portalOf, withFrame } from './frame';
export {
  NO_IMBOTTI, hasImbotti, imbottiOf, marbleHeight, marbleOpening, marbleWidth, wallOpeningHeight, withImbotti, withMarbleHeight, withMarbleWidth,
} from './imbotti';
export type { PlanLabels } from './plan-dims';
export { sectionEntities, mapZ } from './section-view';
export type { SectionView, ZMap } from './section-view';
export { sectionDims } from './section-dims';
export type { SectionKind } from './section-dims';
export { roomGeo, roomChecks } from './machine-room';
export type { MachineSpec, RoomGeo } from './machine-room';
export { roomPlanEntities, roomSectionEntities } from './room-view';
export type * from './types';
