// Every measure of the catalog (src/lib/schizzi/campi.ts) reaches its form (round 50, Q1): for each field of both
// targets a value at each end of its range (each choice, yes and no) goes through applicaVano / applicaLocale into the
// form and comes back from valoreVano / valoreLocale as it went in. The mappers name the fields a second time (the
// rooms' millimetres, the walls, the shaft's choices…): a field added to the catalog, or a choice added to a schema,
// that a mapper does not know would be refused «valore» in the panel with no test failing — here it fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankLift, filled, type LiftDraft } from '@/lib/lift/blank';
import { blankSurvey, type SurveyDraft } from '@/lib/room/survey';
import { CAMPI, type Campo } from '@/lib/schizzi/campi';
import { applicaLocale, applicaVano, valoreLocale, valoreVano, type Esito, type Valore, type ValoreCampo } from '@/lib/schizzi/applica';

/** The values to send for a field: both ends of its range, each of its choices, yes and no. */
const valori = (c: Campo): ValoreCampo[] => (c.tipo.kind === 'enum' ? [...c.tipo.values] : c.tipo.kind === 'bool' ? [true, false] : [c.tipo.min, c.tipo.max]);
/** The ids of a field: an indexed one at its first and its last stop. */
const ids = (c: Campo): string[] => (c.indexed ? [`${c.id}.0`, `${c.id}.${c.indexed.max}`] : [c.id]);

/** Every pair the catalog has for a target, with the value that went in and what the form reads back. */
function giro<D>(campi: readonly Campo[], base: (c: Campo) => D, applica: (d: D, v: Valore[]) => Esito<D>, valore: (d: D, id: string) => ValoreCampo | null): string[] {
  const out: string[] = [];
  for (const c of campi) {
    for (const id of ids(c)) {
      for (const value of valori(c)) {
        const r = applica(base(c), [{ id, value }]), back = r.applied.includes(id) ? valore(r.draft, id) : null;
        if (back !== value) out.push(`${id}=${String(value)}: ${r.refused.map((x) => x.code).join() || 'applied'} → ${String(back)}`);
      }
    }
  }
  return out;
}

// --- the preconditions, set once ---------------------------------------------------------------------------------------

/** The one form of /progetto with its machine above (a room over the shaft), all the stops a shaft may have, and the
 *  entrances each field asks for: one (the counterweight's side), two adjacent (the second one's side), two opposite
 *  (the stops' doors, and the rest). */
function vano(entrances: 'one' | 'adjacent' | 'opposite'): LiftDraft {
  const d0 = blankLift(), d: LiftDraft = { ...d0, blank: filled(d0.blank, ['layout', 'r', 'v', 'Q', 'Qkg']) };
  const floors = CAMPI.vano.find((c) => c.id === 'floors')?.tipo;
  assert.ok(floors?.kind === 'int');
  const r = applicaVano(d, [{ id: 'entrances', value: entrances }, { id: 'floors', value: floors.max }]);
  assert.deepEqual(r.refused, [], entrances);
  return r.draft;
}
const VANO = { one: vano('one'), adjacent: vano('adjacent'), opposite: vano('opposite') };
const baseVano = (c: Campo): LiftDraft => (c.id === 'cw' ? VANO.one : c.id === 'side2' ? VANO.adjacent : VANO.opposite);

/** The machine room's survey with a governor and an existing support found (their fields then go in one by one). */
const LOCALE: SurveyDraft = (() => {
  const r = applicaLocale(blankSurvey(600), [
    { id: 'governor.x', value: 600 }, { id: 'governor.y', value: 700 }, { id: 'governor.W', value: 400 }, { id: 'governor.D', value: 300 },
    { id: 'existingSupport.kind', value: 'frame' },
  ]);
  assert.deepEqual(r.refused, []);
  return r.draft;
})();

test('catalogo → modulo: ogni misura del vano entra nel modulo e si rilegge com’è (estremi, scelte)', () => {
  assert.ok(CAMPI.vano.length > 20);
  assert.deepEqual(giro(CAMPI.vano, baseVano, applicaVano, valoreVano), []);
});

test('catalogo → modulo: ogni misura del locale entra nel rilievo e si rilegge com’è (estremi, scelte, sì/no)', () => {
  assert.ok(CAMPI.locale.length >= 30);
  assert.deepEqual(giro(CAMPI.locale, () => LOCALE, applicaLocale, valoreLocale), []);
});
