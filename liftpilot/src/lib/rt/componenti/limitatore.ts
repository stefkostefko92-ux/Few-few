// The overspeed governor and the safety gear in the relazione tecnica di modifica (RT plan §4.5): the gear's type for the
// rated speed (sg_type, extracted from the rails' checks), the governor's plate tripping speed within the window of UNI
// EN 81-20:2020, 5.6.2.2.1.1 a) (rt_gov_trip, tripWindow) and, under UNI 10411-1 with the speed reduced (15.17) or a new
// governor (18), within the limit of the rule at installation the engineer states with its source (rt_gov_origin); its
// tensile force at tripping (rt_gov_force), its rope's breaking load (rt_gov_rope_sf) and its sheave over the rope
// (v_govdd) — registry rt.limitatore.*, vano.limitatore.fune. Each value read on a document carries its source. Pure.
import { GOVERNORS, govSheaveCheck, tripWindow, type GovernedGear } from '@/shaft/governor';
import type { ShaftCheckId } from '@/shaft/types';
import { sgTypeCheck } from '../../tavole/rail-check';
import { KR } from '../norme';
import type { PuntoRt, RtCheck } from '../types';
import { ambito, caso, conId, daVano, dato, fonteDi, mancante, mancantiDi, nuova, rtCheck, type RtCtx } from './comune';
import type { Esito, EsitoSezione } from './esito';
import { SITO_RT, sito } from './punti';

/** rt_gov_trip: the plate tripping speed within the window for the rated speed v and the car's gear [m/s]: at least its
 *  lower end, below its upper end (the gear's limit itself is out: 5.6.2.2.1.1 a) wants the speed under it). */
export function finestraScatto(v: number, gear: GovernedGear, scatto: number): Esito {
  const w = tripWindow(v, gear);
  return { status: scatto >= w.lo - 1e-9 && scatto < w.hi - 1e-9 ? 'ok' : 'fail', value: scatto, limit: w.hi, limitMin: w.lo };
}
/** rt_gov_force: the governor's tensile force at least the larger of KR.govForceGear times the gear's engaging force and
 *  KR.govForceMin [N]. */
export function forzaLimitatore(tiro: number, paracadute: number): Esito {
  const need = Math.max(KR.govForceGear * paracadute, KR.govForceMin);
  return { status: tiro >= need - 1e-9 ? 'ok' : 'fail', value: tiro, limit: need };
}
/** rt_gov_rope_sf: the rope's breaking load over the tensile force at least KR.govRopeSf. */
export function funeLimitatore(rottura: number, tiro: number): Esito {
  const sf = rottura / tiro;
  return { status: sf >= KR.govRopeSf - 1e-9 ? 'ok' : 'fail', value: sf, limit: KR.govRopeSf };
}
/** rt_gov_origin: the plate tripping speed at most the limit of the rule at installation [m/s]. */
export const limiteOrigine = (scatto: number, limite: number): Esito => ({ status: scatto <= limite + 1e-9 ? 'ok' : 'fail', value: scatto, limit: limite });

/** The design's checks of the governor's place, printed in this section. */
export const ID_LIMITATORE: readonly ShaftCheckId[] = ['v_gov', 'v_govrail', 'v_govdd'];

export function limitatore(x: RtCtx): EsitoSezione {
  const g = x.inputs.componenti?.limitatore, v = x.I.v, gear = x.plant.safetyGear, govNew = nuova(x, 'governor'), gearNew = nuova(x, 'safetyGear');
  const checks: RtCheck[] = [], punti: PuntoRt[] = [], c = (f: string): string => `componenti.limitatore.${f}`;
  const o = (richiesta: boolean, upper = true) => ({ sezione: 'limitatore' as const, ambito: ambito(richiesta), upper });
  // the gear's type: with the loads beyond prospetto 1 (6.6; under -11 any increase of T* or of the counterweight, 6.1 with
  // 6.6), the speed increased (15.3) or a new gear
  const carichi = caso(x, 'loadP1') || (x.norma === '10411-11' && caso(x, 'loadP2'));
  const sg = carichi || caso(x, 'speedUp') || gearNew;
  if (gear) checks.push({ ...daVano(x, sgTypeCheck(gear, v), 'limitatore'), ambito: ambito(sg) });
  else if (sg) checks.push(mancante(x, 'sg_type', ['impianto.safetyGear'], null, 2, 'm/s', o(true)));
  // the governor: the speed increased (15.13), a new governor (18), a new gear (6.7); its rope also with the travel lengthened (16 i))
  const gov = caso(x, 'speedUp') || govNew || gearNew, fune = caso(x, 'speedUp') || govNew || caso(x, 'travelUp');
  const origine = x.norma === '10411-1' && (caso(x, 'speedDown') || govNew);
  const scatto = g?.vScatto?.valore, tiro = g?.forzaTiro?.valore, presa = g?.forzaParacadute?.valore, rottura = g?.fune?.caricoRottura;
  if (scatto !== undefined && gear) { const e = finestraScatto(v, gear, scatto); checks.push(rtCheck(x, 'rt_gov_trip', e.status === 'ok', e.value, e.limit, 2, 'm/s', { ...o(gov), limitMin: e.limitMin })); }
  else if (gov) checks.push(mancante(x, 'rt_gov_trip', [...(scatto === undefined ? [c('vScatto')] : []), ...(gear ? [] : ['impianto.safetyGear'])], null, 2, 'm/s', o(true)));
  const lim = g?.limiteOrigine?.valore;
  if (origine || (x.norma === '10411-1' && lim !== undefined)) {
    if (scatto !== undefined && lim !== undefined) { const e = limiteOrigine(scatto, lim); checks.push(rtCheck(x, 'rt_gov_origin', e.status === 'ok', e.value, e.limit, 2, 'm/s', o(origine))); }
    else checks.push(mancante(x, 'rt_gov_origin', [...(scatto === undefined ? [c('vScatto')] : []), ...(lim === undefined ? [c('limiteOrigine')] : [])], lim ?? null, 2, 'm/s', o(true)));
  }
  if (tiro !== undefined && presa !== undefined) { const e = forzaLimitatore(tiro, presa); checks.push(rtCheck(x, 'rt_gov_force', e.status === 'ok', e.value, e.limit, 0, 'N', o(gov, false))); }
  else if (gov) checks.push(mancante(x, 'rt_gov_force', [...(tiro === undefined ? [c('forzaTiro')] : []), ...(presa === undefined ? [c('forzaParacadute')] : [])], null, 0, 'N', o(true, false)));
  if (rottura !== undefined && tiro !== undefined) { const e = funeLimitatore(rottura, tiro); checks.push(rtCheck(x, 'rt_gov_rope_sf', e.status === 'ok', e.value, e.limit, 2, '', o(fune, false))); }
  else if (fune) checks.push(mancante(x, 'rt_gov_rope_sf', [...(rottura === undefined ? [c('fune')] : []), ...(tiro === undefined ? [c('forzaTiro')] : [])], KR.govRopeSf, 2, '', o(true, false)));
  // the sheave over the rope: the design's governor, or the one of the survey (the catalogue's or typed by hand)
  if (x.base.path === 'vano') checks.push(...conId(x.base.lift?.checks ?? [], ID_LIMITATORE).map((k) => (k.id === 'v_govdd' ? { ...daVano(x, k, 'limitatore'), ambito: ambito(fune) } : daVano(x, k, 'limitatore'))));
  else {
    const m = g?.modello === 'manuale' ? null : GOVERNORS.find((k) => k.model === g?.modello);
    const dd = m ? m.R / m.rope : g?.manuale?.D !== undefined && g.manuale.d !== undefined ? g.manuale.D / g.manuale.d : null;
    if (dd !== null) checks.push({ ...daVano(x, govSheaveCheck(dd), 'limitatore'), ambito: ambito(fune) });
    else if (fune) checks.push(mancante(x, 'v_govdd', [c('modello')], null, 1, '', o(true, false)));
  }
  if (gov) punti.push(sito('limitatore', SITO_RT.contattiLimitatore));
  if (carichi && !gearNew) punti.push(sito('limitatore', SITO_RT.paracaduteCet(x.norma)));
  if (gearNew && !govNew) punti.push(sito('limitatore', SITO_RT.limitatoreCet(x.norma)));
  // T* or the counterweight decreased (6.1): a progressive gear, if there is one, with the new loads; another type, nothing
  if (caso(x, 'loadCalo')) punti.push(sito('limitatore', gear && gear !== 'progressive' ? SITO_RT.paracaduteCaloAltro(x.norma) : SITO_RT.paracaduteCalo(x.norma)));
  const stato = govNew && gearNew ? 'nuovo' : govNew || gearNew ? 'misto' : 'esistente', sGov = govNew ? 'nuovo' : 'esistente';
  const f = (k: { fonte?: Parameters<typeof fonteDi>[0] } | undefined) => fonteDi(k?.fonte, x.allegati);
  const dati = [
    dato('paracadute', gear ?? null, '', 0, gearNew ? 'nuovo' : 'esistente', 'impianto'),
    dato('modello', x.base.path === 'vano' ? x.base.lift?.layout.inputs.governor ?? null : g?.modello === 'manuale' ? null : g?.modello ?? null, '', 0, sGov, x.base.path === 'vano' ? 'progetto' : 'catalogo'),
    dato('puleggia', g?.manuale?.D ?? null, 'mm', 0, sGov, f(g?.manuale)), dato('funeDiametro', g?.manuale?.d ?? g?.fune?.d ?? null, 'mm', 1, sGov, f(g?.manuale ?? g?.fune)),
    dato('vScatto', scatto ?? null, 'm/s', 2, sGov, f(g?.vScatto)), dato('limiteOrigine', lim ?? null, 'm/s', 2, 'esistente', f(g?.limiteOrigine)),
    dato('forzaTiro', tiro ?? null, 'N', 0, sGov, f(g?.forzaTiro)), dato('forzaParacadute', presa ?? null, 'N', 0, gearNew ? 'nuovo' : 'esistente', f(g?.forzaParacadute)),
    dato('caricoRottura', rottura ?? null, 'N', 0, sGov, f(g?.fune)), dato('formazione', g?.fune?.formazione ?? null, '', 0, sGov, f(g?.fune)),
  ].filter((d) => d.valore !== null);
  return { componente: { sezione: 'limitatore', stato, dati }, checks, punti, mancanti: mancantiDi('limitatore', checks) };
}
