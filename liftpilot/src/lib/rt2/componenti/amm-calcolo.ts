// The buffer sheets of the owner's model (round 52) as numbers: the spring's (its geometry from the catalogue or by
// hand, the model's coils, stroke and force, the load per buffer and the ratio), the hydraulic buffer's (the stroke of
// the catalogue or by hand against 0,0674·v², or the reduced one with the slowdown monitored) and the polyurethane
// («autan») buffer's data, which the model never computes. The model's formulas in its order (golden tests compare them
// to 1e-9); its corrections: the rated speed after the modification for every type (S4: the model's spring sheet took
// the speed before with VVVF), the catalogue row 78.026 (S6, cataloghi/ammortizzatori.ts), the reduced stroke with its
// floors and 1/3 (H2). Pure.
import { K } from '@/calc/norme';
import { KV_VERT } from '@/shaft/norme-vert';
import { num, str } from '../campi';
import { autanCat, idraulicoCat, mollaCat, type IdraulicoCat } from '../cataloghi/ammortizzatori';
import { K_AMM } from '../norme-amm';
import type { ContestoRt2, DatiRt2 } from '../types';

export type LatoId = 'ammCabina' | 'ammCwt';
export type TipoAmm = 'molla' | 'autan' | 'idraulici';
export const isTipoAmm = (x: unknown): x is TipoAmm => x === 'molla' || x === 'autan' || x === 'idraulici';

/** The static load on the buffers of a side [N]: the car with its rated load, or the counterweight (the model's
 *  ('Dati Generali'!D72 + D84)·9,81 and D86·9,81; the hydraulic sheet adds D84 + D72: the same sum); null without the
 *  masses. */
export function caricoStatico(ctx: ContestoRt2, lato: LatoId): number | null {
  const { Q, P, Mcw } = ctx.dopo;
  if (lato === 'ammCwt') return Mcw === null ? null : Mcw * K.g;
  return Q === null || P === null ? null : (Q + P) * K.g;
}

/** The spring's geometry: mean diameter, wire, free length, pitch [mm], shear modulus [N/mm²]. */
export interface Geometria {
  Dm: number;
  d: number;
  L0: number;
  p: number;
  G: number;
}

/** The geometry of the spring chosen: a catalogue's row (its pitch, or (L0 − 1,5·d)/n as the model derives it) or the
 *  data entered with «altro»; null while incomplete. */
export function geometriaMolla(x: DatiRt2): { g: Geometria | null; nome: string | null } {
  const sel = str(x, 'springModel');
  if (sel === 'altro') {
    const [Dm, d, L0, p, G] = ['springDm', 'springWire', 'springL0', 'springPitch', 'springG'].map((id) => num(x, id));
    return { g: Dm !== null && d !== null && L0 !== null && p !== null && G !== null ? { Dm, d, L0, p, G } : null, nome: null };
  }
  const m = sel ? mollaCat(sel) : null;
  if (!m) return { g: null, nome: null };
  const p = m.p ?? (m.n !== null ? (m.L0 - m.d * K_AMM.spireEstremi) / m.n : null);
  return { g: p === null ? null : { Dm: m.Dm, d: m.d, L0: m.L0, p, G: m.G }, nome: m.nome };
}

/** The model's spring sheet, cells I56…I84. */
export interface MollaOut {
  Ftot: number;
  Na: number;
  i: number;
  vc: number;
  f: number;
  fmin: number;
  Fadm: number;
  Fris: number;
  rapporto: number;
}

export function mollaDi(g: Geometria, Ftot: number, Na: number, vc: number): MollaOut {
  const i = (g.L0 - g.d * K_AMM.spireEstremi) / g.p;
  const f = g.L0 - g.d * (1 + K_AMM.frecciaSpire * i);
  const fmin = KV_VERT.strokeK * 1000 * vc ** 2;
  const Fadm = (f * g.G * g.d ** 4) / (8 * g.Dm ** 3 * i);
  const Fris = Ftot / Na;
  return { Ftot, Na, i, vc, f, fmin, Fadm, Fris, rapporto: Fadm / Fris };
}

/** The polyurethane buffer chosen: its name and code, its stroke [mm] and linearised maximum load [N] (the catalogue's
 *  or the ones entered with «altro»). */
export function datiAutan(x: DatiRt2): { nome: string | null; f: number | null; F1: number | null } {
  const sel = str(x, 'autanModel');
  if (sel === 'altro') return { nome: null, f: num(x, 'autanStroke'), F1: num(x, 'autanF1') };
  const a = sel ? autanCat(sel) : null;
  return a ? { nome: `${a.nome} (${a.codice})`, f: a.fMax, F1: a.F1 } : { nome: null, f: null, F1: null };
}

/** The hydraulic buffer chosen: the catalogue's row (null with «altro») and its stroke [mm]. */
export function datiIdraulico(x: DatiRt2): { cat: IdraulicoCat | null; nome: string | null; f: number | null } {
  const sel = str(x, 'hydrModel');
  if (sel === 'altro') return { cat: null, nome: null, f: num(x, 'hydrStroke') };
  const c = sel ? idraulicoCat(sel) : null;
  return { cat: c, nome: c ? `${c.codice} (${c.tipo})` : null, f: c ? c.corsa : null };
}

/** The least stroke of a hydraulic buffer at vc [m/s] [mm]: 0,0674·vc² (the model's Y67); with the slowdown monitored
 *  («CON», UNI EN 81-20:2020 5.8.2.2.2) the reduced one — K_AMM.ridotta1 of it up to K_AMM.ridottaSoglia m/s, a third
 *  over (the model: 0,333), never under K_AMM.ridottaMin1/ridottaMin2 mm (the model: none), never over the full one —
 *  and the text the page prints after «fmin =». */
export function corsaMinIdraulico(vc: number, con: boolean): { fmin: number; piena: number; testo: string } {
  const piena = 1000 * KV_VERT.oilStrokeK * vc ** 2;
  if (!con) return { fmin: piena, piena, testo: '0,0674 x vc^2' };
  const basso = vc <= K_AMM.ridottaSoglia;
  const k = basso ? K_AMM.ridotta1 : 1 / K_AMM.ridotta2Den, floor = basso ? K_AMM.ridottaMin1 : K_AMM.ridottaMin2;
  const ridotta = 1000 * k * (KV_VERT.oilStrokeK * vc ** 2);
  return { fmin: Math.min(piena, Math.max(ridotta, floor)), piena, testo: basso ? '0,5 x (0,0674 x vc^2)' : '1/3 x (0,0674 x vc^2)' };
}
