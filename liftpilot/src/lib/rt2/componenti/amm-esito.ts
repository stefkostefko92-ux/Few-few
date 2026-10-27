// The checks of the buffer pages (round 52): the model's own — the spring's stroke against 135·v² and 65 mm, its load
// ratio between 2,5 and 4, the hydraulic buffer's stroke against 0,0674·v² — with their corrections (both ends
// included: S1, S2; «NO» instead of FALSE: X6; no 65 mm for the hydraulic ones: H3; the reduced stroke: H2), and the
// ones the model leaves out: the rated speed of the energy-accumulation buffers (X3), the polyurethane and hydraulic
// buffers within their type-examination certificate — impact at 1,15·v and the mass on each buffer (A1, H4). The
// speed is the rated one after the modification (S4) and must be known (X1); the masses are the calculation's. Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import { KR } from '../../rt/norme';
import { conProposte, mancantiCampi, num, str, verifica } from '../campi';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, VerificaRt2 } from '../types';
import { caricoStatico, corsaMinIdraulico, datiAutan, datiIdraulico, geometriaMolla, mollaDi } from './amm-calcolo';
import { proposteAmm, type LatoAmm } from './amm-campi';

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';
const fin = (x: number | null | undefined): number | null => (x !== null && x !== undefined && Number.isFinite(x) ? x : null);

/** The mass on each buffer within the certificate's range: the car empty and loaded, or the counterweight [kg]. */
function masse(l: LatoAmm, ctx: ContestoRt2, Na: number | null, pre: string, min: number | null, max: number | null, rif: string): VerificaRt2[] {
  const { P, Q, Mcw } = ctx.dopo, per = (m: number | null): number | null => (m !== null && Na ? m / Na : null);
  const lim = min !== null && max !== null ? min : null;
  const v = (nome: string, testo: string, m: number | null): VerificaRt2 =>
    verifica(`${l.id}.${pre}${nome}`, testo, per(m), 'tra', lim, { limite2: max, unita: 'kg', dec: 0, rif });
  if (l.id === 'ammCwt') return [v('Massa', 'Massa su ogni ammortizzatore, contrappeso Mcw/Na', Mcw)];
  return [
    v('MassaVuota', 'Massa su ogni ammortizzatore, cabina vuota P/Na', P),
    v('MassaCarica', 'Massa su ogni ammortizzatore, cabina a pieno carico (P + Q)/Na', P !== null && Q !== null ? P + Q : null),
  ];
}

const urto = (id: string, v: number | null, vUrto: number | null, rif: string): VerificaRt2 =>
  verifica(id, `Velocità d'urto ${String(KR.bufImpactRatio).replace('.', ',')}·v entro quella del certificato`, v !== null ? KR.bufImpactRatio * v : null, '<=', vUrto,
    { unita: 'm/s', dec: 2, rif });
const velocitaAccumulo = (id: string, v: number | null): VerificaRt2 =>
  verifica(id, 'Velocità nominale: ammortizzatori ad accumulo di energia', v, '<=', KV_VERT.springMaxV, { unita: 'm/s', dec: 2, rif: `${T20}, 5.8.1.5` });

export function esitoAmm(l: LatoAmm, campi: readonly CampoRt2[], ctx: ContestoRt2, x0: DatiRt2): EsitoRt2 {
  const x = conProposte(x0, proposteAmm(l)()), id = (n: string): string => `${l.id}.${n}`;
  const mancanti = mancantiCampi(campi, x, ctx), avvisi: string[] = [];
  const Ftot = caricoStatico(ctx, l.id), v = ctx.dopo.v !== null && ctx.dopo.v > 0 ? ctx.dopo.v : null, Na = num(x, 'na'), tipo = str(x, 'tipo');
  if (Ftot === null) mancanti.push('calcolo.carichi');
  if (v === null) mancanti.push('calcolo.velocita');
  const Fris = Ftot !== null && Na ? Ftot / Na : null;

  if (tipo === 'molla') {
    const { g, nome } = geometriaMolla(x);
    const o = g ? mollaDi(g, Ftot ?? NaN, Na ?? NaN, v ?? NaN) : null;
    const f = fin(o?.f), fmin = fin(o?.fmin);
    return {
      mancanti, avvisi,
      verifiche: [
        verifica(id('mollaCorsa'), 'Corsa dell\'ammortizzatore a molla: f ≥ 0,135·v² e ≥ 65 mm', f, '>=', fmin !== null ? Math.max(fmin, KV_VERT.strokeMin) : null,
          { unita: 'mm', dec: 1, rif: `${T20}, 5.8.2.1.1.1` }),
        verifica(id('mollaCarichi'), 'Rapporto dei carichi Fadm/Fris', fin(o?.rapporto), 'tra', KR.springStaticMin,
          { limite2: KR.springStaticMax, dec: 2, rif: `${T20}, 5.8.2.1.1.2` }),
        velocitaAccumulo(id('mollaVelocita'), v),
      ],
      valori: {
        tipo, modello: nome, Ftot, Na, L0: g?.L0 ?? null, D: g?.Dm ?? null, d: g?.d ?? null, p: g?.p ?? null, i: fin(o?.i), vc: v, f, fmin,
        G: g?.G ?? null, Fadm: fin(o?.Fadm), Fris: fin(o?.Fris), rapporto: fin(o?.rapporto),
      },
    };
  }

  if (tipo === 'autan') {
    const a = datiAutan(x), vUrto = num(x, 'certVUrto'), mMin = num(x, 'certMassaMin'), mMax = num(x, 'certMassaMax');
    const rif = `${T20}, 5.8.2.1.2.1; ${T50}, 5.5.4`;
    return {
      mancanti, avvisi,
      verifiche: [velocitaAccumulo(id('autanVelocita'), v), urto(id('autanUrto'), v, vUrto, rif), ...masse(l, ctx, Na, 'autan', mMin, mMax, `${T50}, 5.5.4; ${T20}, 5.8.2.1.2.1`)],
      valori: {
        tipo, modello: a.nome, Ftot, Na, Fris, f: a.f, F1: a.F1, vc: v, vImpatto: v !== null ? KR.bufImpactRatio * v : null, vUrto, massaMin: mMin, massaMax: mMax,
      },
    };
  }

  if (tipo === 'idraulici') {
    const h = datiIdraulico(x), con = str(x, 'hydrSlowdown') === 'con', cm = v !== null ? corsaMinIdraulico(v, con) : null;
    // without the certificate's data, a buffer of the model's catalogue is taken at its catalogue's (H4)
    const vUrto = num(x, 'certVUrto') ?? (h.cat ? KR.bufImpactRatio * h.cat.vNomMax : null);
    const mMin = num(x, 'certMassaMin') ?? h.cat?.massaMin ?? null, mMax = num(x, 'certMassaMax') ?? h.cat?.massaMax ?? null;
    if (con) {
      avvisi.push('Con «CON» la corsa minima è quella ridotta (UNI EN 81-20:2020, 5.8.2.2.2): documenta il controllo del rallentamento ai piani '
        + 'estremi (5.12.1.3) e verifica che la velocità di contatto con l\'ammortizzatore non chieda una corsa maggiore.');
    }
    const rifCorsa = con ? `${T20}, 5.8.2.2.1 e 5.8.2.2.2` : `${T20}, 5.8.2.2.1`, rif = `${T20}, 5.8.2.2.3; ${T50}, 5.5.4`;
    return {
      mancanti, avvisi,
      verifiche: [
        verifica(id('idrCorsa'), con ? 'Corsa dell\'ammortizzatore idraulico: f ≥ corsa ridotta' : 'Corsa dell\'ammortizzatore idraulico: f ≥ 0,0674·v²', h.f, '>=',
          cm?.fmin ?? null, { unita: 'mm', dec: 1, rif: rifCorsa }),
        urto(id('idrUrto'), v, vUrto, rif), ...masse(l, ctx, Na, 'idr', mMin, mMax, `${T50}, 5.5.4; ${T20}, 5.8.2.2.3`),
      ],
      valori: {
        tipo, modello: h.nome, Ftot, Na, Fris, vc: v, f: h.f, rallentamento: con ? 'CON' : 'SENZA', fmin: cm?.fmin ?? null, fminPiena: cm?.piena ?? null,
        fminTesto: cm?.testo ?? (con ? '0,5 x (0,0674 x vc^2)' : '0,0674 x vc^2'), vImpatto: v !== null ? KR.bufImpactRatio * v : null, vUrto,
        massaMin: mMin, massaMax: mMax,
      },
    };
  }
  return { verifiche: [], mancanti, valori: {}, avvisi };
}
