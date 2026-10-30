// The measured data of a survey sheet as an installation reads them (round 44: a survey linked to an installation): the
// sheet's own fields and, when «Argano da sostituire?» is «Sì» and the argano data sheet is stored (supplier module
// 'dati-argano', src/lib/rilievi/ordini/registry.ts), what that sheet says of the existing machine. The sheet comes first;
// the module fills only what the sheet leaves empty (the two are kept equal by the linked data, ordini/collegamenti-elenco.ts).
// A module line is read only when it holds one plain number (the Italian way: «1.000» is a thousand, «7,5 kW» is 7,5);
// anything else stays text for the comparison and seeds nothing. Pure.
import type { Prisma, Scheda } from '@prisma/client';
import { ARGANI } from '@/lib/rilievi/ordini/moduli';
import { numeriDi } from '@/lib/rilievi/ordini/numeri';
import { storedValori, type Valori } from '@/lib/rilievi/ordini/valori';

export type Posizione = 'ALTO' | 'BASSO';
export type TipoImpianto = 'ELETTRICO' | 'IDRAULICO' | 'GEARLESS';

/** The existing machine as its data sheet describes it (each null when not written as one plain number). */
export interface ArganoDati {
  /** «Peso cabina (KG)» — the complete car [kg] */
  pesoCabina: number | null;
  /** «Velocità (m/s)» */
  velocita: number | null;
  /** «Corsa Mt» — the travel [m] */
  corsa: number | null;
  /** «Taglia 1:1 / 1:2» — the roping (one of the two ticked) */
  taglia: 1 | 2 | null;
  /** «D puleggia di trazione» [mm] */
  puleggia: number | null;
  /** «Cuneo - gradi» — the groove's angle [°] */
  cuneo: number | null;
  /** «Rap/rid argano» — «53», «1:53», «1/53» or «53:1» are 53 */
  rapporto: number | null;
  /** «Potenza motore (Kw)» */
  potenzaKw: number | null;
  /** «Giri/min» */
  giri: number | null;
  /** «Poli» — of the fast winding: «4» or «4/16» are 4 */
  poli: 2 | 4 | 6 | 8 | null;
  /** «Puleggia di rinvio» as written: «no», a diameter, «sì»… (text) */
  rinvio: string | null;
  /** the diameter of the diverting pulley when the line holds one number [mm] */
  rinvioD: number | null;
}

export interface RilievoDati {
  id: string;
  /** the day of the survey and when the sheet was created: the newest by both is the installation's reference */
  data: Date;
  createdAt: Date;
  /** the last change of the sheet: a calculation older than it may not have read it («da aggiornare») */
  updatedAt: Date;
  indirizzo: string | null;
  matricola: string | null;
  numeroImpianto: string | null;
  marca: string | null;
  portataKg: number | null;
  persone: number | null;
  fermate: number | null;
  /** exactly one of the two ticks; none or both — not known */
  posizione: Posizione | null;
  tipo: readonly TipoImpianto[];
  funiNumero: number | null;
  funiDiametroMm: number | null;
  funicellaDiametroMm: number | null;
  limitatoreTipo: string | null;
  operatoreMarca: string | null;
  lucePorte: string | null;
  argano: ArganoDati | null;
}

/** The columns of a sheet the installation reads. `operatoreMarca` and `lucePorte` are no longer asked by the sheet (rilievi
 *  988f3cf37, round 49): only older surveys fill them, and the comparison shows them as they are (confronto.ts). */
export const RILIEVO_SELECT = {
  id: true, data: true, createdAt: true, updatedAt: true, indirizzo: true, matricola: true, numeroImpianto: true, marca: true, portataKg: true, capienzaPersone: true,
  fermate: true, ubicazioneMacchina: true, tipoImpianto: true, funiNumero: true, funiDiametroMm: true, funicellaDiametroMm: true,
  limitatoreTipo: true, operatoreMarca: true, lucePorte: true, arganoPreventivo: true, preventivoArgano: true,
} as const satisfies Prisma.SchedaSelect;

export type RilievoRow = Pick<Scheda, keyof typeof RILIEVO_SELECT>;

/** A Decimal of the database (or a plain number) as a number. */
const dec = (x: Prisma.Decimal | number | null): number | null => {
  if (x === null) return null;
  const n = Number(typeof x === 'number' ? x : x.toString());
  return Number.isFinite(n) ? n : null;
};
const text = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

/** One plain number in a line of the module, or null. */
export function unNumero(line: string | true | undefined): number | null {
  if (typeof line !== 'string') return null;
  const n = numeriDi(line);
  return n.length === 1 && n[0] !== undefined && n[0] > 0 ? n[0] : null;
}

/** The reduction ratio as the machine's i: «53», «1:53», «1/53», «53:1». */
export function rapportoDi(line: string | true | undefined): number | null {
  if (typeof line !== 'string') return null;
  const n = numeriDi(line);
  if (n.length === 1) return n[0] !== undefined && n[0] > 1 ? n[0] : null;
  if (n.length !== 2 || n[0] === undefined || n[1] === undefined) return null;
  if (n[0] === 1 && n[1] > 1) return n[1];
  if (n[1] === 1 && n[0] > 1) return n[0];
  return null;
}

/** The poles of the fast winding: the smaller of «4/16»; only 2, 4, 6 or 8 (the calculator's choices). */
export function poliDi(line: string | true | undefined): 2 | 4 | 6 | 8 | null {
  if (typeof line !== 'string') return null;
  const n = numeriDi(line).filter((x) => Number.isInteger(x));
  if (n.length === 0 || n.length > 2) return null;
  const p = Math.min(...n);
  return p === 2 || p === 4 || p === 6 || p === 8 ? p : null;
}

/** A metric horsepower (CV) [kW]: the sheet's power in CV stands in for the kW when those are not written. */
const KW_PER_CV = 0.73549875;
const kwDaCv = (cv: number | null): number | null => (cv === null ? null : Math.round(cv * KW_PER_CV * 100) / 100);

/** The argano data sheet's values, when the module is open and stored (its PDF exists). */
export function arganoDi(v: Valori | null): ArganoDati | null {
  if (!v) return null;
  const taglia = v.taglia11 === true && v.taglia12 !== true ? 1 : v.taglia12 === true && v.taglia11 !== true ? 2 : null;
  const rinvio = typeof v.pulegginaRinvio === 'string' ? text(v.pulegginaRinvio) : null;
  return {
    pesoCabina: unNumero(v.pesoCabina), velocita: unNumero(v.velocita), corsa: unNumero(v.corsa), taglia, puleggia: unNumero(v.diametroPuleggia),
    cuneo: unNumero(v.cuneo), rapporto: rapportoDi(v.rapportoRiduzione), potenzaKw: unNumero(v.potenzaKw) ?? kwDaCv(unNumero(v.potenzaCv)), giri: unNumero(v.giri), poli: poliDi(v.poli),
    rinvio, rinvioD: rinvio ? unNumero(rinvio) : null,
  };
}

const TIPI: readonly TipoImpianto[] = ['ELETTRICO', 'IDRAULICO', 'GEARLESS'];

/** The survey's data: the sheet first, the argano sheet where the sheet is empty. */
export function rilievoDati(s: RilievoRow): RilievoDati {
  const valori = s.arganoPreventivo === true ? storedValori(ARGANI, s.preventivoArgano) : null;
  const argano = arganoDi(valori), pa = (k: string): string | true | undefined => valori?.[k];
  const pos = s.ubicazioneMacchina.length === 1 ? (s.ubicazioneMacchina[0] ?? null) : null;
  return {
    id: s.id, data: s.data, createdAt: s.createdAt, updatedAt: s.updatedAt,
    indirizzo: text(s.indirizzo) ?? (typeof pa('indirizzo') === 'string' ? text(pa('indirizzo') as string) : null),
    matricola: text(s.matricola), numeroImpianto: text(s.numeroImpianto), marca: text(s.marca),
    portataKg: s.portataKg ?? unNumero(pa('portata')), persone: s.capienzaPersone ?? unNumero(pa('persone')), fermate: s.fermate ?? unNumero(pa('piani')),
    posizione: pos, tipo: TIPI.filter((x) => s.tipoImpianto.includes(x)),
    funiNumero: s.funiNumero ?? unNumero(pa('funiN')), funiDiametroMm: dec(s.funiDiametroMm) ?? unNumero(pa('funiDiametro')),
    funicellaDiametroMm: dec(s.funicellaDiametroMm), limitatoreTipo: text(s.limitatoreTipo), operatoreMarca: text(s.operatoreMarca), lucePorte: text(s.lucePorte),
    argano,
  };
}

/** The newest survey: by its day, then by when it was created (the installation's reference). */
export const newestFirst = (a: Pick<RilievoDati, 'data' | 'createdAt'>, b: Pick<RilievoDati, 'data' | 'createdAt'>): number =>
  b.data.getTime() - a.data.getTime() || b.createdAt.getTime() - a.createdAt.getTime();

/** Outside what LiftPilot calculates (electric lifts with a geared machine): a hydraulic lift or a gearless one (MRL). */
export const fuoriAmbito = (r: Pick<RilievoDati, 'tipo'>): TipoImpianto[] => r.tipo.filter((x) => x === 'IDRAULICO' || x === 'GEARLESS');
