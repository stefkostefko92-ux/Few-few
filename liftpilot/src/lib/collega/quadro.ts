// The panel order of a survey sheet (round 57): the supplier's module of the sheet's panel make (and model) — Pelazza,
// MoviLift, Mastech NG120 or QI Touch, as the sheet's own module route serves it (src/lib/collega/moduli.ts) — read for
// what the installation would otherwise ask again: the speed, the travel, the stops, the existing controller's speed
// regulation and, where the module draws the shaft (MoviLift, QI Touch), its size, pit and headroom. Each module writes
// its own units: MoviLift the pit and headroom in metres («mt»), QI Touch the travel in millimetres and its shaft
// drawing's measures without a unit (a value under 20 is read in metres). A line is read only when it holds one plain
// number, within the range a lift has; anything else seeds nothing. Pure.
import type { Scheda } from '@prisma/client';
import type { Regolazione } from '@/lib/lift/modifica';
import { sceltoNellaScheda, SLOTS, type Prefisso } from '@/lib/rilievi/ordini/registry';
import { storedValori, type Valori } from '@/lib/rilievi/ordini/valori';
import { unNumero } from './numero';

/** The columns the panel order is read from. */
export const QUADRO_SELECT = { quadroOrdine: true, quadroMarca: true, quadroModello: true, ordineQuadro: true } as const;
export type QuadroRow = Pick<Scheda, keyof typeof QUADRO_SELECT>;

/** What the panel order says of the lift (each null when not written as one plain number in range). */
export interface QuadroDati {
  /** the rated speed [m/s] */
  velocita: number | null;
  /** the travel [m] */
  corsa: number | null;
  fermate: number | null;
  /** the existing controller's speed regulation (one tick of the module's) */
  regolazione: Regolazione | null;
  /** the shaft's inner width and depth, the pit and the headroom [mm] */
  vanoW: number | null;
  vanoD: number | null;
  fossa: number | null;
  testata: number | null;
}

type Campi = { velocita: string; corsa: string; corsaMm?: boolean; fermate: string; regolazione?: Readonly<Record<string, Regolazione>>;
  vanoW?: readonly string[]; vanoD?: readonly string[]; fossa?: string; testata?: string };

/** Each panel module's fields (assets/moduli/*.json), by the slot's prefix. */
const CAMPI: Partial<Record<Prefisso, Campi>> = {
  oq: { velocita: 'velocita', corsa: 'corsa', fermate: 'nFermate', regolazione: { tq1Velocita: '1v', tq2Velocita: '2v', tqVvvfAperto: 'vvvf', tqVvvfChiuso: 'vvvf' } },
  om: { velocita: 'velocita', corsa: 'corsa', fermate: 'fermate', fossa: 'fossa', testata: 'testata' },
  mn: { velocita: 'velocita', corsa: 'corsa', fermate: 'nFermate', regolazione: { velocita1: '1v', velocita2: '2v', vvvf: 'vvvf' } },
  mq: { velocita: 'velocita', corsa: 'corsa', corsaMm: true, fermate: 'numeroFermate', vanoW: ['p1Larghezza', 'p2Larghezza'], vanoD: ['p1Profondita', 'p2Profondita'],
    fossa: 's1Fossa', testata: 's2Testata' },
};

const entro = (x: number | null, lo: number, hi: number): number | null => (x !== null && x >= lo && x <= hi ? x : null);
/** A measure in millimetres: a value under 20 written in metres. */
const mm = (x: number | null): number | null => (x === null ? null : Math.round(x < 20 ? x * 1000 : x));

/** One tick among the regulation's: the one ticked (none or two that disagree: not known). */
export function regolazioneDi(v: Valori | null, voci: Readonly<Record<string, Regolazione>> | undefined): Regolazione | null {
  if (!v || !voci) return null;
  const scelte = new Set(Object.entries(voci).filter(([k]) => v[k] === true).map(([, r]) => r));
  return scelte.size === 1 ? [...scelte][0] ?? null : null;
}

/** The panel order of the sheet, when its question is «Sì», the module is the sheet's make's (and model's) and stored. */
export function quadroDi(s: QuadroRow): QuadroDati | null {
  const slot = s.quadroOrdine === true ? SLOTS.find((x) => x.column === 'ordineQuadro' && sceltoNellaScheda(x, (k) => s[k as keyof QuadroRow])) : undefined;
  const c = slot ? CAMPI[slot.prefix] : undefined, v = slot ? storedValori(slot.modulo, s.ordineQuadro) : null;
  if (!c || !v) return null;
  const primo = (keys: readonly string[] | undefined): number | null => (keys ?? []).map((k) => unNumero(v[k])).find((n) => n !== null) ?? null;
  const corsa = unNumero(v[c.corsa]);
  return {
    velocita: entro(unNumero(v[c.velocita]), 0.1, 10),
    corsa: entro(corsa === null ? null : c.corsaMm || corsa > 300 ? corsa / 1000 : corsa, 0.5, 300),
    fermate: entro(unNumero(v[c.fermate]), 2, 60),
    regolazione: regolazioneDi(v, c.regolazione),
    vanoW: entro(mm(primo(c.vanoW)), 500, 10000), vanoD: entro(mm(primo(c.vanoD)), 500, 10000),
    fossa: entro(mm(c.fossa ? unNumero(v[c.fossa]) : null), 100, 6000), testata: entro(mm(c.testata ? unNumero(v[c.testata]) : null), 1500, 15000),
  };
}
