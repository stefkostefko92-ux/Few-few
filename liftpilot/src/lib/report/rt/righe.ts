// A check of the relazione tecnica di modifica as a row of the document: its name (the RT's own from doc.json, the
// calculation's from its texts, the shaft's and the machine room's from the screen's labels without the clause in
// brackets — the «Riferimento» column has it), its value and limit with their unit (a window «da … a …», the fire
// classes by name, the room's door by its sizes as sheet 1 writes it), its outcome in words and the clause it cites.
// A check whose data are missing reads «Dati mancanti ⚠», never a value; one of a part that stays reads «Esistente
// (fuori dall’ambito)» with its computed outcome. Pure.
import appIt from '../../../../messages/it.json';
import { decimalsShown, isUpperLimit, shownValue } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import type { ShaftCheck, ShaftCheckId } from '@/shaft/types';
import { isCalcCheckId } from '@/lib/verdict-checks';
import { roomCheckKey } from '../../room/derive';
import { RT_NEW_CHECK_IDS, type RtCheck, type RtNewCheckId } from '../../rt/types';
import { surveyedLabel } from '../../tavole/survey-data';
import type { BlockStatus } from '../model';
import type { Ctx } from './contesto';
import { DOC, fill } from './testi';

const SHAFT: Readonly<Record<string, string>> = appIt.shaft;
const VERIFICHE: Readonly<Record<string, string>> = DOC.verifiche.nomi;
const CASI: Readonly<Record<string, string>> = DOC.casi;
const ESITI: Readonly<Record<string, string>> = DOC.esiti;

const isRtNew = (id: string): id is RtNewCheckId => RT_NEW_CHECK_IDS.some((x) => x === id);
const isShaft = (id: string): id is ShaftCheckId => !isRtNew(id) && !isCalcCheckId(id);
/** A label of the screen without its clause in brackets at the end («… (UNI EN 81-20, 5.6.2.2.1.3 c))»). */
export function senzaClausola(label: string): string {
  if (!label.endsWith(')')) return label;
  const at = Math.max(label.lastIndexOf(' (UNI '), label.lastIndexOf(' (DM '), label.lastIndexOf(' (EN '));
  return at > 0 ? label.slice(0, at) : label;
}

/** The room's door on the room path: its sizes against the least ones, as sheet 1 writes it. */
const portaLocale = (x: Ctx, c: RtCheck): boolean => c.id === 'm_door' && !!x.base.room;

export function etichetta(x: Ctx, c: RtCheck): string {
  const room = x.base.room;
  let label: string;
  if (isRtNew(c.id)) label = VERIFICHE[c.id] ?? c.id;
  else if (isCalcCheckId(c.id)) label = x.X.checkLabel(c.id);
  else if (room && c.id.startsWith('m_')) label = surveyedLabel(c.id, SHAFT[roomCheckKey(c.id, room.derived)] ?? SHAFT[`c_${c.id}`] ?? c.id, room.survey);
  else label = SHAFT[`c_${c.id}`] ?? c.id;
  label = senzaClausola(label);
  if (portaLocale(x, c)) label = label.replace(', margine', '');
  const caso = c.caso ? CASI[c.caso] ?? c.caso : null;
  return caso ? `${label} — ${caso}` : label;
}

const unita = (u: string): string => (u ? ` ${u}` : '');
/** The two fire classes of rt_door_fire, «nuova / esistente». */
const classi = (c: RtCheck): [string, string] | null => {
  const [n, e] = (c.nota ?? '').split(' / ');
  return c.id === 'rt_door_fire' && n && e ? [n, e] : null;
};

export function valoreDi(x: Ctx, c: RtCheck): string {
  if (portaLocale(x, c) && x.base.room) return `${x.base.room.survey.room.doorW} × ${x.base.room.survey.room.doorH} mm`;
  if (c.value === null || c.mancanti?.length) return '—';
  const fuoco = classi(c);
  if (fuoco) return fuoco[0];
  const { fmt } = x;
  if (isCalcCheckId(c.id)) return x.X.checkValue({ id: c.id, status: c.status, value: c.value, limit: c.limit, dec: c.dec }, x.base.analysis.ctx.N);
  if (isShaft(c.id) && (c.unit === '' || c.unit === 'mm' || c.unit === 'm²' || c.unit === 'm/s' || c.unit === 'MPa')) {
    const s: ShaftCheck = { id: c.id, status: c.status, value: c.value, limit: c.limit, dec: c.dec, unit: c.unit };
    return `${shownValue(s, (v, k) => fmt(v, k))}${unita(c.unit)}`;
  }
  const k = c.limit === null ? c.dec : decimalsShown(c.value, c.limit, c.upper, c.status === 'ok', c.dec) ?? c.dec;
  return `${fmt(c.value, k)}${unita(c.unit)}`;
}

export function limiteDi(x: Ctx, c: RtCheck): string {
  const { fmt } = x;
  if (portaLocale(x, c)) return `≥ ${KV_VERT.doorMinW} × ${KV_VERT.doorMinH} mm`;
  const fuoco = classi(c);
  if (fuoco) return fill(DOC.verifiche.fuocoLimite, { classe: fuoco[1] });
  if (isCalcCheckId(c.id)) return x.X.checkLimit({ id: c.id, status: c.status, value: c.value, limit: c.limit, dec: c.dec }, x.base.analysis.ctx.N) || '—';
  if (c.limit === null) return '—';
  if (c.limitMin !== undefined && c.limitMin !== null) {
    // the governor's window is open at the top (UNI EN 81-20 5.6.2.2.1.1 a): under the gear's limit)
    const t = c.id === 'rt_gov_trip' ? DOC.verifiche.finestraAperta : DOC.verifiche.finestra;
    return `${fill(t, { min: fmt(c.limitMin, c.dec), max: fmt(c.limit, c.dec) })}${unita(c.unit)}`;
  }
  const upper = isShaft(c.id) ? isUpperLimit(c.id) : c.upper;
  return `${upper ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unita(c.unit)}`;
}

/** The outcome's key: missing data, a part that stays, or the computed status. */
export type EsitoKey = 'ok' | 'fail' | 'warn' | 'info' | 'esistente' | 'mancanti';
export const esitoKey = (c: RtCheck): EsitoKey => (c.mancanti?.length ? 'mancanti' : c.ambito === 'esistente' ? 'esistente' : c.status);

/** The outcome in words and the colour of its cell. */
export function esitoDi(c: RtCheck): { text: string; status: BlockStatus } {
  const k = esitoKey(c);
  if (k === 'mancanti') return { text: ESITI.mancanti ?? k, status: 'warn' };
  if (k === 'esistente') return { text: `${ESITI.esistente ?? k}\n(${ESITI[c.status] ?? c.status})`, status: 'info' };
  return { text: ESITI[k] ?? k, status: k };
}

/** The row of the «Verifiche» grid: Verifica · Valore · Limite · Esito · Riferimento. */
export const rigaVerifica = (x: Ctx, c: RtCheck): string[] => [etichetta(x, c), valoreDi(x, c), limiteDi(x, c), esitoDi(c).text, c.ref];

/** The notes the checks carry (the options of the rails, the shoes, the travel), each once; the fire classes are the
 *  row's own value and limit. */
export const noteDi = (checks: readonly RtCheck[]): string[] =>
  [...new Set(checks.filter((c) => c.nota && !classi(c)).map((c) => c.nota ?? ''))];
