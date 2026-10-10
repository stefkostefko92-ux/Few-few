// A direct pull in a lift design: the two falls hang from the sheave's two sides, drawn in the plan as far apart as its
// pitch diameter (registry impianto.calata). The proposal of the machine therefore takes only that sheave wherever it is
// made or shown — the one form's derivation, its proposal line, the calculation's page, the relazione's proposal and
// advice — so one document never proposes a sheave its plan cannot hang; except a replacement compared with the
// existing machine, whose hitches stay (the calculation inclines the ropes to the new sheave). Pure.
import { SHEAVE_GRID, sizeMachine } from '@/calc/sizing';
import type { ParsedInputs, Sizing } from '@/calc/types';

/** The falls are the plan's: a direct pull, other than a replacement compared with the existing machine. */
export const planFalls = (c: Pick<ParsedInputs, 'I' | 'compare'>): boolean => c.I.layout === 'top' && !(c.compare && c.I.context === 'repl');

/** The sheaves a direct pull's proposal may take: the drop spacing `D` [mm] when it is within the sizing's grid (from
 *  its first to its last sheave), else none. */
export const dropSheaves = (D: number): number[] => (D >= SHEAVE_GRID[0] && D <= SHEAVE_GRID[SHEAVE_GRID.length - 1] ? [D] : []);

/** How the sizing of a lift design's values holds its sheave: the existing one kept, the one a direct pull's plan
 *  hangs the falls from, or none (the grid). */
export type SheaveHold = 'existing' | 'drop' | null;

export const sheaveHold = (c: ParsedInputs, design: boolean): SheaveHold => (c.fixedD ? 'existing' : design && planFalls(c) ? 'drop' : null);

/**
 * The sizing of a lift design's values (`design`; else the calculator's): with the plan's falls only the sheave
 * verified — the drop spacing, as the proposal took it, or one entered by hand within KL.calataTol of it (a design that
 * differs more is not saved) — and none when it is off the grid's range, as the proposal (derive.ts); else the
 * calculator's sizing (the existing sheave kept, or the grid).
 */
export function designSizing(c: ParsedInputs, design: boolean): Sizing {
  if (sheaveHold(c, design) !== 'drop') return sizeMachine(c.I, c.N, c.fixedD, c.rope);
  const [D] = dropSheaves(c.N.D);
  return D ? sizeMachine(c.I, c.N, D, c.rope) : { options: [], pick: null, fixedD: c.N.D, keep: c.rope };
}
