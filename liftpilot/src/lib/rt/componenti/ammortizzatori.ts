// The buffers in the relazione tecnica di modifica (RT plan §4.5), car and counterweight in one section, each side by its
// type: the type for the rated speed and the stroke it needs (b_type, b_car, b_cw: the design's on the shaft path,
// strokeFor on the room path's data; registry ammortizzatori.*); springs, the force at full compression between
// KR.springStaticMin and KR.springStaticMax times the static load on each buffer (rt_buf_spring, UNI EN 81-20:2020,
// 5.8.2.1.1.2); polyurethane and hydraulic ones by their type certificate — the masses on each buffer, the car empty and
// loaded or the counterweight, within its range (rt_buf_mass, the empty car the software's reading), and the impact at
// KR.bufImpactRatio times the rated speed within its maximum (rt_buf_speed). The rated speed is the design's after the
// modification. Pure.
import { bufferStroke, bufferType, maxSpeed, strokeFor } from '@/shaft/buffers';
import { check } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import type { BufferType } from '@/shaft/vertical';
import { KR } from '../norme';
import type { PuntoRt, RtCheck } from '../types';
import { conId, daVano, dato, fonteDi, mancante, mancantiDi, nuova, rtCheck, type RtCtx } from './comune';
import type { Esito, EsitoSezione } from './esito';
import { SITO_RT, sito } from './punti';

const G = 9.81;
const dentro = (x: number, min: number, max: number): boolean => x >= min - 1e-9 && x <= max + 1e-9;

/** rt_buf_spring: the force at full compression F [N] over the static load on each of n buffers of `massa` [kg]. */
export function molla(F: number, massa: number, n: number): Esito {
  const r = F / ((massa * G) / n);
  return { status: dentro(r, KR.springStaticMin, KR.springStaticMax) ? 'ok' : 'fail', value: r, limit: KR.springStaticMax, limitMin: KR.springStaticMin };
}
/** rt_buf_mass: a mass on a buffer [kg] within its certificate's range. */
export const massaCertificata = (m: number, min: number, max: number): Esito => ({ status: dentro(m, min, max) ? 'ok' : 'fail', value: m, limit: max, limitMin: min });
/** rt_buf_speed: the impact at KR.bufImpactRatio times the rated speed v within the certificate's maximum [m/s]. */
export function velocitaUrto(v: number, vMax: number): Esito {
  const u = KR.bufImpactRatio * v;
  return { status: u <= vMax + 1e-9 ? 'ok' : 'fail', value: u, limit: vMax };
}

type Lato = 'cabina' | 'contrappeso';
interface DatiLato { tipo?: BufferType; numero?: number; corsa?: number; altezza?: number; F?: number; cert?: { numero?: string; vMax?: number; massaMin?: number; massaMax?: number } }

/** A side's buffers: the design's type, number and stroke on the shaft path (one under the counterweight, as sheet 1
 *  counts it), the RT's data on the room path; the force and the certificate always the RT's. */
function lato(x: RtCtx, l: Lato): DatiLato {
  const a = x.inputs.componenti?.ammortizzatori?.[l], V = x.base.lift?.layout.inputs.vertical, s = l === 'cabina' ? 'car' : 'cw';
  const cert = a?.certificato, own = { ...(a?.forzaCorsaCompleta !== undefined ? { F: a.forzaCorsaCompleta } : {}), ...(cert ? { cert } : {}) };
  if (x.base.path === 'vano' && V) {
    return { tipo: bufferType(V, s), numero: s === 'car' ? V.carBuffers : 1, corsa: bufferStroke(V, s), altezza: s === 'car' ? V.carBufferH : V.cwBufferH, ...own };
  }
  const corsa = a?.tipo === 'pu' && a.altezza !== undefined ? Math.round(KV_VERT.puStroke * a.altezza) : a?.corsa;
  return { ...(a?.tipo ? { tipo: a.tipo } : {}), ...(a?.numero !== undefined ? { numero: a.numero } : {}), ...(corsa !== undefined ? { corsa } : {}),
    ...(a?.altezza !== undefined ? { altezza: a.altezza } : {}), ...own };
}

export function ammortizzatori(x: RtCtx): EsitoSezione {
  const v = x.I.v, P = x.I.P, Q = x.I.Q, checks: RtCheck[] = [], punti: PuntoRt[] = [sito('ammortizzatori', SITO_RT.fondoFossa)];
  const o = { sezione: 'ammortizzatori' as const, ambito: 'richiesta' as const, upper: true }, campo = (l: Lato, f: string): string => `componenti.ammortizzatori.${l}.${f}`;
  const lati = { cabina: lato(x, 'cabina'), contrappeso: lato(x, 'contrappeso') }, tipi = [lati.cabina.tipo, lati.contrappeso.tipo].filter((t): t is BufferType => !!t);
  if (x.base.path === 'vano') {
    const L = x.base.lift?.checks ?? [];
    checks.push(...conId(L, ['b_type', 'b_car', 'b_cw']).map((c) => ({ ...daVano(x, c, 'ammortizzatori', c.id === 'b_car' ? tipi.slice(0, 1) : c.id === 'b_cw' ? tipi.slice(1) : tipi), ambito: 'richiesta' as const })));
  } else {
    // the type for the speed (the stricter side) and each side's stroke, as the shaft's section checks them
    const lim = tipi.map(maxSpeed).filter((m): m is number => m !== null), vmax = lim.length ? Math.min(...lim) : null;
    checks.push(tipi.length < 2 ? mancante(x, 'b_type', (['cabina', 'contrappeso'] as const).filter((l) => !lati[l].tipo).map((l) => campo(l, 'tipo')), vmax, 2, 'm/s', o)
      : { ...daVano(x, check('b_type', vmax === null || v <= vmax + 1e-9, v, vmax, 2, 'm/s'), 'ammortizzatori', tipi), ambito: 'richiesta' });
    for (const [l, id] of [['cabina', 'b_car'], ['contrappeso', 'b_cw']] as const) {
      const d = lati[l], need = d.tipo ? strokeFor(v, d.tipo) : null;
      checks.push(d.tipo && d.corsa !== undefined && need !== null
        ? { ...daVano(x, check(id, d.corsa >= need - 1e-9, d.corsa, need > 0 ? Math.ceil(need) : null, 0, 'mm'), 'ammortizzatori', [d.tipo]), ambito: 'richiesta' }
        : mancante(x, id, [...(d.tipo ? [] : [campo(l, 'tipo')]), ...(d.corsa === undefined ? [campo(l, d.tipo === 'pu' ? 'altezza' : 'corsa')] : [])], null, 0, 'mm', { ...o, upper: false }));
    }
  }
  for (const l of ['cabina', 'contrappeso'] as const) {
    const d = lati[l], n = d.numero, masse: [string, number][] = l === 'cabina' ? [['vuota', P], ['carica', P + Q]] : [['contrappeso', x.Mcw]];
    if (d.tipo === 'spring') {
      const m = masse[masse.length - 1][1];
      if (d.F === undefined || n === undefined) checks.push(mancante(x, 'rt_buf_spring', [...(d.F === undefined ? [campo(l, 'forzaCorsaCompleta')] : []), ...(n === undefined ? [campo(l, 'numero')] : [])], KR.springStaticMax, 2, '', { ...o, caso: l, limitMin: KR.springStaticMin }));
      else { const e = molla(d.F, m, n); checks.push(rtCheck(x, 'rt_buf_spring', e.status === 'ok', e.value, e.limit, 2, '', { ...o, caso: l, limitMin: e.limitMin })); }
    } else if (d.tipo) {
      const c = d.cert;
      if (c?.massaMin === undefined || c.massaMax === undefined || n === undefined) checks.push(mancante(x, 'rt_buf_mass', [...(n === undefined ? [campo(l, 'numero')] : []), campo(l, 'certificato')], null, 0, 'kg', { ...o, caso: l }));
      else for (const [k, m] of masse) { const e = massaCertificata(m / n, c.massaMin, c.massaMax); checks.push(rtCheck(x, 'rt_buf_mass', e.status === 'ok', e.value, e.limit, 0, 'kg', { ...o, caso: l === 'cabina' ? `cabina ${k}` : l, limitMin: e.limitMin })); }
      if (c?.vMax === undefined) checks.push(mancante(x, 'rt_buf_speed', [campo(l, 'certificato')], null, 2, 'm/s', { ...o, caso: l }));
      else { const e = velocitaUrto(v, c.vMax); checks.push(rtCheck(x, 'rt_buf_speed', e.status === 'ok', e.value, e.limit, 2, 'm/s', { ...o, caso: l })); }
    }
  }
  if (tipi.includes('oil')) punti.push(sito('ammortizzatori', SITO_RT.ritornoIdraulici));
  const stato = nuova(x, 'buffers') ? 'nuovo' : 'esistente', src = fonteDi(x.inputs.componenti?.ammortizzatori?.cabina?.fonte ?? x.inputs.componenti?.ammortizzatori?.contrappeso?.fonte, x.allegati);
  const dati = (['cabina', 'contrappeso'] as const).flatMap((l) => {
    const d = lati[l], from = x.base.path === 'vano' ? 'progetto' : src;
    return [dato(`${l}.tipo`, d.tipo ?? null, '', 0, stato, from), dato(`${l}.numero`, d.numero ?? null, '', 0, stato, from), dato(`${l}.corsa`, d.corsa ?? null, 'mm', 0, stato, from),
      dato(`${l}.altezza`, d.altezza ?? null, 'mm', 0, stato, from), dato(`${l}.forza`, d.F ?? null, 'N', 0, stato, src), dato(`${l}.certificato`, d.cert?.numero ?? null, '', 0, stato, src)];
  }).filter((d) => d.valore !== null);
  return { componente: { sezione: 'ammortizzatori', stato, dati }, checks, punti, mancanti: mancantiDi('ammortizzatori', checks) };
}
