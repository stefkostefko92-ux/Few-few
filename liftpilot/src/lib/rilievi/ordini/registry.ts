// Which supplier's module goes with which field of the sheet: the make it opens with (when the module is one make's), the
// database column (JSON), the "Sì/No" question, the prefix of its fields in the form and the last part of its PDF's
// address (`/api/rilievi/<id>/<path>`). The control panel has two modules in one column and under one question —
// Pelazza and MoviLift; the make is one, so at most one of them is open. The argano data sheet (for every kind of
// machine) and 2SG's sheet for the car operator and the suspensions have no make. Ported 1:1 from rilievi
// (src/ordini/registry.ts, commit ae6329cb6).
import { ARGANI, MOVILIFT, PELAZZA, SG, type Modulo } from './moduli';

/** The prefix in the form: `oq` — Pelazza's panel, `om` — MoviLift's panel, `pa` — the argano sheet, `sg` — 2SG's sheet. */
export type Prefisso = 'oq' | 'om' | 'pa' | 'sg';

export interface ModuloSlot {
  /** The make the module opens with; without one — with every make. */
  marca?: { field: 'quadroMarca'; value: string };
  column: 'ordineQuadro' | 'preventivoArgano' | 'ordineSospensioni';
  question: 'quadroOrdine' | 'arganoPreventivo' | 'sospensioni';
  prefix: Prefisso;
  path: 'ordine-quadro' | 'ordine-quadro-movilift' | 'dati-argano' | 'sospensioni-2sg';
  modulo: Modulo;
}

export const SLOTS: readonly ModuloSlot[] = [
  { marca: { field: 'quadroMarca', value: 'PELAZZA' }, column: 'ordineQuadro', question: 'quadroOrdine', prefix: 'oq', path: 'ordine-quadro', modulo: PELAZZA },
  { marca: { field: 'quadroMarca', value: 'MOVILIFT' }, column: 'ordineQuadro', question: 'quadroOrdine', prefix: 'om', path: 'ordine-quadro-movilift', modulo: MOVILIFT },
  { column: 'preventivoArgano', question: 'arganoPreventivo', prefix: 'pa', path: 'dati-argano', modulo: ARGANI },
  { column: 'ordineSospensioni', question: 'sospensioni', prefix: 'sg', path: 'sospensioni-2sg', modulo: SG },
];

/** The makes a column's question is asked with (fields.ts, `when`); empty — without a condition. */
export function marcheOf(question: ModuloSlot['question']): string[] {
  return SLOTS.flatMap((slot) => (slot.question === question && slot.marca ? [slot.marca.value] : []));
}

/**
 * The module is open: its question is shown (`active`, the fields with a condition), the answer is "Sì" and the make is
 * its own (when it has one). `valueOf` reads the form (strings) or the stored sheet (true for "Sì").
 */
export function slotAperto(slot: ModuloSlot, active: ReadonlySet<string>, valueOf: (key: string) => unknown): boolean {
  const answer = valueOf(slot.question);
  return active.has(slot.question) && (answer === 'si' || answer === true) && (!slot.marca || valueOf(slot.marca.field) === slot.marca.value);
}

/** The slot of a PDF address' last part (`ordine-quadro`, `dati-argano`…), or undefined. */
export function slotByPath(path: string): ModuloSlot | undefined {
  return SLOTS.find((slot) => slot.path === path);
}

/** The slot of a prefix (`oq`, `om`, `pa`, `sg`), or undefined. */
export function slotByPrefix(prefix: string): ModuloSlot | undefined {
  return SLOTS.find((slot) => slot.prefix === prefix);
}
