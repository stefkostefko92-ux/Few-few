import { MONTANARI, PELAZZA, type Modulo } from './moduli.js';

/**
 * Кой модул на доставчик към кое поле на картата: колоната в базата (JSON), въпросът „Sì/No“, който
 * го отваря, и префиксът на полетата му във формата. Пътят на PDF-а е `/schede/:id/<path>`.
 */
export interface ModuloSlot {
  column: 'ordineQuadro' | 'preventivoArgano';
  question: 'quadroOrdine' | 'arganoPreventivo';
  prefix: string;
  path: string;
  modulo: Modulo;
}

export const SLOTS: readonly ModuloSlot[] = [
  {
    column: 'ordineQuadro',
    question: 'quadroOrdine',
    prefix: 'oq',
    path: 'ordine-quadro',
    modulo: PELAZZA,
  },
  {
    column: 'preventivoArgano',
    question: 'arganoPreventivo',
    prefix: 'pa',
    path: 'preventivo-argano',
    modulo: MONTANARI,
  },
];

export function slotOf(column: string | undefined): ModuloSlot | undefined {
  return SLOTS.find((slot) => slot.column === column);
}
