// The remedies of a check of the Progetto (round 54): the levers of the drawn shaft (vano.ts) tried on the whole drawing
// as «Applica» sets them — a dimension of the drawings typed (progetto-edit.ts conVano), composed on its «Calcolo argano»
// and worked out again (deriveLift, with the installation's bracket pitches as the screen) —; a value that leaves data to
// enter, or a geometry the save refuses that was not refused before, is no remedy. The checks of the machine are
// «Calcolo argano»'s; some of the shaft's are the installation's data or the building's (vano.ts ALTROVE). Pure.
import { deriveLift, type LiftDerived } from '@/lib/lift';
import { drawnShaft } from '@/lib/lift/panel-form';
import { mancantiDi } from '@/lib/lift/progetto-bozza';
import { conVano } from '@/lib/lift/progetto-edit';
import { composto, type BaseCalcolo, type ProgettoDraft } from '@/lib/lift/progetto';
import { mergeChecks, withPitches, type BracketPitches, type ShaftInputs } from '@/shaft';
import { cercaRimedi, type Opzioni } from './cerca';
import { esitoDi } from './margine';
import type { Dove, Esito, Rimedio, Valuta } from './tipi';
import { ALTROVE, leveVano } from './vano';

/** The drawing as the screen holds it: its form, its base, what it gives now, the installation's bracket pitches. */
export interface ContestoProgetto {
  form: ProgettoDraft;
  base: BaseCalcolo;
  derived: LiftDerived;
  pitches?: BracketPitches;
}

/** A design's result as the search reads it. */
export const esitoLift = (d: LiftDerived): Esito => esitoDi(d.collaudo, d.analysis.res.checks, mergeChecks(d.layout.checks, d.supportChecks));

/** The drawing worked out again with the drawn shaft `shaft`, as «Applica» would set it. */
export function valutaProgetto(c: ContestoProgetto): Valuta<ShaftInputs> {
  const before = new Set(c.derived.issues);
  return (shaft) => {
    const L = composto(conVano(c.form, c.base, shaft, c.derived), c.base);
    if (mancantiDi(L, c.base.collaudo).length) return null;
    try {
      const d = deriveLift(L.inputs);
      return d.issues.some((i) => !before.has(i)) ? null : esitoLift({ ...d, layout: withPitches(d.layout, c.pitches) });
    } catch {
      return null;
    }
  };
}

/** Where a check of the Progetto is put right. */
export const doveProgetto = (c: ContestoProgetto, id: string): Dove =>
  c.derived.analysis.res.checks.some((x) => x.id === id) ? 'calcolo' : ALTROVE[id] ?? 'qui';

/** The remedies of check `id` of the drawing (`label`: the name of a list's entry); the shaft each one sets is the one
 *  «Applica» gives the drawing (ProgettoWorkspace setDrawn). */
export function rimediProgetto(c: ContestoProgetto, id: string, label: (key: string) => string, o: Opzioni = {}): Promise<Rimedio<ShaftInputs>[]> {
  const drawn = drawnShaft(composto(c.form, c.base).inputs.shaft, c.derived);
  return cercaRimedi(drawn, esitoLift(c.derived), id, leveVano(id, drawn, c.derived.layout, label), valutaProgetto(c), o);
}
