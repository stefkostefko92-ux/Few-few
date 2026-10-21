// The car's guide rails in the relazione tecnica di modifica (RT plan §4.5, §4.6): UNI EN 81-50:2020, 5.10 with the
// stresses, the foot and the deflections of sheet 1 (gr_stress, gr_flange, gr_defl; registry guide.verifica). On the
// shaft path, without an option of the RT, the very rails' check of sheet 1 (sheetRails + railChecks): the same numbers;
// with the RT's options — the steel's Rm (ω interpolated), an elongation from 8 to 12 %, a suspension point off the
// rails' axis, another profile — the shared core with them, printed «calcolato con …: diverso dal foglio 1». On the room
// path the core on the surveyed geometry (geometria.ts), with the plant data's bracket pitch, safety gear and use; a
// datum missing is listed, never guessed. Sliding shoes: the foot is not computed (registry rt.guide.pattini); a travel
// over KR.fpTravelMax: the brackets' push is the designer's (rt.guide.fp). The safety gear's type is the governor's
// section's. Pure.
import { railSpan } from '@/shaft/brackets';
import { section } from '@/shaft/section';
import { railGeometryOf } from '../../tavole/forces';
import { railCheckCore, railChecks, railLimits, type RailOpts } from '../../tavole/rail-check';
import { sheetRails } from '../../tavole/sheet-loads';
import { KR } from '../norme';
import type { PuntoRt, RtCheck } from '../types';
import { daVano, dato, fonteDi, mancante, mancantiDi, nuova, type RtCtx } from './comune';
import type { EsitoSezione } from './esito';
import { geometriaCabina, opzioniDi, sezioneDi, sospensioneDi } from './geometria';
import { SITO_RT, sito } from './punti';

const IDS = ['gr_stress', 'gr_flange', 'gr_defl'] as const;
const it = (x: number): string => String(x).replace('.', ',');

/** In words the options that make the check differ from sheet 1. */
export function opzioniText(o: RailOpts, profilo: string | null): string {
  const xs = [...(profilo ? [`profilo ${profilo}`] : []), ...(o.Rm !== undefined ? [`Rm ${it(o.Rm)} N/mm²`] : []), ...(o.a5 ? ['allungamento A5 tra 8 e 12 %'] : []),
    ...(o.S ? ['punto di sospensione indicato'] : [])];
  return `calcolato con ${xs.join(', ')}: diverso dal foglio 1 delle tavole`;
}

/** The section's checks: computed (with the note of the options), or missing their data. */
function verifiche(x: RtCtx): { checks: RtCheck[]; dati: { profilo: string | null; l: number | null; len: number | null } } {
  const g = x.inputs.componenti?.guideCabina, Pl = x.plant, P = x.I.P, Q = x.I.Q, v = x.I.v, o = { sezione: 'guideCabina' as const, ambito: 'richiesta' as const, upper: true };
  const steel = opzioniDi(g), richiesta = (c: RtCheck): RtCheck => ({ ...c, ambito: 'richiesta' });
  const L = x.base.path === 'vano' ? x.base.lift?.layout : undefined;
  if (L) {
    // the suspension point given: on the side of the car's offset from the rails' system
    const R = sheetRails(L, P, Q, Pl), S = sospensioneDi(g);
    const other = g?.profilo !== undefined && g.profilo !== L.inputs.carRail, opts: RailOpts = { ...steel, ...(S ? { S } : {}) };
    const nota = Pl.safetyGear ? undefined : 'paracadute non indicato nei dati dell’impianto: progressivo, come il foglio 1';
    if (!other && !opts.Rm && !opts.a5 && !opts.S) {
      const checks = railChecks(R.rc, R.gear, v).filter((c) => c.id !== 'sg_type').map((c) => richiesta(daVano(x, c, 'guideCabina')));
      return { checks: nota ? checks.map((c) => ({ ...c, nota })) : checks, dati: { profilo: L.inputs.carRail, l: R.span, len: R.railLen } };
    }
    const sez = sezioneDi(g, 'componenti.guideCabina', L.inputs.carRail);
    if (!sez.S) return { checks: IDS.map((id) => mancante(x, id, sez.mancanti, null, 1, id === 'gr_defl' ? 'mm' : 'MPa', o)), dati: { profilo: sez.sigla, l: R.span, len: R.railLen } };
    const [z0, z1] = railSpan(section(L)), rc = railCheckCore(railGeometryOf(L), sez.S, P, Q, R.gear, R.span, z1 - z0, Pl.liftUse, opts);
    const text = opzioniText(opts, other ? sez.sigla : null);
    const checks = railChecks(rc, R.gear, v, railLimits(opts)).filter((c) => c.id !== 'sg_type').map((c) => ({ ...richiesta(daVano(x, c, 'guideCabina')), nota: text }));
    return { checks, dati: { profilo: sez.sigla, l: R.span, len: R.railLen } };
  }
  // the room path: the survey's geometry, the plant data's pitch, gear and use
  const geo = geometriaCabina(g), sez = sezioneDi(g, 'componenti.guideCabina');
  const mancanti = [...sez.mancanti, ...geo.mancanti, ...(g?.colonna === undefined ? ['componenti.guideCabina.colonna'] : []),
    ...(Pl.carBracketPitch === undefined ? ['impianto.carBracketPitch'] : []), ...(Pl.safetyGear === undefined ? ['impianto.safetyGear'] : [])];
  const dati = { profilo: sez.sigla, l: Pl.carBracketPitch ?? null, len: g?.colonna ?? null };
  if (!geo.geo || !sez.S || g?.colonna === undefined || Pl.carBracketPitch === undefined || Pl.safetyGear === undefined) {
    return { checks: IDS.map((id) => mancante(x, id, mancanti, null, 1, id === 'gr_defl' ? 'mm' : 'MPa', o)), dati };
  }
  const opts: RailOpts = { ...steel, ...(geo.S ? { S: geo.S } : {}) };
  const rc = railCheckCore(geo.geo, sez.S, P, Q, Pl.safetyGear, Pl.carBracketPitch, g.colonna * 1000, Pl.liftUse, opts);
  return { checks: railChecks(rc, Pl.safetyGear, v, railLimits(opts)).filter((c) => c.id !== 'sg_type').map((c) => richiesta(daVano(x, c, 'guideCabina'))), dati };
}

export function guideCabina(x: RtCtx): EsitoSezione {
  const g = x.inputs.componenti?.guideCabina, punti: PuntoRt[] = [], v = verifiche(x), d = v.dati;
  let checks = v.checks;
  // sliding shoes: the foot's bending asks the shoe's lining, which the software has not
  if (g?.pattini === 'strisciamento') {
    checks = checks.map((c) => (c.id === 'gr_flange' ? { ...c, status: 'warn', value: null, nota: 'pattini a strisciamento: flessione della suola non calcolata' } : c));
    punti.push(sito('guideCabina', SITO_RT.pattiniStrisciamento));
  }
  // over KR.fpTravelMax of travel the brackets' push is no longer negligible: an attention, the designer gives it
  if (x.I.H > KR.fpTravelMax) {
    checks = checks.map((c) => (c.id === 'gr_stress' && c.status === 'ok' ? { ...c, status: 'warn', nota: `${c.nota ? `${c.nota}; ` : ''}corsa oltre ${KR.fpTravelMax} m: Fp da aggiungere` } : c));
    punti.push(sito('guideCabina', SITO_RT.spintaStaffe));
  }
  const stato = nuova(x, 'rails') ? 'nuovo' : 'esistente', src = x.base.path === 'vano' && !g?.profilo ? 'progetto' : fonteDi(g?.fonte, x.allegati);
  const dati = [
    dato('profilo', d.profilo, '', 0, stato, src), dato('Rm', g?.Rm ?? null, 'N/mm²', 0, stato, src), dato('allungamento', g?.allungamento ?? null, '', 0, stato, src),
    dato('passoStaffe', d.l, 'mm', 0, stato, x.base.path === 'vano' ? 'progetto' : 'impianto'), dato('lunghezza', d.len, 'm', 1, stato, x.base.path === 'vano' ? 'progetto' : src),
    dato('paracadute', x.plant.safetyGear ?? null, '', 0, nuova(x, 'safetyGear') ? 'nuovo' : 'esistente', 'impianto'),
    dato('destinazione', x.plant.liftUse ?? null, '', 0, 'esistente', 'impianto'),
    dato('arcata', g?.arcata ?? null, '', 0, nuova(x, 'sling') ? 'nuovo' : 'esistente', src), dato('pattini', g?.pattini ?? null, '', 0, stato, src),
  ].filter((v) => v.valore !== null);
  return { componente: { sezione: 'guideCabina', stato, dati }, checks, punti, mancanti: mancantiDi('guideCabina', checks) };
}
