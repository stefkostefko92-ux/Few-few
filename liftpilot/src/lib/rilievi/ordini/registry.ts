// Which supplier's module goes with which field of the sheet: the database column (JSON), the "Sì/No" question that
// opens it, the prefix of its fields in the form, and the last part of its PDF's address
// (`/api/rilievi/<id>/<path>`). Ported 1:1 from rilievi (src/ordini/registry.ts).
import { MONTANARI, PELAZZA, type Modulo } from './moduli';

export interface ModuloSlot {
  column: 'ordineQuadro' | 'preventivoArgano';
  question: 'quadroOrdine' | 'arganoPreventivo';
  prefix: string;
  path: 'ordine-quadro' | 'preventivo-argano';
  modulo: Modulo;
}

export const SLOTS: readonly ModuloSlot[] = [
  { column: 'ordineQuadro', question: 'quadroOrdine', prefix: 'oq', path: 'ordine-quadro', modulo: PELAZZA },
  { column: 'preventivoArgano', question: 'arganoPreventivo', prefix: 'pa', path: 'preventivo-argano', modulo: MONTANARI },
];

export function slotOf(column: string | undefined): ModuloSlot | undefined {
  return SLOTS.find((slot) => slot.column === column);
}

/** The slot of a PDF address' last part (`ordine-quadro`, `preventivo-argano`), or undefined. */
export function slotByPath(path: string): ModuloSlot | undefined {
  return SLOTS.find((slot) => slot.path === path);
}
