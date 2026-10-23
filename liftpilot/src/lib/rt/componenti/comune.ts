// What every component section of the relazione tecnica di modifica shares (RT plan §4.5): the context the checks read
// (the base, the inputs, the plant data, the sections and the cases), the RT's check row (rtCheck mirrors check() of
// src/shaft/checks.ts with the RT's ids, its section, its clause and whether it is a requirement of this modification),
// a check whose data are missing — never a silent zero: «Dati mancanti ⚠» with the fields, status warn —, the rows of
// the calculation's and of the shaft's checks with their clauses (report/refs.ts) and their scope (collaudo.ts
// ambitoOf), the sources of the component data. Pure.
import { VOCI } from '@/calc/norme';
import { isCalcCheckId } from '@/lib/verdict-checks';
import type { Check, CheckId, CheckStatus } from '@/calc/types';
import { isUpperLimit } from '@/shaft/checks';
import { VOCI_VANO } from '@/shaft/norme';
import type { ShaftCheck, ShaftCheckId } from '@/shaft/types';
import type { BufferType } from '@/shaft/vertical';
import { ambitoOf, type Parte } from '../../lift/collaudo';
import type { Carichi, Norma10411 } from '../../lift/modifica';
import type { CasoVariazione } from '../../lift/obblighi-variazioni';
import type { Plant } from '../../plant';
import type { Analysis } from '../../present/analysis';
import { checkRefs } from '../../report/refs';
import type { Anagrafica } from '../anagrafica';
import type { Fonte } from '../fonte';
import type { RtInputs } from '../input';
import { VOCI_RT } from '../norme-voci';
import { RT_NEW_CHECK_IDS, type DatoComponente, type MancanteRt, type RtAllegato, type RtBase, type RtCheck, type RtCheckId, type RtNewCheckId, type RtUnit,
  type SezioneKey } from '../types';

/** What the component checks read. */
export interface RtCtx {
  base: RtBase;
  inputs: RtInputs;
  plant: Plant;
  anagrafica: Anagrafica;
  allegati: readonly RtAllegato[];
  /** the sections in the RT */
  sezioni: readonly SezioneKey[];
  norma: Norma10411;
  /** the parts replaced or changed and the cases of the changes (sezioni.ts casiOf) */
  parti: readonly Parte[];
  casi: readonly CasoVariazione[];
  /** the calculation's inputs (the design's on the shaft path), its counterweight and its loads (null: not all entered) */
  I: Analysis['ctx']['I'];
  Mcw: number;
  carichi: Carichi | null;
}

export const nuova = (x: Pick<RtCtx, 'parti'>, p: Parte): boolean => x.parti.includes(p);
export const caso = (x: Pick<RtCtx, 'casi'>, c: CasoVariazione): boolean => x.casi.includes(c);

/** A requirement of this modification, or a part that stays as it is. */
export type Ambito = RtCheck['ambito'];
export const ambito = (richiesta: boolean): Ambito => (richiesta ? 'richiesta' : 'esistente');

const isRtNew = (id: string): id is RtNewCheckId => RT_NEW_CHECK_IDS.some((x) => x === id);
/** The calculation's checks whose limit is a minimum (src/lib/present/texts.ts AT_LEAST: the same set). */
const CALC_AT_LEAST: ReadonlySet<string> = new Set(['tr_stall', 'r_dd', 'r_ddp', 'r_nd', 'r_sfa', 'b_sets']);
const SOFTWARE = 'modello di calcolo del software';

/** What a check row's clauses read: the part of UNI 10411, the base and, when there, the plant data (the lift's use). */
export type RefCtx = Pick<RtCtx, 'norma' | 'base'> & { plant?: Pick<Plant, 'liftUse'> };

/** The rails' fallback by rated load (UNI EN 81-1:2008, G.2.5) cited by the shaft's registry for when the plant data do not
 *  say the lift's use: with the use given the load at the landing is UNI EN 81-20's by use, the old clause is not cited. */
export const SENZA_USO = '; UNI EN 81-1:2008, G.2.5 (l’uso non indicato)';
const VOCI_VANO_USO = VOCI_VANO.map((v) => (v.riferimento.includes(SENZA_USO) ? { ...v, riferimento: v.riferimento.replace(SENZA_USO, '') } : v));

/** The clauses a check row cites («Riferimento»): the RT's registry for its own checks, the shaft's (with the buffer types
 *  of the check; with the lift's use given, without the fallback by load) and the calculation's for theirs, only of the
 *  base's part of UNI 10411. */
export function refOf(x: RefCtx, id: RtCheckId, ammortizzatori?: readonly BufferType[]): string {
  if (isRtNew(id)) return checkRefs(VOCI_RT, id, { norma: x.norma }, Infinity) || SOFTWARE;
  const { I, N } = x.base.analysis.ctx;
  if (isCalcCheckId(id)) {
    return checkRefs(VOCI, id, { norma: x.norma, groove: N.groove.type, std: I.std, corsaRidotta: I.buffers }) || SOFTWARE;
  }
  return checkRefs(x.plant?.liftUse ? VOCI_VANO_USO : VOCI_VANO, id, { norma: x.norma, ammortizzatori }, Infinity) || SOFTWARE;
}

export interface OpzCheck {
  sezione: SezioneKey;
  ambito: Ambito;
  /** a maximum (else a minimum) */
  upper: boolean;
  limitMin?: number | null;
  caso?: string;
  nota?: string;
  /** a missed limit is a warning, not a failure (a reading of the software, an attention) */
  soft?: boolean;
  ammortizzatori?: readonly BufferType[];
}

/** An RT check met or not (`ok`), with its value and limit. */
export function rtCheck(x: RefCtx, id: RtCheckId, ok: boolean, value: number | null, limit: number | null, dec: number, unit: RtUnit, o: OpzCheck): RtCheck {
  const status: CheckStatus = ok ? 'ok' : o.soft ? 'warn' : 'fail';
  return {
    id, status, value, limit, upper: o.upper, dec, unit, sezione: o.sezione, ref: refOf(x, id, o.ammortizzatori), ambito: o.ambito,
    ...(o.limitMin !== undefined ? { limitMin: o.limitMin } : {}), ...(o.caso ? { caso: o.caso } : {}), ...(o.nota ? { nota: o.nota } : {}),
  };
}

/** An RT check whose data are missing: a warning with the fields («Dati mancanti ⚠»), the limit when it is known. */
export function mancante(x: RefCtx, id: RtCheckId, campi: readonly string[], limit: number | null, dec: number, unit: RtUnit, o: OpzCheck): RtCheck {
  return { ...rtCheck(x, id, false, null, limit, dec, unit, { ...o, soft: true }), mancanti: campi };
}

/** A check of the shaft's engines (the design's, the room's, the sling's, D.1) as the RT prints it, its scope by the
 *  base's test. */
export function daVano(x: RefCtx, c: ShaftCheck, sezione: SezioneKey, ammortizzatori?: readonly BufferType[]): RtCheck {
  return {
    id: c.id, status: c.status, value: c.value, limit: c.limit, upper: isUpperLimit(c.id), dec: c.dec, unit: c.unit, sezione,
    ref: refOf(x, c.id, ammortizzatori), ambito: ambito(ambitoOf(x.base.collaudo, c.id) === 'applies'),
  };
}

/** A check of the calculation (machine, ropes, traction) as the RT prints it: its unit is the calculation's document's
 *  (src/lib/present/texts.ts), so none here. */
export function daCalcolo(x: RefCtx, c: Check, sezione: SezioneKey): RtCheck {
  return {
    id: c.id, status: c.status, value: c.value, limit: c.limit, upper: !CALC_AT_LEAST.has(c.id), dec: c.dec, unit: '', sezione, ref: refOf(x, c.id),
    ambito: ambito(ambitoOf(x.base.collaudo, c.id) === 'applies'),
  };
}

/** The checks of `list` whose ids are among `ids`, in the list's order. */
export const conId = <T extends { id: string }>(list: readonly T[], ids: readonly (ShaftCheckId | CheckId)[]): T[] => list.filter((c) => ids.some((i) => i === c.id));

/** Where a datum comes from, as the RT prints it: the software's sources by their key ('calcolo', 'progetto', 'rilievo',
 *  'impianto' — the plant data —, 'anagrafica', 'catalogo'), the engineer's as «<tipo>: <riferimento>» (the builder names
 *  the kind), with the file it is in when it is one of the RT's. */
export function fonteDi(f: Fonte | undefined, allegati: readonly RtAllegato[]): { fonte: string; allegato?: number } {
  if (!f) return { fonte: '' };
  const a = f.attachmentId ? allegati.find((x) => x.attachmentId === f.attachmentId) : undefined;
  return { fonte: `${f.tipo}: ${f.rif}`, ...(a ? { allegato: a.position } : {}) };
}

/** A datum of a component. */
export function dato(voce: string, valore: number | string | null | undefined, unit: string, dec: number, stato: DatoComponente['stato'],
  src: { fonte: string; allegato?: number } | string): DatoComponente {
  const s = typeof src === 'string' ? { fonte: src } : src;
  return { voce, valore: valore ?? null, unit, dec, stato, fonte: s.fonte, ...(s.allegato !== undefined ? { allegato: s.allegato } : {}) };
}

/** The data a section misses (non-blocking: the issue's confirmation lists them), from its checks and its own. */
export const mancantiDi = (sezione: SezioneKey, checks: readonly RtCheck[], altri: readonly string[] = []): MancanteRt[] =>
  [...new Set([...checks.flatMap((c) => c.mancanti ?? []), ...altri])].map((campo) => ({ dove: sezione, campo, bloccante: false }));
