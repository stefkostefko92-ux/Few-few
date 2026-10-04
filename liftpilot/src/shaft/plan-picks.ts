// Lengths of the plan a catalogue or a table gives, changed by choosing another entry where they are drawn: a rail's
// height between foot and tip (its profile, rails.ts) and a refuge space's sizes (its type, UNI EN 81-20 Tabella 3).
import { pickEdit, type Edit, type PickOption } from '../drawing';
import { KV_VERT } from './norme-vert';
import { RAILS, RAIL_TYPES, type RailType } from './rails';

export function railPick(key: 'carRail' | 'cwRail', now: RailType): Edit {
  const options: PickOption[] = RAIL_TYPES.map((t) => ({ label: `${t} · ${RAILS[t].h} mm`, set: t }));
  return pickEdit(key, options, RAIL_TYPES.indexOf(now));
}

export function refugePick(key: 'v.topRefuge' | 'v.pitRefuge', now: number): Edit {
  const types = key === 'v.topRefuge' ? ([1, 2] as const) : ([1, 2, 3] as const);
  const options: PickOption[] = types.map((t) => {
    const [w, d] = KV_VERT.refugePlan[t];
    return { label: `${t} · ${w} × ${d} · H ${KV_VERT.refugeH[t]} mm`, set: t };
  });
  return pickEdit(key, options, types.findIndex((t) => t === now));
}
