// «Cabina» of the RT after the owner's model (sheet «Cabina», one page): the new car's materials, its area and
// capacity, the static load of the car side before and after the modification and the verdict on its change. The loads,
// the travel, the roping, the machine room and the new ropes are the context's (one value, one place); the page asks the
// old ropes only when the calculation has no existing machine (they serve the model's printed rope tension), and the
// car's safety gear (shared with «Limitatore di velocità»). The model's formulas are computed as it has them
// (cabina-carichi.ts); the verdict is LiftPilot's on T* = P + Q and the rated load (UNI 10411-1:2024 6.1, prospetto 1,
// E-C1), the area and the passengers of a new car checked (prospetti 6 and 8, E-C21), the gear's type for the speed
// (E-C23). Pure.
import { maxArea, passengers } from '@/shaft/area';
import { ROUNDING_KG } from '../../lift/modifica';
import { fmt, mancantiCampi, verifica } from '../campi';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, VerificaRt2 } from '../types';
import { caricoModello, funiPreesistentiDaCalcolo, ingressoModello, statoCarico, type StatoCarico } from './cabina-carichi';
import { pagineCabina } from './cabina-pagina';
import { avvisiParacadute, campoParacadute, paracaduteDi, verificaTipoParacadute } from './cabina-paracadute';

const senzaFuniCalcolo = (_x: DatiRt2, ctx: ContestoRt2): boolean => funiPreesistentiDaCalcolo(ctx) === null;

const CAMPI: readonly CampoRt2[] = [
  { id: 'g_funiPrees', t: 'gruppo', label: 'Funi preesistenti', show: senzaFuniCalcolo },
  { id: 'funiPreesNumero', t: 'num', label: 'Numero funi di trazione:', min: 1, max: 20, step: 1, int: true, show: senzaFuniCalcolo },
  { id: 'funiPreesMassa', t: 'num', label: 'indicare la massa lineica:', unit: 'kg/m', min: 0.05, max: 5, step: 0.001, show: senzaFuniCalcolo },
  { id: 'g_paracadute', t: 'gruppo', label: 'Paracadute di cabina' },
  campoParacadute((_x, ctx) => ctx.parti.includes('safetyGear')),
];

const U1 = 'UNI 10411-1:2024', T20 = 'UNI EN 81-20:2020';
const pct = (x: number | null): string => fmt(x === null ? null : x * 100, 0);

/** The load's changes as information (beyond the tolerance the RT asks the components' checks: never a failure). */
function verificheCarico(ctx: ContestoRt2, s: StatoCarico): VerificaRt2[] {
  const uno = ctx.norma === '10411-1', rif = uno ? `${U1}, 6.1 (prospetto 1)` : 'UNI 10411-11:2024, 6.1';
  const out = [verifica('cabina.varT', 'Variazione del carico statico T* = P + Q', s.dT * 100, '<=', (s.tolT ?? 0) * 100, { unita: '%', dec: 1, info: true, rif })];
  if (s.tolQ !== null) out.push(verifica('cabina.varQ', 'Variazione della portata', s.dQ * 100, '<=', s.tolQ * 100, { unita: '%', dec: 1, info: true, rif }));
  return out;
}

/** A new car of a passenger lift: its area within prospetto 6 and its persons within prospetto 8; a car that stays with
 *  its rated load changed: its documented area over the new maximum is an attention (never a failure). */
function verificheSuperficie(ctx: ContestoRt2, s: StatoCarico | null): VerificaRt2[] {
  const Q = ctx.dopo.Q, S = ctx.dopo.superficie, n = ctx.dopo.capienza;
  if (ctx.ascensorePer !== 'persone' || Q === null) return [];
  if (ctx.parti.includes('car')) {
    const out = [verifica('cabina.superficie', 'Superficie utile della cabina', S, '<=', maxArea(Q), { unita: 'm²', dec: 2, rif: `${T20}, 5.4.2.1.1 (prospetto 6)` })];
    out.push(verifica('cabina.capienza', 'Capienza della cabina', n, '<=', S === null ? null : passengers(Q, S), { unita: 'persone', dec: 0, rif: `${T20}, 5.4.2.3.1 (prospetto 8)` }));
    return out;
  }
  if (!s || Math.abs(s.qNew - s.qOld) <= ROUNDING_KG || S === null) return [];
  const entro = S <= maxArea(Q) + 1e-9;
  return [verifica('cabina.superficieEsistente', 'Superficie utile della cabina che resta, per la nuova portata', S, '<=', maxArea(Q),
    { unita: 'm²', dec: 2, info: entro, warn: true, rif: `${T20}, 5.4.2.1.1 (prospetto 6; lettura del software)` })];
}

/** The model's screen notes, corrected: the new car's mass within prospetto 1 (Q15:V19, E-C7), the rated load beyond its
 *  tolerance (J15, E-C8), whether calculations are needed (W10:W13 with the row by the rated load, E-C9). */
function avvisiCarico(ctx: ContestoRt2, s: StatoCarico): string[] {
  const out: string[] = [], uno = ctx.norma === '10411-1';
  if (uno && s.tolT !== null) out.push(`Per restare entro il prospetto 1 la nuova cabina può pesare al massimo ${fmt(s.pMax, 0)} kg e, per non diminuire il carico statico, almeno ${fmt(s.pMin, 0)} kg.`);
  if (s.tolQ !== null && s.dQ > s.tolQ + 1e-9) out.push(`ATTENZIONE, PORTATA ECCEDE ${pct(s.tolQ)}%`);
  const servono = s.p1 || s.calo || s.rapporto || s.dT > (s.tolT ?? 0) + 1e-9;
  out.push(`${servono ? 'Servono le verifiche di calcolo' : 'Non servono verifiche di calcolo'} secondo la ${uno ? 'UNI 10411.1' : 'UNI 10411-11'}`);
  return out;
}

function calcola(ctx: ContestoRt2, x: DatiRt2): EsitoRt2 {
  const ing = ingressoModello(ctx, x), m = ing ? caricoModello(ing) : null, s = statoCarico(ctx), par = paracaduteDi(x);
  const verifiche: VerificaRt2[] = [...(s ? verificheCarico(ctx, s) : []), ...verificheSuperficie(ctx, s)];
  const vp = verificaTipoParacadute(par, ctx);
  if (vp) verifiche.push(vp);
  const d = ctx.dopo, persone = ctx.ascensorePer === 'persone' && ctx.parti.includes('car');
  const base = [
    ...(d.Q === null || d.P === null ? ['calcolo.carichi'] : []), ...(d.H === null ? ['calcolo.corsa'] : []),
    ...(d.Q !== null && d.P !== null && d.H !== null && !ing ? ['calcolo.funi'] : []),
    ...(persone && d.superficie === null ? ['tecnici.dopo.superficie'] : []), ...(persone && d.capienza === null ? ['tecnici.dopo.capienza'] : []),
  ];
  return {
    verifiche, mancanti: [...mancantiCampi(CAMPI, x, ctx), ...base],
    avvisi: [...(s ? avvisiCarico(ctx, s) : []), ...avvisiParacadute(par, d.v)],
    valori: {
      pfOld: m?.pfOld ?? null, pfNew: m?.pfNew ?? null, Told: m?.Told ?? null, Tnew: m?.Tnew ?? null, varTModello: m?.varT ?? null,
      varQModello: m?.varQ ?? null, pMaxModello: m?.pMax ?? null, pMinModello: m?.pMin ?? null, nOld: ing?.nOld ?? null, mOld: ing?.mOld ?? null,
      TsOld: s?.TsOld ?? null, TsNew: s?.TsNew ?? null, dT: s ? s.dT * 100 : null, dQ: s ? s.dQ * 100 : null, pMax: s?.pMax ?? null, pMin: s?.pMin ?? null,
      paracadute: par?.t ?? null,
    },
  };
}

export const CABINA: ModuloRt2 = { id: 'cabina', titolo: 'Cabina', campi: CAMPI, calcola, pagine: pagineCabina };
