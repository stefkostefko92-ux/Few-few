// Which supplier's module goes with which field of the sheet: the make it opens with (when the module is one make's), the
// database column (JSON), the "Sì/No" question, the prefix of its fields in the form and the last part of its PDF's
// address (`/api/rilievi/<id>/<path>`). The control panel has four modules in one column and under one question —
// Pelazza, MoviLift and Mastech's two (NG120 and QI Touch, by the second choice, the model); the make and the model are
// one each, so at most one of them is open. The argano data sheet (for every kind of machine) and 2SG's sheet for the
// car operator and the suspensions have no make. Ported 1:1 from rilievi (src/ordini/registry.ts, commit 988f3cf37).
import { ARGANI, MASTECH_NG120, MASTECH_QI, MOVILIFT, PELAZZA, SG, type Modulo } from './moduli';

/** The prefix in the form: `oq` — Pelazza's panel, `om` — MoviLift's panel, `mn` and `mq` — Mastech's NG120 and QI Touch
 *  panels, `pa` — the argano sheet, `sg` — 2SG's sheet. */
export type Prefisso = 'oq' | 'om' | 'mn' | 'mq' | 'pa' | 'sg';

export interface ModuloSlot {
  /** The make the module opens with; without one — with every make. */
  marca?: { field: 'quadroMarca'; value: string };
  /** And the panel's model under the make (Mastech: NG120 or QI Touch). */
  modello?: { field: 'quadroModello'; value: string };
  column: 'ordineQuadro' | 'preventivoArgano' | 'ordineSospensioni';
  question: 'quadroOrdine' | 'arganoPreventivo' | 'sospensioni';
  prefix: Prefisso;
  path:
    | 'ordine-quadro'
    | 'ordine-quadro-movilift'
    | 'ordine-quadro-mastech-ng120'
    | 'ordine-quadro-mastech-qi-touch'
    | 'dati-argano'
    | 'sospensioni-2sg';
  modulo: Modulo;
}

export const SLOTS: readonly ModuloSlot[] = [
  { marca: { field: 'quadroMarca', value: 'PELAZZA' }, column: 'ordineQuadro', question: 'quadroOrdine', prefix: 'oq', path: 'ordine-quadro', modulo: PELAZZA },
  { marca: { field: 'quadroMarca', value: 'MOVILIFT' }, column: 'ordineQuadro', question: 'quadroOrdine', prefix: 'om', path: 'ordine-quadro-movilift', modulo: MOVILIFT },
  {
    marca: { field: 'quadroMarca', value: 'MASTECH' },
    modello: { field: 'quadroModello', value: 'NG120' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'mn',
    path: 'ordine-quadro-mastech-ng120',
    modulo: MASTECH_NG120,
  },
  {
    marca: { field: 'quadroMarca', value: 'MASTECH' },
    modello: { field: 'quadroModello', value: 'QI_TOUCH' },
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'mq',
    path: 'ordine-quadro-mastech-qi-touch',
    modulo: MASTECH_QI,
  },
  { column: 'preventivoArgano', question: 'arganoPreventivo', prefix: 'pa', path: 'dati-argano', modulo: ARGANI },
  { column: 'ordineSospensioni', question: 'sospensioni', prefix: 'sg', path: 'sospensioni-2sg', modulo: SG },
];

/**
 * The modules' columns (the panel — whatever the make, the argano sheet, 2SG) in the order of the slots: each is chosen
 * on its own for the sheet's print and PDF (src/lib/rilievi/stampa.ts).
 */
export const COLONNE: readonly ModuloSlot['column'][] = [...new Set(SLOTS.map((slot) => slot.column))];

/** The sheet's choices the module opens with: the make, then the model (the view — one wrapper for each). */
export function sceltaDi(slot: ModuloSlot): Array<{ field: string; value: string }> {
  return [slot.marca, slot.modello].filter((c): c is NonNullable<typeof c> => c !== undefined);
}

/** The makes a column's question is asked with (fields.ts, `when`); empty — without a condition. */
export function marcheOf(question: ModuloSlot['question']): string[] {
  return [...new Set(SLOTS.flatMap((slot) => (slot.question === question && slot.marca ? [slot.marca.value] : [])))];
}

/** The stored sheet chose the module's make and model (not its question — the caller checks that). */
export function sceltoNellaScheda(slot: ModuloSlot, valueOf: (key: string) => unknown): boolean {
  return sceltaDi(slot).every((c) => valueOf(c.field) === c.value);
}

/**
 * The module is open: its question is shown (`active`, the fields with a condition), the answer is "Sì" and the make and
 * the model are its own (when it has them). The model is a field with a condition — only the shown one counts. `valueOf`
 * reads the form (strings) or the stored sheet (true for "Sì").
 */
export function slotAperto(slot: ModuloSlot, active: ReadonlySet<string>, valueOf: (key: string) => unknown): boolean {
  const answer = valueOf(slot.question);
  return (
    active.has(slot.question) &&
    (answer === 'si' || answer === true) &&
    sceltoNellaScheda(slot, valueOf) &&
    (!slot.modello || active.has(slot.modello.field))
  );
}

/**
 * «Sì» to the order with a make that has models but no model chosen (Mastech without NG120 / QI Touch): no module can
 * open — the key of the missing model field, otherwise null.
 */
export function modelloMancante(active: ReadonlySet<string>, valueOf: (key: string) => unknown): string | null {
  const slot = SLOTS.find(
    (s) =>
      s.modello &&
      active.has(s.question) &&
      active.has(s.modello.field) &&
      valueOf(s.question) === 'si' &&
      (!s.marca || valueOf(s.marca.field) === s.marca.value),
  );
  if (!slot?.modello) return null;
  const chosen = valueOf(slot.modello.field);
  return typeof chosen === 'string' && chosen !== '' ? null : slot.modello.field;
}

/** The slot of a PDF address' last part (`ordine-quadro`, `dati-argano`…), or undefined. */
export function slotByPath(path: string): ModuloSlot | undefined {
  return SLOTS.find((slot) => slot.path === path);
}

/** The slot of a prefix (`oq`, `om`, `mn`, `mq`, `pa`, `sg`), or undefined. */
export function slotByPrefix(prefix: string): ModuloSlot | undefined {
  return SLOTS.find((slot) => slot.prefix === prefix);
}
