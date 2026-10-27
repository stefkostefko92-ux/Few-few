// The ropes of a modification under UNI 10411-1 as the owner's rope sheet checks them (round 52, the owner's decision:
// for «Solo argano» and «Ammodernamento» the rope checks of «Calcolo argano» are the sheet's). From the model's
// computation on the calculation's values (rt2/funi-calc.ts funiDaCalcolo: the numbers of the RT's rope pages,
// rt2/funi-verifiche.ts) the checks the engine does not make: z against 12/16 with D.2 met, standing in for S_f
// (sostituite.ts); D/d of the compensation's tensioner; D.1 and D.2 as the sheet computes them always — but they are
// checks of UNI 10411-1 6.1 only with the ratio of the loads changed, and then the engine's D.1 and D.2 are counted
// (rapporto.ts tr_d1, tr_d2): with the ratio as documented, D.1 not met is «Attenzione» and D.2 only decides between z
// and S_f (14.1 c)–d)), its result information (round 52 correction of the sheet, which says «non verificato» for
// both). The number and the diameter of the ropes, D/d of the sheave and the groove's angles stay the engine's (r_nd,
// r_dd, g_geom). Only while the test takes them (ambito.ts FUNI_RT, UNI 10411-1 only); none while the values the model
// needs are missing (the calculator flags them). Registry: funi.modello.*. Pure.
import { K } from '@/calc/norme';
import type { FormValues } from '@/calc/types';
import { check } from '@/shaft/checks';
import type { ShaftCheck } from '@/shaft/types';
import { soddisfa } from '../rt2/campi';
import { funiDaCalcolo } from '../rt2/funi-calc';
import { KR2 } from '../rt2/norme';
import { ambitoOf, type Collaudo } from './collaudo';
import { rapportoChecks, rapportoVariato } from './rapporto';

/** The sheet's rope checks of the calculation's values `V` under the test `C`, in the sheet's order. */
export function funiModelloChecks(C: Collaudo, V: FormValues): ShaftCheck[] {
  if (ambitoOf(C, 'fm_d1') !== 'applies') return [];
  const m = funiDaCalcolo(V);
  if (!m) return [];
  const { input: x, out: o } = m, worst = Math.max(o.ratioLow, o.ratioHigh), d2 = soddisfa(o.pRes, '<=', o.pLim);
  const out: ShaftCheck[] = [];
  if (d2 && x.n >= K.ropesMin) out.push(check('fm_z', soddisfa(o.z, '>=', o.zMin), o.z, o.zMin, 2, ''));
  if (!rapportoVariato(C, V)) {
    out.push(check('fm_d1', Number.isFinite(worst) && soddisfa(worst, '<=', o.efa), Number.isFinite(worst) ? worst : null, o.efa, 3, '', true));
    out.push({ ...check('fm_d2', d2, o.pRes, o.pLim, 2, 'MPa'), ...(d2 ? {} : { status: 'info' as const }) });
  }
  if (o.compRatio !== null) out.push(check('fm_comp', soddisfa(o.compRatio, '>=', KR2.compDd), o.compRatio, KR2.compDd, 1, ''));
  return out;
}

/** The checks of a modification the calculation's values bring beside the engine's: D.1 and D.2 of a changed ratio
 *  (rapporto.ts), then the sheet's rope checks — as the lift design, sheet 1 and the relazioni take them. */
export const verificheModifica = (C: Collaudo, V: FormValues): ShaftCheck[] => [...rapportoChecks(C, V), ...funiModelloChecks(C, V)];
