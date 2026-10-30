// The remedies of a check that does not pass (round 54): one value of the design changed — a number, an entry of a
// list, a distance set by hand given back to the software — found by trying it on the whole design, never guessed. The
// shapes shared by the search (cerca.ts) and the screens that hold a design (the Progetto, «Calcolo argano», the survey of
// the machine room), whatever their inputs `I`.

/** A check the acceptance test counts against the design. */
export type Stato = 'fail' | 'warn';

/** What a design gives: the checks the test counts against it, and how far each check is from its limit (in the
 *  check's unit, positive inside the limit; null: no number to measure). */
export interface Esito {
  problemi: ReadonlyMap<string, Stato>;
  margini: ReadonlyMap<string, number | null>;
}

/** How much a remedy asks, cheapest first: a distance set by hand given back, a size or a part of the lift, the
 *  building itself (the shaft, the pit, the headroom, the machine room: masonry). */
export type Costo = 'disegno' | 'componente' | 'edile';
export const COSTI: readonly Costo[] = ['disegno', 'componente', 'edile'];

interface LevaBase {
  /** the input it changes, as the screen names it (an edit's key on the Progetto) */
  key: string;
  costo: Costo;
}

/** A number of the inputs: its value now, the way that helps (1 up, -1 down, 0 either), the smallest change worth
 *  proposing [unit of the input]; `set` gives the inputs with it, or null where the screen would refuse the value. */
export interface LevaNum<I> extends LevaBase {
  tipo: 'num';
  da: number;
  dir: 1 | -1 | 0;
  passo: number;
  /** the farthest the search goes from `da` either way */
  min: number;
  max: number;
  set(I: I, x: number): I | null;
}

/** An entry of a list (a rail's profile, the type of the refuge spaces): every other entry is tried. */
export interface LevaScelta<I> extends LevaBase {
  tipo: 'scelta';
  da: string;
  opzioni: readonly { id: string; label: string }[];
  set(I: I, id: string): I | null;
}

/** A distance of the plan set by hand, given back to the software. */
export interface LevaTogli<I> extends LevaBase {
  tipo: 'togli';
  da: number;
  set(I: I): I | null;
}

export type Leva<I> = LevaNum<I> | LevaScelta<I> | LevaTogli<I>;

/** A remedy: the value changed (`a`: the new number, the entry's id, null for a distance given back), the inputs that
 *  give it, the other checks it puts right too and those that stop passing with it (or pass only with «Attenzione»). */
export interface Rimedio<I> {
  key: string;
  tipo: Leva<I>['tipo'];
  costo: Costo;
  da: number | string;
  a: number | string | null;
  /** the entries' names for a list: the new one and the one now */
  label?: string;
  labelDa?: string;
  inputs: I;
  risolti: string[];
  nuovi: { id: string; stato: Stato }[];
}

/** Where a check is put right: on the screen holding the design, in «Calcolo argano» (the machine, its ropes), in the
 *  installation's data, in the building. */
export type Dove = 'qui' | 'calcolo' | 'impianto' | 'edificio';

/** How the search asks for the design again: the inputs worked out (null: they cannot be — data missing, refused). */
export type Valuta<I> = (I: I) => Esito | null;
