// The steps of a form (round 52, «passo per passo»): the order its sections are filled in, each with the values it still
// needs. Every value still to enter belongs to the first step that holds it, and the step's link goes to the first of
// them; the step now is the first one still needing something. A step with nothing to enter (a result, the save) has no
// count. Pure: «Calcolo argano» and «Progetto» list their steps with it; the bar and the save bar read the same list.

export interface PassoDef {
  /** the section the step's link opens when nothing is missing in it */
  id: string;
  label: string;
  /** whether a value still to enter is this step's; absent: a step with nothing to enter */
  di?: (id: string) => boolean;
}

export interface Passo {
  id: string;
  label: string;
  /** its number in the bar, from 1 */
  n: number;
  /** the values still to enter in it; null: a step with nothing to enter */
  manca: number | null;
  /** the first of them, where the step's link goes; null: the step's own section */
  primo: string | null;
}

export function passiDa(defs: readonly PassoDef[], missing: readonly string[]): Passo[] {
  const di = (id: string): number => defs.findIndex((d) => d.di?.(id) ?? false);
  const own = defs.map(() => [] as string[]);
  for (const id of missing) {
    const i = di(id);
    if (i >= 0) own[i]?.push(id);
  }
  return defs.map((d, i) => ({ id: d.id, label: d.label, n: i + 1, manca: d.di ? (own[i]?.length ?? 0) : null, primo: own[i]?.[0] ?? null }));
}

/** The step now: the first one still needing a value; null once nothing is missing. */
export const passoOra = (passi: readonly Passo[]): Passo | null => passi.find((p) => (p.manca ?? 0) > 0) ?? null;
