// The supplier modules a survey has filled in (round 44: listed with the survey on its installation's page, under
// «Documenti e ordini»): those whose question is «Sì», of the sheet's make where the module is one make's, and stored —
// exactly those whose PDF the sheet's module route serves (src/app/api/rilievi/[id]/[modulo]/route.ts). Pure.
import type { Prisma, Scheda } from '@prisma/client';
import { nomeModulo } from '@/lib/rilievi/ordini/moduli';
import { SLOTS } from '@/lib/rilievi/ordini/registry';
import { storedValori } from '@/lib/rilievi/ordini/valori';

/** The columns a sheet's modules are read from. */
export const MODULI_SELECT = {
  quadroMarca: true, quadroOrdine: true, ordineQuadro: true, arganoPreventivo: true, preventivoArgano: true, sospensioni: true, ordineSospensioni: true,
} as const satisfies Prisma.SchedaSelect;

export type ModuliRow = Pick<Scheda, keyof typeof MODULI_SELECT>;

export interface ModuloLink {
  /** the last part of its PDF's address: /api/rilievi/<id>/<path> */
  path: string;
  /** «Titolo · Fornitore» */
  nome: string;
}

export function moduliDi(s: ModuliRow): ModuloLink[] {
  return SLOTS.filter((slot) => s[slot.question] === true && (!slot.marca || s[slot.marca.field] === slot.marca.value) && storedValori(slot.modulo, s[slot.column]) !== null)
    .map((slot) => ({ path: slot.path, nome: nomeModulo(slot.modulo) }));
}
