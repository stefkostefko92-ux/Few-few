// The comparison of an installation (round 44, «Confronto»): its reference survey against its latest calculation and its
// latest design, parameter by parameter. Three classes: STATO DI FATTO — what exists on site (identity, stops, travel,
// the machine's place — with or without a diverting pulley when the argano sheet says it —, the roping, the ropes and
// the existing machine in a replacement): a difference is a probable error; MODIFICA PREVISTA — the rated load, the
// persons, the speed: a difference is expected (the acceptance test counts a changed load or speed as a modified part,
// src/lib/lift/collaudo.ts PARTI); SOLO CONFRONTO — free text and what the design picks (brands, the governor and its
// rope, the doors' opening), side by side without a verdict. A hydraulic or a gearless (MRL) lift is outside what
// LiftPilot calculates (electric lifts with a geared machine). Pure.
import { stessoCodice, stessoIndirizzo } from './testo';
import { fuoriAmbito, type RilievoDati } from './rilievo';
import { layoutDi, type Usa } from './prefill';

export type Classe = 'fatto' | 'modifica' | 'info';
/** ok — the same; diff — a probable error; mod — an expected modification; info — no verdict; na — nothing to compare
 *  with; fuori — outside what LiftPilot calculates */
export type Stato = 'ok' | 'diff' | 'mod' | 'info' | 'na' | 'fuori';
export type Layout = 'top' | 'topDefl' | 'bottom';

/** A saved record as the comparison reads it (null: not in the record). `repl`: a replacement — its ropes and machine in
 *  place are the existing ones. */
export interface Lato {
  id: string;
  createdAt: Date;
  repl: boolean;
  Q: number | null;
  persone: number | null;
  fermate: number | null;
  velocita: number | null;
  corsa: number | null;
  pesoCabina: number | null;
  layout: Layout | null;
  taglia: 1 | 2 | null;
  funiNumero: number | null;
  funiDiametro: number | null;
  puleggia: number | null;
  rapporto: number | null;
  potenza: number | null;
  giri: number | null;
  poli: number | null;
  /** the design's governor: its rope's diameter and its name */
  funicella: { d: number; nome: string } | null;
  porte: string | null;
  operatore: string | null;
}

export interface Impianto {
  /** street, municipality, province in one line (testo.ts indirizzoImpianto) */
  indirizzo: string | null;
  plantNumber: string | null;
}

export type Param = Usa | 'tipo' | 'matricola' | 'numero' | 'indirizzo' | 'persone' | 'marca' | 'operatore' | 'limitatore' | 'funicella' | 'porte';
export type Valore = number | string | null;

export interface Riga {
  param: Param;
  classe: Classe;
  rilievo: Valore;
  calcolo: Valore;
  progetto: Valore;
  stato: Stato;
  /** the older surveys of the installation that say otherwise (the identity): their day and value */
  storico?: { data: Date; valore: string }[];
  /** «usa il valore del rilievo»: which form takes it (the comparison offers it only on a difference) */
  usa: 'calc' | 'progetto' | 'impianto' | null;
}

export interface ConfrontoInput {
  rilievo: RilievoDati;
  /** the installation's other surveys (older than the reference) */
  storico: readonly RilievoDati[];
  impianto: Impianto;
  calcolo: Lato | null;
  progetto: Lato | null;
}

const sameNum = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
/** The survey's place against a record's layout: the layout itself when the argano sheet says whether there is a
 *  diverting pulley (prefill.ts layoutDi — top ≠ topDefl), else only above or below. */
const samePlace = (r: string, l: string): boolean => r === l || (r === 'BASSO' ? l === 'bottom' : r === 'ALTO' ? l === 'top' || l === 'topDefl' : false);

/** Equal for the parameter: numbers within rounding, the machine's place above/below, an address by its words, a code as written. */
function uguale(p: Param, a: Valore, b: Valore): boolean {
  if (typeof a === 'number' && typeof b === 'number') return sameNum(a, b);
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (p === 'posizione') return samePlace(a, b);
  if (p === 'indirizzo') return stessoIndirizzo(a, b);
  return stessoCodice(a, b);
}

/** The verdict of a row: the survey against each side that has a value; `conta(side)` — whether a side's value counts. */
function verdetto(p: Param, classe: Classe, r: Valore, sides: readonly { v: Valore; conta: boolean }[]): Stato {
  if (classe === 'info') return 'info';
  const others = sides.filter((s) => s.conta && s.v !== null);
  if (r === null || others.length === 0) return 'na';
  if (others.every((s) => uguale(p, r, s.v))) return 'ok';
  return classe === 'fatto' ? 'diff' : 'mod';
}

/** The parameters of a replacement's existing installation: compared only on the side that is a replacement. */
const IN_PLACE: ReadonlySet<Param> = new Set<Param>(['taglia', 'funiNumero', 'funiDiametro', 'pesoCabina', 'puleggia', 'rapporto', 'potenza', 'giri', 'poli']);
/** The form «usa il valore» opens for each parameter with an input, whatever the installation (round 45): «Calcolo
 *  argano» for what the calculation holds, the Progetto for the stops it draws. */
const IN_CALC: ReadonlySet<Param> = new Set<Param>(['Q', 'posizione', 'taglia', 'velocita', 'corsa', 'pesoCabina', 'funiNumero', 'funiDiametro', 'puleggia',
  'rapporto', 'potenza', 'giri', 'poli']);
const IN_PROGETTO: ReadonlySet<Param> = new Set<Param>(['fermate']);

export function confronto(x: ConfrontoInput): Riga[] {
  const { rilievo: r, impianto: imp, calcolo: C, progetto: P } = x, a = r.argano;
  const rows: Riga[] = [];
  const target = (p: Param): Riga['usa'] => (IN_CALC.has(p) ? 'calc' : IN_PROGETTO.has(p) ? 'progetto' : null);
  const row = (param: Param, classe: Classe, rv: Valore, cv: Valore, pv: Valore, usa: Riga['usa'] = target(param)): Riga => {
    // the identity's «progetto» is the installation's own data, there whatever its records
    const conta = (side: Lato | null): boolean => param === 'matricola' || param === 'indirizzo' || (!!side && (!IN_PLACE.has(param) || side.repl));
    const stato = verdetto(param, classe, rv, [{ v: cv, conta: conta(C) }, { v: pv, conta: conta(P) }]);
    return { param, classe, rilievo: rv, calcolo: cv, progetto: pv, stato, usa: stato === 'diff' || stato === 'mod' ? usa : null };
  };
  const side = <K extends keyof Lato>(L: Lato | null, k: K): Lato[K] | null => (L ? L[k] : null);

  // STATO DI FATTO — first what the lift is, then who it is, then what is on site
  const fuori = fuoriAmbito(r);
  rows.push({ param: 'tipo', classe: 'fatto', rilievo: r.tipo.length ? r.tipo.join(', ') : null, calcolo: null, progetto: null,
    stato: fuori.length ? 'fuori' : r.tipo.includes('ELETTRICO') ? 'ok' : 'na', usa: null });
  // the matricola is the installation's «Numero di matricola» (plantNumber) and the older surveys'; the lift's number of
  // the maintenance company is only on the surveys: the older ones say whether it changed
  const altri = x.storico.filter((o) => o.id !== r.id);
  const storico = (k: 'matricola' | 'numeroImpianto', base: Riga): Riga => {
    const v = r[k], older = v ? altri.filter((o) => o[k] && !stessoCodice(o[k], v)) : [];
    if (older.length) return { ...base, stato: 'diff', storico: older.map((o) => ({ data: o.data, valore: o[k] ?? '' })) };
    return base.stato === 'na' && v && altri.some((o) => o[k]) ? { ...base, stato: 'ok' } : base;
  };
  rows.push(storico('matricola', row('matricola', 'fatto', r.matricola, null, imp.plantNumber, 'impianto')));
  rows.push(storico('numeroImpianto', row('numero', 'fatto', r.numeroImpianto, null, null, null)));
  rows.push(row('indirizzo', 'fatto', r.indirizzo, null, imp.indirizzo, 'impianto'));
  rows.push(row('fermate', 'fatto', r.fermate, side(C, 'fermate'), side(P, 'fermate')));
  rows.push(row('corsa', 'fatto', a?.corsa ?? null, side(C, 'corsa'), side(P, 'corsa')));
  // the place as the calculator's layout when the argano sheet says it (with or without a diverting pulley), else ALTO/BASSO
  rows.push(row('posizione', 'fatto', r.posizione === 'ALTO' ? layoutDi(r) ?? r.posizione : r.posizione, side(C, 'layout'), side(P, 'layout')));
  rows.push(row('taglia', 'fatto', a?.taglia ?? null, side(C, 'taglia'), side(P, 'taglia')));
  rows.push(row('funiNumero', 'fatto', r.funiNumero, side(C, 'funiNumero'), side(P, 'funiNumero')));
  rows.push(row('funiDiametro', 'fatto', r.funiDiametroMm, side(C, 'funiDiametro'), side(P, 'funiDiametro')));
  rows.push(row('pesoCabina', 'fatto', a?.pesoCabina ?? null, side(C, 'pesoCabina'), side(P, 'pesoCabina')));
  rows.push(row('puleggia', 'fatto', a?.puleggia ?? null, side(C, 'puleggia'), side(P, 'puleggia')));
  rows.push(row('rapporto', 'fatto', a?.rapporto ?? null, side(C, 'rapporto'), side(P, 'rapporto')));
  rows.push(row('potenza', 'fatto', a?.potenzaKw ?? null, side(C, 'potenza'), side(P, 'potenza')));
  rows.push(row('giri', 'fatto', a?.giri ?? null, side(C, 'giri'), side(P, 'giri')));
  rows.push(row('poli', 'fatto', a?.poli ?? null, side(C, 'poli'), side(P, 'poli')));
  // MODIFICA PREVISTA
  rows.push(row('Q', 'modifica', r.portataKg, side(C, 'Q'), side(P, 'Q')));
  rows.push(row('persone', 'modifica', r.persone, null, side(P, 'persone'), null));
  rows.push(row('velocita', 'modifica', a?.velocita ?? null, side(C, 'velocita'), side(P, 'velocita')));
  // SOLO CONFRONTO
  const fun = side(P, 'funicella');
  rows.push(row('marca', 'info', r.marca, null, null, null));
  rows.push(row('operatore', 'info', r.operatoreMarca, null, side(P, 'operatore'), null));
  rows.push(row('porte', 'info', r.lucePorte, null, side(P, 'porte'), null));
  rows.push(row('limitatore', 'info', r.limitatoreTipo, null, fun?.nome ?? null, null));
  rows.push(row('funicella', 'info', r.funicellaDiametroMm, null, fun?.d ?? null, null));
  // a row with nothing on any side says nothing
  return rows.filter((w) => w.rilievo !== null || w.calcolo !== null || w.progetto !== null);
}

/** The identity rows: the installation's data (and the older surveys), not a record's. */
const IDENTITA: ReadonlySet<Param> = new Set<Param>(['tipo', 'matricola', 'numero', 'indirizzo']);

/** What the comparison finds: the probable errors, the expected modifications, a lift outside LiftPilot's scope, and how
 *  many technical rows (not the identity, which a new installation copies from the survey) really met a record's value —
 *  none: nothing was compared yet, whatever «coincide» the identity says. */
export function sintesi(rows: readonly Riga[]): { diff: number; mod: number; fuori: boolean; confrontati: number } {
  return { diff: rows.filter((w) => w.stato === 'diff').length, mod: rows.filter((w) => w.stato === 'mod').length, fuori: rows.some((w) => w.stato === 'fuori'),
    confrontati: rows.filter((w) => !IDENTITA.has(w.param) && (w.stato === 'ok' || w.stato === 'diff' || w.stato === 'mod')).length };
}

/** A record's own probable errors: the rows of the state on site where that record says otherwise than the survey. */
export const erroriDi = (rows: readonly Riga[], lato: 'calcolo' | 'progetto'): Riga[] =>
  rows.filter((w) => w.stato === 'diff' && !IDENTITA.has(w.param) && w[lato] !== null && !uguale(w.param, w.rilievo, w[lato]));
