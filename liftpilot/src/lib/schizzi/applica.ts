// The values the technician confirmed (round 50) — read on a survey sketch by the model, or measured on a DXF/DWG
// drawing — put into a form's state as if typed: the shaft of /progetto (the one form's draft on its calculation,
// src/lib/lift/blank.ts) or the machine room's survey (src/lib/room/survey.ts). Only the values given, each over what
// the form holds for its id, each one entered (out of the values still to enter, so the engines draw as soon as the
// required ones are in), through the form's own helpers: the stops first set by their number (floorsTo: the rows, their
// rises and doors to enter), the entrances by entrancesTo (the second one's side, the stops' doors), a machine room
// added as the form adds it (ROOM_PLACEHOLDER, roomAdded), a panel placed by hand switching the software's place off
// (both its wall and place then to enter, so no placeholder becomes a value). A value the form cannot take is not put
// and says why: an id of no field, a value of the wrong type or out of the form's range (the catalog's, campi.ts), a
// stop the floors do not have, a value these choices do not ask for, a room the design has not got, a governor or an
// existing support without what makes it, a form the schema would no longer read. Pure: the panel calls it and the
// tests check it.
import { ROOM_FIELDS, ROOM_PLACEHOLDER, emptied, entrancesTo, filled, floorsTo, isBlankKey, relevant, roomAdded, type BlankKey, type LiftDraft } from '@/lib/lift/blank';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import { keptPlan, type Floor, type ShaftInputs } from '@/shaft';
import { campoDi, type Campo } from './campi';
import { checked, num, oneOf, order, roomValue, roomWith, sortedRefusals, type Esito, type Rifiuto, type Valore, type ValoreCampo } from './applica-base';

export type { Esito, Rifiuto, Valore, ValoreCampo } from './applica-base';
export { applicaLocale, valoreLocale } from './applica-locale';

const ENTRANCES: readonly ShaftInputs['entrances'][] = ['one', 'opposite', 'adjacent'];
const SIDES: readonly ShaftInputs['side2'][] = ['left', 'right'];
const CW: readonly ShaftInputs['cw'][] = ['rear', 'left', 'right'];
const DOORS: readonly ShaftInputs['door'][] = ['T2', 'C2'];
const FLOOR_DOORS: readonly Floor['door'][] = ['A', 'B', 'AB'];
const SHAFT_MM = ['W', 'D', 'wall', 'doorWidth', 'doorHeight'] as const;

// --- the shaft of /progetto ------------------------------------------------------------------------------------------

/** The order the values go in: the entrances (they bring the second one's side and the stops' doors), the number of
 *  stops (its rows), then the rest as given. */
const rank = (id: string): number => (id === 'entrances' ? 0 : id === 'floors' ? 1 : 2);

/** One value into the one form's draft, or why not. */
function passoVano(L: LiftDraft, id: string, v: ValoreCampo, campo: Campo, index: number | null): LiftDraft | Rifiuto {
  const S = L.inputs.shaft, V = S.vertical, n = V.floors.length, has = (k: BlankKey): boolean => !L.blank.includes(k);
  const multi = has('entrances') && S.entrances !== 'one';
  const shaft = (patch: Partial<ShaftInputs>, blank: readonly BlankKey[]): LiftDraft => ({ inputs: { ...L.inputs, shaft: { ...S, ...patch } }, blank });
  const vertical = (patch: Partial<ShaftInputs['vertical']>, entered: readonly BlankKey[]): LiftDraft => shaft({ vertical: { ...V, ...patch } }, filled(L.blank, entered));
  const floor = (i: number, patch: Partial<Floor>, key: BlankKey): LiftDraft => vertical({ floors: V.floors.map((f, j) => (j === i ? { ...f, ...patch } : f)) }, [key]);
  switch (campo.id) {
    case 'entrances': {
      const e = oneOf(ENTRANCES, v);
      return e ? shaft({ entrances: e }, entrancesTo(S, L.blank, e)) : 'valore';
    }
    case 'side2': {
      const s = oneOf(SIDES, v);
      if (!s) return 'valore';
      return has('entrances') && S.entrances === 'adjacent' ? shaft({ side2: s }, filled(L.blank, ['side2'])) : 'nonPertinente';
    }
    case 'cw': {
      const c = oneOf(CW, v);
      if (!c) return 'valore';
      return multi ? 'nonPertinente' : shaft({ cw: c }, filled(L.blank, ['cw']));
    }
    case 'door': {
      const d = oneOf(DOORS, v);
      return d ? shaft({ door: d }, filled(L.blank, ['door'])) : 'valore';
    }
    case 'pit':
    case 'headroom': {
      const x = num(v);
      return x === null ? 'valore' : vertical(campo.id === 'pit' ? { pit: x } : { headroom: x }, [campo.id]);
    }
    case 'floors': {
      const x = num(v);
      if (x === null) return 'valore';
      const r = floorsTo(V, L.blank, x, multi);
      return shaft({ vertical: r.vertical }, r.blank);
    }
    case 'rise': {
      const x = num(v);
      if (x === null || index === null) return 'valore';
      return has('floors') && index < n - 1 ? floor(index, { rise: x }, `rise.${index}`) : 'fermate';
    }
    case 'fdoor': {
      const d = oneOf(FLOOR_DOORS, v);
      if (!d || index === null) return 'valore';
      if (!has('floors') || index >= n) return 'fermate';
      return multi ? floor(index, { door: d }, `fdoor.${index}`) : 'nonPertinente';
    }
    case 'main': {
      const x = num(v);
      if (x === null) return 'valore';
      return has('floors') && x < n ? vertical({ main: x }, ['main']) : 'fermate';
    }
  }
  const m = SHAFT_MM.find((k) => k === id);
  if (m) {
    const x = num(v);
    return x === null ? 'valore' : shaft({ [m]: x }, filled(L.blank, [m]));
  }
  if (id.startsWith('room.')) return passoStanza(L, id.slice(5), v);
  return 'campo';
}

/** A measure of the room over the shaft into the one form: the machine room of a machine above (added when the design
 *  has none), the pulley room of a machine below whose scheme has one (no panel in it). */
function passoStanza(L: LiftDraft, k: string, v: ValoreCampo): LiftDraft | Rifiuto {
  const S = L.inputs.shaft, has = (x: BlankKey): boolean => !L.blank.includes(x), layout = L.inputs.calc.layout;
  const above = has('layout') && layout !== 'bottom', pulleys = has('layout') && layout === 'bottom' && has('bottom') && L.inputs.bottom === 'room';
  if (!above && !(pulleys && S.room !== null)) return 'nessunLocale';
  const panel = k.startsWith('panel');
  if (panel && !above) return 'nonPertinente';
  let room = S.room, blank: readonly BlankKey[] = L.blank, auto = L.inputs.auto;
  if (room === null) {
    room = ROOM_PLACEHOLDER;
    blank = roomAdded(blank);
  }
  // the panel placed on the sketch: the software no longer places it — its wall and place both to enter from here
  if ((k === 'panelWall' || k === 'panelAt') && auto.panel) {
    auto = { ...auto, panel: false };
    blank = emptied(blank, ['room.panelWall', 'room.panelAt']);
  }
  const next = roomWith(room, k, v);
  if (!next) return 'valore';
  const key = `room.${k}`, entered = isBlankKey(key) && (ROOM_FIELDS as readonly string[]).includes(k) ? [key] : [];
  return { inputs: { ...L.inputs, auto, shaft: { ...S, room: next } }, blank: filled(blank, entered) };
}

/** Whether the form's shaft still reads as the form keeps it (a draft the schema refuses is not kept). */
const leggibile = (L: LiftDraft): boolean => shaftInputsReadSchema.safeParse(L.inputs.shaft).success;

/** The confirmed values of the shaft into the one form's draft (composed on its calculation). */
export function applicaVano(L: LiftDraft, valori: readonly Valore[]): Esito<LiftDraft> {
  const { ok, refused } = checked('vano', valori), applied: string[] = [], before = leggibile(L);
  let d = L;
  for (const { v, campo, index } of [...ok].sort((a, b) => rank(a.v.id) - rank(b.v.id))) {
    const next = passoVano(d, v.id, v.value, campo, index);
    if (typeof next === 'string') refused.push({ id: v.id, code: next });
    else if (before && !leggibile(next)) refused.push({ id: v.id, code: 'modulo' });
    else {
      d = next;
      applied.push(v.id);
    }
  }
  // the distances set by hand on the plan go with the arrangement they belong to (as the form's own changes do)
  const S = d.inputs.shaft, plan = applied.length ? keptPlan(L.inputs.shaft, S) : S.plan;
  if (plan !== S.plan) {
    const { plan: _old, ...rest } = S;
    void _old;
    d = { ...d, inputs: { ...d.inputs, shaft: plan ? { ...rest, plan } : rest } };
  }
  return { draft: d, applied: order(valori, applied), refused: sortedRefusals(valori, refused) };
}

/** The value the one form holds for an id, or null while it is still to enter, while the choices do not ask for it (the
 *  second entrance's side of one entrance, a stop's door with one entrance, the panel the software places…) or when
 *  the form has no such value. */
export function valoreVano(L: LiftDraft, id: string): ValoreCampo | null {
  const c = campoDi('vano', id);
  if (!c || (isBlankKey(id) && (L.blank.includes(id) || !relevant(id, L)))) return null;
  const S = L.inputs.shaft, V = S.vertical;
  switch (c.campo.id) {
    case 'pit': return V.pit;
    case 'headroom': return V.headroom;
    case 'floors': return V.floors.length;
    case 'main': return V.main;
    case 'rise': return c.index === null ? null : V.floors[c.index]?.rise ?? null;
    case 'fdoor': return c.index === null ? null : V.floors[c.index]?.door ?? null;
  }
  if (id.startsWith('room.')) return S.room ? roomValue(S.room, id.slice(5)) : null;
  switch (id) {
    case 'W': case 'D': case 'wall': case 'doorWidth': case 'doorHeight': return S[id];
    case 'door': return S.door;
    case 'entrances': return S.entrances;
    case 'side2': return S.side2;
    case 'cw': return S.cw;
  }
  return null;
}
