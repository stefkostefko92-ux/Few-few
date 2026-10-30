// The counterweight's guide rails in the relazione tecnica di modifica (RT plan §4.5): at its safety gear's operation
// (gr_cw, tavole/cw-rail-check.ts; a counterweight with a gear only: a space people reach under the shaft) and in running
// — rt_cw_run, the RT's own (registry rt.guide.contrappeso.marcia): k2 with the counterweight's mass off its centre by
// KV_VERT.cwEccWidth of its width and KV_VERT.cwEccDepth of its depth, σm and σm + Fv/A (Fv: the rail's own weight; the
// brackets' push neglected up to KR.fpTravelMax of travel) within Rm/St in normal use, the deflection within
// KR.cwRailDeflNoGear without a gear, KV_VERT.railDeflection with one (UNI EN 81-20:2020, 5.7.2.3.3, 5.7.4.5, 5.7.4.6). The
// shaft path takes the design's geometry, the room path the RT's inputs. Units: N, mm, N/mm². Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import { cwGearOf } from '../../tavole/cw-gear';
import { cwRailChecks, cwRailCore, cwRailGeometryOf, cwRails, type CwRailGeometry } from '../../tavole/cw-rail-check';
import type { SafetyGear } from '../../tavole/forces';
import { railLimits, type RailOpts } from '../../tavole/rail-check';
import { KR } from '../norme';
import type { RtCheck } from '../types';
import { daVano, dato, fonteDi, mancante, mancantiDi, nuova, rtCheck, type RtCtx } from './comune';
import type { Esito, EsitoSezione } from './esito';
import { geometriaContrappeso, opzioniDi, sezioneDi } from './geometria';

const G = 9.81;

/** The counterweight's rails in running: the stress σ = σm + Fv/A within Rm/St of normal use, and the larger deflection
 *  within the limit with or without a safety gear. */
export function cwMarcia(geo: CwRailGeometry, Mcw: number, o: Pick<RailOpts, 'Rm' | 'a5'>, conParacadute: boolean): { tensione: Esito; freccia: Esito } {
  const K = KV_VERT, S = geo.section, { l, width, depth, h } = geo, n = 2, k2 = K.k2Running;
  const fx = (k2 * G * Mcw * K.cwEccDepth * depth) / (n * h), fy = (k2 * G * Mcw * K.cwEccWidth * width) / ((n / 2) * h);
  const sm = (K.railBend * fx * l) / S.Wy + (K.railBend * fy * l) / S.Wx, own = (G * S.q * geo.len) / 1000, s = sm + own / S.A;
  const lim = railLimits(o).use, defl = (f: number, I: number): number => (K.railDeflK * f * l ** 3) / (48 * K.steelE * I);
  const d = Math.max(defl(fx, S.Iy), defl(fy, S.Ix)), dLim = conParacadute ? K.railDeflection : KR.cwRailDeflNoGear;
  return { tensione: { status: s <= lim + 1e-9 ? 'ok' : 'fail', value: s, limit: lim }, freccia: { status: d <= dLim + 1e-9 ? 'ok' : 'fail', value: d, limit: dLim } };
}

export function guideContrappeso(x: RtCtx): EsitoSezione {
  const g = x.inputs.componenti?.guideContrappeso, Pl = x.plant, Mcw = x.Mcw, L = x.base.path === 'vano' ? x.base.lift?.layout : undefined;
  const o = { sezione: 'guideContrappeso' as const, ambito: 'richiesta' as const, upper: true }, steel = opzioniDi(g), checks: RtCheck[] = [];
  const under = L ? !!x.base.lift?.underPit : g?.sottoFossaAccessibile === true, gear: SafetyGear | null = cwGearOf(under, Pl);
  const sez = sezioneDi(g, 'componenti.guideContrappeso', L?.inputs.cwRail);
  // the geometry: the design's (another profile typed: its section in place of the design's), or the survey's
  let geo: CwRailGeometry | null = null, mancanti: string[] = [...sez.mancanti];
  if (L && sez.S) geo = { ...cwRailGeometryOf(L, Pl), section: sez.S };
  else if (!L) {
    const r = geometriaContrappeso(g, sez.S, Pl.cwBracketPitch);
    geo = r.geo;
    mancanti = [...mancanti, ...r.mancanti];
  }
  const sheet = !!L && (g?.profilo === undefined || g.profilo === L.inputs.cwRail) && steel.Rm === undefined && steel.a5 === undefined;
  if (gear) {
    if (L && sheet) checks.push(...cwRails(L, Mcw, gear, Pl).map((c) => ({ ...daVano(x, c, 'guideContrappeso'), ambito: 'richiesta' as const })));
    else if (geo) checks.push(...cwRailChecks(cwRailCore(geo, Mcw, gear, steel), railLimits(steel).gear).map((c) => ({ ...daVano(x, c, 'guideContrappeso'), ambito: 'richiesta' as const })));
    else checks.push(mancante(x, 'gr_cw', mancanti, null, 1, 'MPa', o));
  }
  if (geo) {
    const m = cwMarcia(geo, Mcw, steel, gear !== null);
    checks.push(rtCheck(x, 'rt_cw_run', m.tensione.status === 'ok', m.tensione.value, m.tensione.limit, 1, 'MPa', { ...o, caso: 'tensione' }));
    checks.push(rtCheck(x, 'rt_cw_run', m.freccia.status === 'ok', m.freccia.value, m.freccia.limit, 1, 'mm', { ...o, caso: 'freccia' }));
  } else checks.push(mancante(x, 'rt_cw_run', mancanti, null, 1, 'MPa', o));
  const stato = nuova(x, 'rails') ? 'nuovo' : 'esistente', src = L && !g?.profilo ? 'progetto' : fonteDi(g?.fonte, x.allegati);
  const dati = [
    dato('profilo', sez.sigla, '', 0, stato, src), dato('Rm', g?.Rm ?? null, 'N/mm²', 0, stato, src), dato('allungamento', g?.allungamento ?? null, '', 0, stato, src),
    dato('passoStaffe', geo?.l ?? Pl.cwBracketPitch ?? null, 'mm', 0, stato, L ? 'progetto' : 'impianto'),
    dato('massaContrappeso', Mcw, 'kg', 0, nuova(x, 'cw') ? 'nuovo' : 'esistente', 'calcolo'),
    dato('paracaduteContrappeso', gear, '', 0, 'esistente', 'impianto'),
  ].filter((v) => v.valore !== null);
  return { componente: { sezione: 'guideContrappeso', stato, dati }, checks, punti: [], mancanti: mancantiDi('guideContrappeso', checks) };
}
