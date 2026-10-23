// The installation from one form: shaft, calculation and simulation derived together (src/lib/lift/derive.ts).
export { deriveLift, carMassEstimate } from './derive';
export type { AutoFlags, DerivedKey, LiftDerived, LiftInputs, Origin } from './derive';
export { AUTO_ALL, defaultLift, newLift } from './defaults';
export { KL, VOCI_IMPIANTO } from './norme';
export type { CostanteImpianto, VoceImpianto } from './norme';
export { belt, tangent } from './belt';
export type { Belt, BeltEl, Pt2 } from './belt';
export { machineSpec } from './machine';
export { planeAt, ropeRig } from './rig';
export type { RopePiece, RopePlane, RopeRig, Wheel } from './rig';
export { BOTTOM_SCHEMES, bottomGeo, extraBends } from './bottom';
export type { BottomGeo, BottomScheme } from './bottom';
export { LIFT_ENGINE_VERSION } from './version';
export { NO_MARKS, P_ESTIMATE_RULE, valueMarks } from './marks';
export { AMBITO_VERIFICHE, AUTO_PARTI, NORMA_BREVE, NORMA_SIGLA, NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI, VERIFICHE_DM236, VERIFICHE_NTC, adeguamentiDovuti, ambitoNorme,
  ambitoOf, ammessa, collaudoOf, collaudoVerdict, esitiNorme, normeOf, underNorma, withAggiunta } from './collaudo';
export type { Ambito, Collaudo, EsitoNorma, Norma, NormaAggiuntiva, NormaCollaudo, Parte } from './collaudo';
export { PARTI_FACOLTATIVE, PARTI_LOCALE, PARTI_RIFACIMENTO, PARTI_SOLO, TIPI_INTERVENTO, VARIAZIONI, contestoDi, disegnoDi, interventoDi, interventoTo, interventoValido,
  isTipoIntervento, macchinaResta, rifacimentoTo, sostanziale, stessoIntervento, tipoDaRivedere, type Dichiarato } from './intervento';
export type { Disegno, TipoIntervento } from './intervento';
export { ADEMPIMENTI, NORME_INFO, SOSTANZIALE } from './norme-collaudo';
export type { AmbitoNorma, NormaInfo, PuntoInSito } from './norme-collaudo';
export type { GeometryKey, ValueMarks } from './marks';
