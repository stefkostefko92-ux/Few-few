// What the panel's confirmed values share (round 50): the value as the catalog types it, why one is not put into a
// form, the result of putting them, and the small helpers both forms' mappers use (applica.ts the shaft of /progetto,
// applica-locale.ts the machine room's survey). Pure.
import type { RoomInputs } from '@/shaft';
import { campoDi, valoreValido, type Campo, type Target } from './campi';

export type ValoreCampo = number | string | boolean;
/** A confirmed value: the form's id (`rise.3` for an indexed field) and the value as the catalog types it. */
export interface Valore { id: string; value: ValoreCampo }

/** Why a confirmed value was not put into the form. */
export type Rifiuto = 'campo' | 'valore' | 'fermate' | 'nonPertinente' | 'nessunLocale' | 'incompleto' | 'modulo';

export interface Esito<D> {
  draft: D;
  /** the ids put into the form, in the order given */
  applied: string[];
  refused: { id: string; code: Rifiuto }[];
}

export const WALLS: readonly RoomInputs['doorWall'][] = ['front', 'rear', 'left', 'right'];
export const ROOM_MM = ['W', 'D', 'shaftX', 'shaftY', 'H', 'ridge', 'slab', 'doorAt', 'doorW', 'doorH', 'panelAt', 'panelW', 'panelD', 'panelH'] as const;

export const oneOf = <T extends string>(list: readonly T[], v: ValoreCampo): T | null => list.find((x) => x === v) ?? null;
export const num = (v: ValoreCampo): number | null => (typeof v === 'number' ? v : null);

/** The room with one of its fields set; null when the value is not of the field's kind. */
export function roomWith(R: RoomInputs, k: string, v: ValoreCampo): RoomInputs | null {
  const m = ROOM_MM.find((x) => x === k);
  if (m) return typeof v === 'number' ? { ...R, [m]: v } : null;
  const w = oneOf(WALLS, v);
  if (k === 'doorWall' && w) return { ...R, doorWall: w };
  if (k === 'panelWall' && w) return { ...R, panelWall: w };
  return null;
}

/** The values checked against the catalog of the target: the valid ones, and the refused with why. */
export function checked(target: Target, valori: readonly Valore[]): { ok: { v: Valore; campo: Campo; index: number | null }[]; refused: Esito<unknown>['refused'] } {
  const ok: { v: Valore; campo: Campo; index: number | null }[] = [], refused: Esito<unknown>['refused'] = [], seen = new Set<string>();
  for (const v of valori) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    const c = campoDi(target, v.id);
    if (!c) refused.push({ id: v.id, code: 'campo' });
    else if (valoreValido(c.campo.tipo, v.value) !== 'ok') refused.push({ id: v.id, code: 'valore' });
    else ok.push({ v, campo: c.campo, index: c.index });
  }
  return { ok, refused };
}

/** A room's value for one of its field's ids (`W`, `doorWall`…), null for none. */
export function roomValue(R: RoomInputs, k: string): ValoreCampo | null {
  const m = ROOM_MM.find((x) => x === k);
  if (m) return R[m];
  return k === 'doorWall' ? R.doorWall : k === 'panelWall' ? R.panelWall : null;
}

/** The ids in the order the values were given. */
export function order(valori: readonly Valore[], ids: readonly string[]): string[] {
  const at = new Map(valori.map((v, i) => [v.id, i]));
  return [...ids].sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0));
}
/** The refusals in the order the values were given. */
export function sortedRefusals(valori: readonly Valore[], refused: Esito<unknown>['refused']): Esito<unknown>['refused'] {
  const at = new Map(valori.map((v, i) => [v.id, i]));
  return [...refused].sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
}
