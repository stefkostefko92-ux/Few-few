// The values confirmed for the machine room's survey (round 50, see applica.ts): into the survey as typed, out of the
// measures still to enter; a governor or an existing support the survey has not got only made whole. Pure.
import { EXISTING_SUPPORTS, surveySchema, isSurveyField, type SurveyDraft, type SurveyField } from '@/lib/room/survey';
import { checked, num, oneOf, order, roomValue, roomWith, sortedRefusals, type Esito, type Rifiuto, type Valore, type ValoreCampo } from './applica-base';

/** The governor a survey adds when its footprint is confirmed: the ropes through the slab unless said otherwise, as the
 *  form's own «Limitatore presente» adds it (SurveyFound). */
const GOV_ROPES = true;
const GOV_KEYS = ['x', 'y', 'W', 'D'] as const;

/** One value into the survey, or why not (the governor and the existing support: see applicaLocale). */
function passoLocale(d: SurveyDraft, id: string, v: ValoreCampo): SurveyDraft | Rifiuto {
  const s = d.survey, [head = '', k = ''] = id.split('.'), entered = isSurveyField(id) ? [id] : [];
  const put = (survey: SurveyDraft['survey']): SurveyDraft => ({ survey, blank: d.blank.filter((f: SurveyField) => !entered.includes(f)) });
  const x = num(v);
  switch (head) {
    case 'room': {
      const room = roomWith(s.room, k, v);
      return room ? put({ ...s, room }) : 'valore';
    }
    case 'shaft':
      if (x === null || (k !== 'W' && k !== 'D' && k !== 'wall')) return 'valore';
      return put({ ...s, shaft: { ...s.shaft, [k]: x } });
    case 'car':
    case 'cw':
      if (x === null || (k !== 'x' && k !== 'y')) return 'valore';
      return put(head === 'car' ? { ...s, car: { ...s.car, [k]: x } } : { ...s, cw: { ...s.cw, [k]: x } });
    case 'governor': {
      const g = s.governor;
      if (!g) return 'incompleto';
      if (k === 'ropes') return typeof v === 'boolean' ? put({ ...s, governor: { ...g, ropes: v } }) : 'valore';
      const gk = GOV_KEYS.find((q) => q === k);
      return gk && x !== null ? put({ ...s, governor: { ...g, [gk]: x } }) : 'valore';
    }
    case 'existingSupport': {
      const o = s.existingSupport;
      if (!o) return 'incompleto';
      if (k === 'keep') return typeof v === 'boolean' ? put({ ...s, existingSupport: { ...o, keep: v } }) : 'valore';
      const kind = oneOf(EXISTING_SUPPORTS, v);
      return k === 'kind' && kind ? put({ ...s, existingSupport: { ...o, kind } }) : 'valore';
    }
  }
  return 'campo';
}

const leggibileLocale = (d: SurveyDraft): boolean => surveySchema.safeParse(d.survey).success;

/** The confirmed values of the machine room into its survey. A governor the survey has not got is added only with its
 *  whole footprint confirmed (x, y, W, D; its ropes through the slab unless said), an existing support only with its
 *  kind (kept: no, unless said). */
export function applicaLocale(d0: SurveyDraft, valori: readonly Valore[]): Esito<SurveyDraft> {
  const { ok, refused } = checked('locale', valori), applied: string[] = [], before = leggibileLocale(d0);
  let d = d0;
  const by = new Map(ok.map((o) => [o.v.id, o.v.value]));
  const take = (ids: readonly string[], next: SurveyDraft): void => {
    if (before && !leggibileLocale(next)) for (const id of ids) refused.push({ id, code: 'modulo' });
    else {
      d = next;
      applied.push(...ids);
    }
  };
  // the governor and the existing support, made whole first when the survey has none
  const govIds = ok.filter((o) => o.v.id.startsWith('governor.')).map((o) => o.v.id);
  if (!d.survey.governor && govIds.length) {
    const [x, y, W, D] = GOV_KEYS.map((k) => by.get(`governor.${k}`)), ropes = by.get('governor.ropes');
    if (typeof x === 'number' && typeof y === 'number' && typeof W === 'number' && typeof D === 'number') {
      take(govIds, { ...d, survey: { ...d.survey, governor: { x, y, W, D, ropes: typeof ropes === 'boolean' ? ropes : GOV_ROPES } } });
    } else for (const id of govIds) refused.push({ id, code: 'incompleto' });
  }
  const oldIds = ok.filter((o) => o.v.id.startsWith('existingSupport.')).map((o) => o.v.id);
  if (!d.survey.existingSupport && oldIds.length) {
    const kind = by.get('existingSupport.kind'), keep = by.get('existingSupport.keep'), k = typeof kind === 'string' ? oneOf(EXISTING_SUPPORTS, kind) : null;
    if (k) take(oldIds, { ...d, survey: { ...d.survey, existingSupport: { kind: k, keep: typeof keep === 'boolean' ? keep : false } } });
    else for (const id of oldIds) refused.push({ id, code: 'incompleto' });
  }
  const done = new Set([...applied, ...refused.map((r) => r.id)]);
  for (const { v } of ok) {
    if (done.has(v.id)) continue;
    const next = passoLocale(d, v.id, v.value);
    if (typeof next === 'string') refused.push({ id: v.id, code: next });
    else take([v.id], next);
  }
  return { draft: d, applied: order(valori, applied), refused: sortedRefusals(valori, refused) };
}

/** The value the survey holds for an id, or null while it is still to enter (or the survey has none). */
export function valoreLocale(d: SurveyDraft, id: string): ValoreCampo | null {
  if (isSurveyField(id) && d.blank.includes(id)) return null;
  const s = d.survey, [head = '', k = ''] = id.split('.');
  switch (head) {
    case 'room': return roomValue(s.room, k);
    case 'shaft': return k === 'W' || k === 'D' || k === 'wall' ? s.shaft[k] : null;
    case 'car': return k === 'x' || k === 'y' ? s.car[k] : null;
    case 'cw': return k === 'x' || k === 'y' ? s.cw[k] : null;
    case 'governor': {
      const g = s.governor;
      if (!g) return null;
      const gk = GOV_KEYS.find((q) => q === k);
      return k === 'ropes' ? g.ropes : gk ? g[gk] : null;
    }
    case 'existingSupport': {
      const o = s.existingSupport;
      return !o ? null : k === 'kind' ? o.kind : k === 'keep' ? o.keep : null;
    }
  }
  return null;
}
