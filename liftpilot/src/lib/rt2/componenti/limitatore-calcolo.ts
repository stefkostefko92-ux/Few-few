// The overspeed governor of the owner's model (sheet «Limitatore», round 52): its rope and governor from the model's
// lists or typed («altro»), the safety factor of the rope, the sheave over the rope, the tripping speed's window by the
// car's safety gear — its formulas in its order (golden: rt2-cqpl.test.ts) — and the corrections: the window of UNI EN
// 81-20:2020 5.6.2.2.1.1 a) by the rated speed (the progressive gear's 1,25·v + 0,25/v over 1 m/s, the model's
// 1,25·(v + 0,25/v) and its band chosen by hand: E-L1), the «altro» governor's sheave read (E-L3) and the ratio over the
// rope's own diameter (E-L4), the model's screen checks printed with their outcome (E-L6), the governor's force against
// the gear's (5.6.2.2.1.1 d), E-L2) and the plate tripping speed in the window (E-L7) — the first RT's rules
// (rt/componenti/limitatore.ts) on the same registries (KR, KV_GOV). Pure.
import { tripWindow } from '@/shaft/governor';
import { KV_GOV } from '@/shaft/norme-limitatore';
import { KR } from '../../rt/norme';
import { finestraScatto, forzaLimitatore } from '../../rt/componenti/limitatore';
import { num, str, verifica } from '../campi';
import { FUNE_ALTRA, FUNI_LIMITATORE, LIMITATORE_ALTRO, LIMITATORI, voceDi, type Paracadute } from '../cataloghi/cqpl';
import { K_CQPL } from '../norme-cqpl';
import type { ContestoRt2, DatiRt2, VerificaRt2 } from '../types';

/** The model's values of the governor's page (Limitatore!H65:H90, W72) and LiftPilot's window. */
export interface LimitatoreOut {
  tipo: string;
  /** rope: diameter [mm], strands, construction, breaking load [N]; «altro fornitore» typed */
  d: number | null;
  trefoli: number | null;
  formazione: string | null;
  FRm: number | null;
  altraFune: boolean;
  /** the governor's tensile force [N] («Forza di trazione» Fad), its sheave [mm] */
  Fad: number | null;
  Dpul: number | null;
  /** FRm/Fad, 30·d [mm], the sheave over the rope */
  x: number | null;
  Dmin: number | null;
  rapportoD: number | null;
  /** rated speed, 115 % of it, the model's upper limit (H90) and the standard's [m/s] */
  v: number | null;
  vMin: number | null;
  vMaxModello: number | null;
  vMax: number | null;
}

/** The model's H90 for its gear item `p` at the rated speed `v` (S93:S96 as it has them). */
export function vMaxModello(p: Paracadute, v: number): number {
  return p.vMaxModello === 'S96' ? KV_GOV.govTripK * (v + KV_GOV.govTripC / v) : p.vMaxModello;
}

export function limitatoreDi(ctx: ContestoRt2, x: DatiRt2, p: Paracadute | null): LimitatoreOut {
  const g = voceDi(LIMITATORI, str(x, 'tipo')), altro = str(x, 'tipo') === LIMITATORE_ALTRO.v;
  const f = voceDi(FUNI_LIMITATORE, str(x, 'fune')), altraFune = str(x, 'fune') === FUNE_ALTRA.v;
  const d = altraFune ? num(x, 'funeDiametro') : f?.d ?? null; // H65
  const Fad = altro ? num(x, 'altroForza') : g?.forzaAz ?? null; // H73
  const FRm = altraFune ? num(x, 'funeRottura') : f?.rottura ?? null; // H75
  const Dpul = altro ? num(x, 'altroDiametro') : g?.dPuleggia ?? null; // W72 (the model 0 for «altro»: E-L3)
  const v = ctx.dopo.v;
  return {
    tipo: altro ? LIMITATORE_ALTRO.t : g?.t ?? '—', d, altraFune, FRm, Fad, Dpul,
    trefoli: altraFune ? num(x, 'funeTrefoli') : f?.trefoli ?? null, formazione: altraFune ? str(x, 'funeFormazione') : f?.formazione ?? null,
    x: FRm !== null && Fad ? FRm / Fad : null, // H77
    Dmin: d !== null ? KV_GOV.govSheaveRatio * d : null, // H79
    rapportoD: Dpul !== null && d ? Dpul / d : null, // H81 over the rope's own diameter (E-L4)
    v, vMin: v !== null ? v * KV_GOV.govTripMin : null, // H85, H87
    vMaxModello: p && v ? vMaxModello(p, v) : null, // H90
    vMax: p && v ? tripWindow(v, p.gear).hi : null,
  };
}

/** Under UNI 10411-1 a new governor (18) or the speed reduced (15.17 with 15.16) trips within the limits of the rule in
 *  force at the installation, in any case (its note 9: D.Lgt. 600/1945, DPR 1497/1963, DM 587/1987 before UNI EN
 *  81-1:1999): the engineer states that limit with its source (round 52, norm expert's answer 8; the first RT's
 *  rt_gov_origin) — their values are not in the software. */
export const origineRichiesta = (ctx: ContestoRt2): boolean => ctx.norma === '10411-1' && (ctx.parti.includes('governor') || !!ctx.velocita?.calo);

/** The governor's checks are the RT's requirement with the governor or the gear replaced or the speed changed; else
 *  information on the existing one. */
export const limitatoreRichiesto = (ctx: ContestoRt2): boolean =>
  ctx.parti.includes('governor') || ctx.parti.includes('safetyGear') || !!ctx.velocita?.variata;

const T20 = 'UNI EN 81-20:2020';

export function verificheLimitatore(ctx: ContestoRt2, x: DatiRt2, o: LimitatoreOut, p: Paracadute | null): VerificaRt2[] {
  const info = !limitatoreRichiesto(ctx), presa = num(x, 'forzaPresa'), scatto = num(x, 'vScatto');
  const out = [
    // 6 mm is UNI EN 81-1's (9.9.6.3), not UNI EN 81-20:2020's: «Attenzione», never a check not met (norm expert's
    // answer 9)
    verifica('limitatore.funeDiametro', 'Diametro della fune del limitatore', o.d, '>=', K_CQPL.funeLimDiamMin,
      { unita: 'mm', dec: 1, info, warn: true, rif: 'UNI EN 81-1:1998, 9.9.6.3 (non nella UNI EN 81-20:2020)' }),
    verifica('limitatore.funeSicurezza', 'Coefficiente di sicurezza della fune x = FRm/Fad', o.x, '>=', KR.govRopeSf, { dec: 1, info, rif: `${T20}, 5.6.2.2.1.3 b)` }),
    verifica('limitatore.Dd', 'Rapporto diametri puleggia del limitatore / fune', o.rapportoD, '>=', KV_GOV.govSheaveRatio, { dec: 2, info, rif: `${T20}, 5.6.2.2.1.3 c)` }),
  ];
  const forza = o.Fad !== null && presa !== null ? forzaLimitatore(o.Fad, presa) : null;
  out.push(verifica('limitatore.forza', 'Forza di trazione del limitatore all\'intervento', o.Fad, '>=', forza?.limit ?? null,
    { unita: 'N', dec: 0, info, rif: `${T20}, 5.6.2.2.1.1 d)` }));
  const w = p && o.v !== null && scatto !== null ? finestraScatto(o.v, p.gear, scatto) : null;
  out.push({
    id: 'limitatore.scatto', testo: 'Velocità d\'intervento del limitatore', valore: scatto, limite: w?.limitMin ?? null, limite2: w?.limit ?? null,
    confronto: 'tra', unita: 'm/s', dec: 2, esito: info ? 'info' : w?.status === 'ok' ? 'ok' : 'fail', rif: `${T20}, 5.6.2.2.1.1 a)`,
  });
  if (origineRichiesta(ctx)) {
    const fonte = str(x, 'fonteOrigine');
    out.push(verifica('limitatore.origine', 'Velocità d\'intervento entro il limite della regola all\'installazione', scatto, '<=', num(x, 'limiteOrigine'),
      { unita: 'm/s', dec: 2, rif: `UNI 10411-1:2024, 18 e 15.17${fonte ? `; ${fonte}` : ''}` }));
  }
  return out;
}
