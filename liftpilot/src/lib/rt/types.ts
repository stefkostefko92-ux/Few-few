// The contract of the relazione tecnica di modifica (RT, round 49): the sections of the document and why each is in,
// the RT's checks, the base an RT is made from (the survey of the machine room or a lift design, each on its
// calculation), the files attached, the expected documents, the approval regime, and what the RT engine derives and an
// issued RT keeps. Written first and kept stable: the checks, the derivation and the snapshot (S3), the document
// builder (S6), the server and the screens (S7) build on it. Types, plus the lists the schemas need. Pure.
import type { CheckId, CheckStatus, FormValues } from '@/calc/types';
import type { Layout, ShaftCheck, ShaftCheckId } from '@/shaft/types';
import type { Analysis } from '../present/analysis';
import type { Collaudo, Parte } from '../lift/collaudo';
import type { LiftDerived } from '../lift/derive-types';
import type { TipoIntervento } from '../lift/intervento';
import type { Norma10411 } from '../lift/modifica';
import type { CasoVariazione } from '../lift/obblighi-variazioni';
import type { PuntoInSito } from '../lift/punti';
import type { RoomDerived } from '../room/derive';
import type { Survey } from '../room/survey';

/** The component sections of the RT, in the order of the document (sezioni.ts gives their titles and triggers). */
export const SEZIONE_KEYS = ['quadro', 'cabina', 'funi', 'argano', 'locale', 'guideCabina', 'guideContrappeso', 'ammortizzatori', 'limitatore', 'porte',
  'contrappeso', 'vano'] as const;
export type SezioneKey = (typeof SEZIONE_KEYS)[number];
export const isSezioneKey = (x: unknown): x is SezioneKey => SEZIONE_KEYS.some((k) => k === x);

/** What a file or an expected document belongs to: a section of the RT, the installation as a whole, the building. */
export const COMPONENTI = [...SEZIONE_KEYS, 'impianto', 'edificio'] as const;
export type Componente = (typeof COMPONENTI)[number];

/** The kinds of an uploaded file: the database's enum AttachmentKind (migration 27), the same names. */
export const ALLEGATO_KINDS = ['DICHIARAZIONE_UE', 'CERTIFICATO_ESAME_TIPO', 'CERTIFICATO_COMPONENTE', 'SCHEMA_ELETTRICO', 'DICHIARAZIONE_IDONEITA',
  'RELAZIONE_TARATURA', 'LIBRETTO_VERBALE', 'DISEGNO', 'FOTO', 'ALTRO'] as const;
export type AllegatoKind = (typeof ALLEGATO_KINDS)[number];

/** The documents the RT expects by the parts and cases of the modification (documenti.ts: titles, kinds, clauses). */
export const DOCUMENTO_IDS = ['schema', 'quadro_ue', 'macchina_ue', 'taratura', 'funi_cert', 'limitatore_ue', 'limitatore_cet', 'limitatore_fune',
  'paracadute_cet', 'acop_cet', 'ammortizzatori_cet', 'serrature_cet', 'porte_fuoco', 'idoneita_strutture', 'ancoraggi', 'allarme_ue', 'libretto'] as const;
export type DocumentoId = (typeof DOCUMENTO_IDS)[number];

/** The approval regimes of an existing lift (regimi.ts: how each is printed, on which part of UNI 10411, its years). */
export const REGIME_KEYS = ['dlgt_600_1945', 'dpr_1497_1963', 'dm_587_1987', 'dpr_268_1994', 'dpr_162_1999'] as const;
export type RegimeKey = (typeof REGIME_KEYS)[number];

/** The types of intervention an RT is made for: «Trasformazione completa» is tested as a new lift (not eligible). */
export type RtTipo = Exclude<TipoIntervento, 'TRASFORMAZIONE_COMPLETA'>;
/** The base's path: the survey of the existing machine room (RoomDesign) or the whole shaft (LiftDesign). */
export type RtPath = 'locale' | 'vano';

/** Why a section is in the RT: a part replaced or changed, a case of a change of speed, load or travel (by the
 *  documents), the path (the machine room's survey is always described on the room path), or the engineer's choice. */
export interface Motivo {
  tipo: 'parte' | 'caso' | 'percorso' | 'manuale';
  chiave: Parte | CasoVariazione | 'locale' | 'manuale';
  /** the clauses with the standard («UNI 10411-1:2024, 6.2 e 22 b)»); added by hand: '' */
  clausola: string;
  /** in words: the part or the case («quadro di manovra»); added by hand, the engineer's reason */
  testo: string;
}

export interface SezioneRt {
  key: SezioneKey;
  /** brought in by the rule (a part, a case or the path): it cannot be taken out */
  automatica: boolean;
  motivi: readonly Motivo[];
  /** added by the engineer (only a section the rule does not bring; its reason is the 'manuale' motive) */
  manuale?: true;
}

/** The checks the RT computes itself (componenti/*.ts, registry entries in norme-voci.ts). */
export const RT_NEW_CHECK_IDS = ['rt_ctrl_voltage', 'rt_lock_voltage', 'rt_area_kept', 'rt_cw_run', 'rt_buf_spring', 'rt_buf_mass', 'rt_buf_speed', 'rt_gov_trip',
  'rt_gov_origin', 'rt_gov_force', 'rt_gov_rope_sf', 'rt_door_fire', 'rt_door_height'] as const;
export type RtNewCheckId = (typeof RT_NEW_CHECK_IDS)[number];
/** A check printed by the RT: one of the calculation's, of the shaft's (the design's or the room's) or the RT's own. */
export type RtCheckId = ShaftCheckId | CheckId | RtNewCheckId;
export type RtUnit = ShaftCheck['unit'] | 'V' | 'N' | 'kg' | 'm';

export interface RtCheck {
  id: RtCheckId;
  status: CheckStatus;
  value: number | null;
  /** the limit: a maximum when `upper`, else a minimum; a window's upper end, `limitMin` its lower one */
  limit: number | null;
  limitMin?: number | null;
  upper: boolean;
  /** decimals shown */
  dec: number;
  unit: RtUnit;
  sezione: SezioneKey;
  /** the clause the row cites («Riferimento»), with its standard */
  ref: string;
  /** a requirement of this modification, or a part that stays as it is («Esistente (fuori dall’ambito)», not counted) */
  ambito: 'richiesta' | 'esistente';
  /** which case of the check, when it has more than one (e.g. 'cabina' / 'contrappeso', 'vuota' / 'carica') */
  caso?: string;
  /** the data the check misses — never a silent zero: status 'warn', «Dati mancanti ⚠» and a point on site */
  mancanti?: readonly string[];
  /** computed with options of the RT that differ from the drawing set's sheet 1 (Rm, A5, suspension, profile) */
  nota?: string;
}

/** A record the RT is made from, as it was at issue. */
export interface RecordRef {
  id: string;
  sha256: string;
  engineVersion: string;
  /** ISO 8601 */
  createdAt: string;
}

/** The base both paths fill (src/server/rt/base.ts): the calculation reproduced and its room survey or lift design. */
export interface RtBase {
  path: RtPath;
  tipo: RtTipo;
  norma: Norma10411;
  /** the calculation's test as stored (storedCollaudo) on the room path, the lift design's on the shaft path */
  collaudo: Collaudo;
  values: FormValues;
  analysis: Analysis;
  room?: { survey: Survey; derived: RoomDerived; checks: readonly ShaftCheck[] };
  lift?: { layout: Layout; dv: LiftDerived; checks: readonly ShaftCheck[]; underPit: boolean };
  records: { calc: RecordRef; room?: RecordRef; lift?: RecordRef; shaft?: RecordRef };
}

/** A file of the RT in its order, as it was at issue (the title and the component as the RT names them). */
export interface RtAllegato {
  /** 1..40: «Allegato n» */
  position: number;
  attachmentId: string;
  kind: AllegatoKind;
  title: string;
  component: Componente | null;
  sha256: string;
  pages: number;
  mime: 'application/pdf' | 'image/jpeg' | 'image/png';
}

/** An expected document and whether the RT has it. */
export interface DocumentoRt {
  id: DocumentoId;
  titolo: string;
  kind: AllegatoKind;
  componente: Componente;
  clausola: string;
  /** recommended, not asked by the rule (the logbook's copy) */
  consigliato: boolean;
  /** attached («Allegato n»), delivered separately (the engineer's choice), or still to attach («da allegare ⚠») */
  stato: 'allegato' | 'separato' | 'da_allegare';
  /** the file that is the document: matched by kind and component, or chosen by the engineer (`scelto`) */
  allegato?: { attachmentId: string; position: number; scelto: boolean };
}

/** The regime the lift was approved under, as the RT prints it. */
export interface RegimeRt {
  legge: RegimeKey | null;
  /** chosen in the installation's registry, or derived from the year of installation (a guess: to confirm) */
  origine: 'scelta' | 'anno' | null;
  /** confirmed on the logbook */
  confermata: boolean;
  /** allowed on the base's part of UNI 10411 (the CE marking of the calculation) */
  coerente: boolean;
  /** what the issue needs: a regime chosen, or derived and confirmed, and coherent */
  emettibile: boolean;
}

/** The building's structures (UNI 10411-1:2024, 5; documenti.ts struttureRt). */
export interface StruttureRt {
  /** the owner's declaration required; the engineer's statement that forces do not increase (or prospetto 2 not
   *  pertinent); point 5 not applied (-11 within 10 %, 6.2); the engineer's answer missing; no case calls point 5 */
  esito: 'documento' | 'dichiarazione' | 'non_applicato' | 'manca_risposta' | 'non_richiamato';
  /** the owner's suitability declaration is among the expected documents */
  documento: boolean;
  /** the answers the rule asks of the engineer (inputs.strutture) */
  domande: readonly ('forze' | 'pertinente')[];
  motivi: readonly Motivo[];
}

/** A rule of the standard applied to the documented and the design's data (section «Regole della norma»). */
export interface RegolaRt {
  regola: 'carico' | 'velocita' | 'corsa' | 'marcatura';
  valori: readonly { grandezza: string; prima: number | null; dopo: number | null; unit: string; dec: number }[];
  /** the cases it brings (none: not triggered, or its data missing) */
  casi: readonly CasoVariazione[];
  esito: 'scatta' | 'non_scatta' | 'dati_mancanti';
  clausola: string;
}

export type GrandezzaRt = 'Q' | 'persone' | 'fermate' | 'corsa' | 'velocita' | 'velocita50' | 'superficie' | 'P' | 'Mcw' | 'Tstar';

/** A row of «Dati tecnici prima e dopo la modifica». */
export interface RigaPrimaDopo {
  grandezza: GrandezzaRt;
  /** documented (logbook, verbale, registry) and the design's; null: not documented / not known */
  prima: number | null;
  dopo: number | null;
  unit: string;
  dec: number;
  variazione: 'invariato' | 'aumento' | 'diminuzione' | 'non_documentato';
  /** where «prima» comes from (libretto, verbale, rilievo, dichiarazione, calcolo) */
  fonte: string;
}

/** A datum of a component as the RT prints it («Dati del componente»). */
export interface DatoComponente {
  /** the datum's key (the document names it: messages/rt/doc.json) */
  voce: string;
  valore: number | string | null;
  unit: string;
  dec: number;
  stato: 'nuovo' | 'esistente';
  /** the calculation, the design, a catalogue (D/E/R/P) or the engineer's source (Fonte) */
  fonte: string;
  /** «Allegato n» of the source, when a file */
  allegato?: number;
}

export interface ComponenteRt {
  sezione: SezioneKey;
  stato: 'nuovo' | 'esistente' | 'misto';
  dati: readonly DatoComponente[];
}

/** A point of a section: an obligation of the standard («Obblighi della norma») or a point to verify on site. */
export interface PuntoRt {
  sezione: SezioneKey | 'adeguamenti';
  tipo: 'obbligo' | 'sito';
  punto: PuntoInSito;
}

/** A datum the RT misses: blocking (identity, signatures, regime) refuses the issue; the others are listed in the
 *  issue's confirmation and print «Dati mancanti ⚠». */
export interface MancanteRt {
  dove: 'anagrafica' | 'firme' | 'doc' | 'regime' | 'strutture' | SezioneKey;
  campo: string;
  bloccante: boolean;
}

export type RtVerdict = 'OK' | 'WARN' | 'FAIL';

/** What an issued RT keeps of its derivation (JSON, inside the hash): everything the document prints. */
export interface RtResults {
  engineVersion: string;
  path: RtPath;
  tipo: RtTipo;
  norma: Norma10411;
  regime: RegimeRt;
  regole: readonly RegolaRt[];
  sezioni: readonly SezioneRt[];
  componenti: readonly ComponenteRt[];
  checks: readonly RtCheck[];
  punti: readonly PuntoRt[];
  strutture: StruttureRt;
  documenti: readonly DocumentoRt[];
  primaDopo: readonly RigaPrimaDopo[];
  mancanti: readonly MancanteRt[];
  verdict: RtVerdict;
  failCount: number;
  warnCount: number;
}

/** What the RT engine derives (derive.ts): the results with the base they were made from. */
export interface RtDerived extends RtResults {
  base: RtBase;
}
