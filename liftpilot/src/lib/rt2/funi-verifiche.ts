// The checks of the owner's rope sheet (round 52) with their limits and clauses, shared by the RT's rope pages and the
// «Calcolo argano» of a modification: the number and the diameter of the ropes, z against 12 or 16, D/d of the sheave
// and of the compensation's tensioner, the groove's angles, D.1 in its two cases and D.2. Where the model stops short of
// the standard, the corrections the norm expert gave (round 52, answers 1 and 2): with D.2 not met, 12/16 do not stand in
// for the safety factor of UNI EN 81-50:2020 5.12, which the calculation computes (r_sfa); a machine replaced shows the
// traction of UNI EN 81-50:2020 5.11 in its three conditions, which the calculation computes (tr_load, tr_dn, tr_up,
// tr_stall). Pure.
import { K } from '@/calc/norme';
import type { Check, CheckId, FormValues, Results } from '@/calc/types';
import type { Norma10411 } from '../lift/modifica';
import { rifCalcolo } from './rif-calcolo';
import { verifica } from './campi';
import type { FuniIn, FuniOut } from './funi-core';
import { KR2 } from './norme';
import type { VerificaRt2 } from './types';

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020', U1 = 'UNI 10411-1:2024';

/** The checks of UNI EN 81-50 5.11 the calculation computes, as the RT prints them. */
export const ADERENZA: readonly { id: CheckId; testo: string }[] = [
  { id: 'tr_load', testo: 'Aderenza al caricamento con 1,25·Q' },
  { id: 'tr_dn', testo: 'Aderenza in frenatura di emergenza, cabina in discesa' },
  { id: 'tr_up', testo: 'Aderenza in frenatura di emergenza, cabina in salita' },
  { id: 'tr_stall', testo: 'Aderenza con contrappeso o cabina bloccati' },
];

/** A check of the calculation as the RT's check: met, not met or with «Attenzione» as the calculation says; its
 *  utilisation (≤ 1) as the value. */
function daCalcolo(c: Check | undefined, id: string, testo: string, rif: string, conf: '<=' | '>='): VerificaRt2 | null {
  if (!c || c.status === 'info') return null;
  const util = conf === '<=';
  return {
    id, testo, valore: util ? c.util : c.value, limite: util ? 1 : c.limit, confronto: conf, unita: '', dec: 2,
    esito: c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'warn' : 'fail', rif,
  };
}

/** The rope checks on the model's computation `o` of `x`, with the calculation (its values `V`, its results `res`) for
 *  the corrections (none when the calculation does not derive: then the RT lists them as missing), under `norma`. */
export function verificheFuni(x: FuniIn, o: FuniOut, V: FormValues, res: Results | null, norma: Norma10411): VerificaRt2[] {
  const out: VerificaRt2[] = [
    verifica('funi.numero', 'Numero delle funi di trazione', x.n, '>=', K.ropesMin, { dec: 0, rif: `${T20}, 5.5.1.2` }),
    verifica('funi.diametro', 'Diametro delle funi di trazione', x.d, '>=', K.ropeDiameterMin, { unita: 'mm', dec: 1, rif: `${T20}, 5.5.1.2 a)` }),
    verifica('funi.z', 'Coefficiente di sicurezza delle funi z', x.n >= K.ropesMin ? o.z : null, '>=', o.zMin, { dec: 2, rif: `${T20}, 5.5.2.2; ${U1}, 14.1 c) e d)` }),
    verifica('funi.Dd', 'Rapporto diametri puleggia di frizione / fune D/d', o.dRatio, '>=', K.ddMin, { dec: 1, rif: `${T20}, 5.5.2.1; ${U1}, 14.3` }),
  ];
  if (o.compRatio !== null) {
    out.push(verifica('funi.compDd', 'Rapporto diametri puleggia tenditrice / fune di compensazione', o.compRatio, '>=', KR2.compDd, { dec: 1, rif: `${T20}, 5.5.6` }));
  }
  const gr = x.gola;
  if (gr.type === 'VH' || gr.type === 'VN') out.push(verifica('funi.gamma', 'Angolo della gola a cuneo γ', gr.gamma, '>=', K.gammaMin, { unita: '°', dec: 1, rif: `${T50}, 5.11.2.3.1.2` }));
  if (gr.type === 'UU' || gr.type === 'VN') out.push(verifica('funi.beta', 'Angolo del sottosquadro β', gr.beta, '<=', K.betaMax, { unita: '°', dec: 1, rif: `${T50}, 5.11.2.3.1.1` }));
  const d1 = (id: string, testo: string, r: number): VerificaRt2 => verifica(id, testo, Number.isFinite(r) ? r : null, '<=', o.efa, { dec: 3, rif: `${U1}, D.1` });
  out.push(
    d1('funi.d1Basso', 'Stabilità allo scorrimento, cabina in basso con sovraccarico: (T1/T2)·C1·C2 ≤ e^(f·α)', o.ratioLow),
    d1('funi.d1Alto', 'Stabilità allo scorrimento, cabina in alto senza carico: (T1/T2)·C1·C2 ≤ e^(f·α)', o.ratioHigh),
  );
  const d2 = verifica('funi.d2', 'Pressione specifica nelle gole', o.pRes, '<=', o.pLim, { unita: 'N/mm²', dec: 2, rif: `${U1}, D.2` });
  out.push(d2);
  const ck = (id: CheckId): Check | undefined => res?.checks.find((c) => c.id === id);
  // 12/16 stand in for S_f only with D.2 met (UNI 10411-1:2024, 14.1 c)–d)): otherwise the calculation's S_f
  if (d2.esito !== 'ok') {
    const sf = daCalcolo(ck('r_sfa'), 'funi.sf', 'Coefficiente di sicurezza S_f (pressione specifica non verificata)', rifCalcolo('r_sfa', V, norma), '>=');
    if (sf) out.push(sf);
  }
  for (const a of ADERENZA) {
    const v = daCalcolo(ck(a.id), `funi.${a.id}`, a.testo, rifCalcolo(a.id, V, norma), '<=');
    if (v) out.push(v);
  }
  return out;
}
