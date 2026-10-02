// Values of sheet 1 of a machine replacement, written: the installation and the intervention, the existing machine
// beside the new one, the machine room and the drops as surveyed, the load on the support, the loads on the slab
// (P1–P4, P9), the notes, the checks, the electrical supply, the title block. What nobody entered prints as a dash.
// Italian, like the drawings. Pure.
import appIt from '../../../messages/it.json';
import type { Machine } from '@/calc/types';
import { isUpperLimit } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import { PROFILES } from '@/shaft/profiles';
import { profileOf, supportOf } from '@/shaft/support';
import { beamChecks } from '@/shaft/support-check';
import { NORMA_SIGLA, ambitoOf } from '../lift/collaudo';
import { ADEMPIMENTI } from '../lift/norme-collaudo';
import { cablesMass, ropeLength } from '../lift/support';
import { makeFmt } from '../present/tr';
import { collaudoNote, partiText } from '../report/collaudo';
import type { RoomDerived } from '../room/derive';
import type { Row, TitleData } from './datasheet';
import { dateIt, placeLines } from './input';
import { loads } from './loads';
import { roomNote, type Note } from './notes';
import type { SurveyTavoleInput } from './survey-input';
import { machineText } from './views';

const fmt = makeFmt('it-IT');
const dec = (x: number): number => (Number.isInteger(x) ? 0 : Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? 1 : 2);
const num = (x: number | null | undefined): string => (x == null ? '—' : fmt(x, dec(x)));
const txt = (s: string | undefined, fallback = '—'): string => (s && s.trim() ? s.trim() : fallback);
const mm = (x: number): string => fmt(Math.round(x), 0);

export interface SurveySheet extends TitleData {
  /** the installation and the intervention */
  base: readonly Row[];
  /** label, unit, the existing machine, the new one */
  machines: readonly (readonly [string, string, string, string])[];
  room: readonly Row[];
  /** label, value, unit */
  loads: readonly (readonly [string, string, string])[];
  notes: readonly Note[];
  checks: readonly (readonly [string, string, string, string])[];
  electric: readonly Row[];
  /** the loads on the slab: their name and value [daN] */
  P: readonly (readonly [string, string])[];
}

/** The support under the machine as the sheet names it. */
export function supportName(d: RoomDerived): string {
  const s = supportOf(d.G?.room ?? null, d.M.Dp > 0), rf = d.M.rinvio;
  if (s.kind === 'rinvio' && rf?.on === 'frame') return rf.maker ? `TELAIO CON RINVIO ${rf.maker.brand} ${rf.maker.code}` : 'TELAIO CON RINVIO (SU MISURA)';
  if (s.kind === 'frame') return `TELAIO ${profileOf(s)}`;
  if (s.kind === 'beams') return `PUTRELLE ${profileOf(s)}`;
  return { shims: 'SPESSORI DI LIVELLAMENTO', plates: 'PIASTRE D\'ACCIAIO', plinth: 'PLINTO IN CALCESTRUZZO', rinvio: 'TELAIO CON RINVIO' }[s.kind] ?? s.kind;
}

const machineRows = (O: Machine | null, N: Machine, oldName: string, newName: string): (readonly [string, string, string, string])[] => {
  const both = (f: (m: Machine) => string): [string, string] => [O ? f(O) : '—', f(N)];
  return [
    ['ARGANO', 'tipo', oldName, newName],
    ['PULEGGIA DI TRAZIONE Ø', 'mm', ...both((m) => fmt(m.D, 0))],
    ['RAPPORTO DI RIDUZIONE', '', ...both((m) => `1 : ${num(m.i)}`)],
    ['POTENZA MOTORE', 'kW', ...both((m) => num(m.Pn))],
    ['POLI N° - GIRI/MINUTO', '', ...both((m) => `${m.poles}/${fmt(m.nm, 0)}`)],
    ['FRENO: GRUPPI × COPPIA', 'N·m', ...both((m) => `${m.brakeSets} × ${fmt(m.brakeNm, 0)}`)],
    ['ANGOLO GOLE γ - β', '°', ...both((m) => `${fmt(m.groove.gamma, 0)} - ${fmt(m.groove.beta, 0)}`)],
    ['FUNI DI TRAZIONE', 'N°-Ø', ...both((m) => `${m.n} - ${num(m.d)}`)],
    ['CARICO STATICO AMMESSO', 'kg', ...both((m) => (m.shaftMax > 0 ? fmt(m.shaftMax, 0) : '—'))],
    ['MASSA', 'kg', ...both((m) => (m.mass > 0 ? fmt(m.mass, 0) : 'NON INSERITA'))],
  ];
};

export function surveySheetData(x: SurveyTavoleInput, d: RoomDerived, pages: number): SurveySheet {
  const { ctx, res } = d.analysis, { I, N } = ctx, Pl = x.plant, C = x.collaudo, s = x.survey, R = s.room, M = d.M;
  const base: Row[] = [
    ['NORMATIVA DI RIFERIMENTO', '', C.norma === 'en81' ? 'UNI EN 81-20/50:2020' : NORMA_SIGLA[C.norma]],
    ['INTERVENTO', '', 'SOSTITUZIONE DELL\'ARGANO'],
    ['PARTI SOSTITUITE O MODIFICATE', '', partiText(C).toUpperCase()],
    ['PORTATA', 'kg', fmt(I.Q, 0)],
    ['VELOCITÀ', 'm/s', fmt(I.v, 2)],
    ['CORSA', 'm', fmt(I.H, 2)],
    ['TRAZIONE', 'tipo', `ELETTRICA ${I.r}:1`],
    ['ARGANO', 'posizione', I.layout === 'topDefl' ? 'IN ALTO CON RINVIO' : 'IN ALTO, TIRO DIRETTO'],
    ['PESO TOTALE CABINA', 'kg', fmt(I.P, 0)],
    ['BILANCIAMENTO - CONTRAPPESO', '%-kg', `${fmt(res.k * 100, 0)} - ${fmt(res.Mcw, 0)}`],
    ['MANOVRA', 'tipo', txt(Pl.control)],
  ];
  const named = machineText(Pl, d.made), compare = ctx.compare;
  const machines = machineRows(compare ? ctx.O : null, N, compare ? '—' : 'NON INSERITO', txt(named, 'NON DI CATALOGO'));
  const G = d.G, rf = M.rinvio;
  const room: Row[] = [
    ['LOCALE (L × P × H)', 'mm', `${mm(R.W)} × ${mm(R.D)} × ${mm(R.H)}${R.ridge > R.H ? ` (COLMO ${mm(R.ridge)})` : ''}`],
    ['SOLETTA - PORTA (L × H)', 'mm', `${mm(R.slab)} - ${mm(R.doorW)} × ${mm(R.doorH)}`],
    ['QUADRO (L × P × H)', 'mm', `${mm(R.panelW)} × ${mm(R.panelD)} × ${mm(R.panelH)}`],
    ['VANO SOTTO IL LOCALE (L × P - MURI)', 'mm', `${mm(s.shaft.W)} × ${mm(s.shaft.D)} - ${mm(s.shaft.wall)}`],
    ['FUNI CABINA: DAL VANO (X - Y)', 'mm', `${mm(s.car.x)} - ${mm(s.car.y)}`],
    ['FUNI CONTRAPPESO RILEVATE (X - Y)', 'mm', `${mm(s.cw.x)} - ${mm(s.cw.y)}`],
    ['CALATE: CALCOLO - RILIEVO', 'mm', `${mm(d.calata.calc)} - ${mm(d.calata.measured)}`],
    ['BASAMENTO', 'tipo', supportName(d)],
    ['ASSE PULEGGIA SUL PAVIMENTO', 'mm', mm(M.axis)],
    ...(M.Dp > 0 && G ? [['PULEGGIA DI RINVIO Ø - h - dx', 'mm', `${mm(M.Dp)} - ${mm(M.h)} - ${mm(G.pulleyAt - G.sheaveAt)}`] as Row] : []),
    ...(rf ? [['ASSE DEL RINVIO SUL PAVIMENTO', 'mm', mm(G ? G.pulleyZ : rf.pulleyAxis)] as Row] : []),
  ];
  // the load on the support and on the slab: the machine with its bedframe (the maker's bedplate counted when the
  // data do not give it), the ropes and the cables, the dynamic coefficient, as a whole design's sheet counts them
  const ropesKg = N.n * N.qf * ropeLength(I), cablesKg = cablesMass(I.H, Pl.massCables);
  const bedplate = rf?.on === 'frame' ? rf.maker?.mass ?? 0 : 0, machine = Pl.massMachine ?? N.mass + bedplate, dyn = Pl.dynFactor ?? KV_VERT.dynFactor;
  const ld = loads({
    P: I.P, Q: I.Q, Mcw: res.Mcw, ropes: ropesKg, cables: cablesKg, machine, roping: I.r, carRailQ: 0, carRailLen: 0, cwRailQ: 0, cwRailLen: 0,
    safetyGear: Pl.safetyGear ?? 'progressive', dyn, carBuffers: 1, cwBuffers: 1, governor: Pl.governorLoad ?? null,
  });
  const loadRows: SurveySheet['loads'] = [
    ['FUNI', fmt(ropesKg, 0), 'kg'],
    ['CAVI FLESSIBILI', fmt(cablesKg, 0), 'kg'],
    ['CARICO STATICO SUL BASAMENTO DELL\'ARGANO', fmt(ld.static, 0), 'kg'],
    [`COEFFICIENTE DINAMICO × ${fmt(dyn, 1)}`, fmt(ld.dynamic, 0), 'kg'],
    [Pl.massMachine != null || !bedplate ? 'ARGANO E TELAIO' : 'ARGANO E BASAMENTO CON RINVIO', machine > 0 ? fmt(machine, 0) : 'NON INSERITA', 'kg'],
    ...(supportOf(R).kind === 'beams' ? [['PUTRELLE (DUE)', `${profileOf(supportOf(R))}, ${fmt(2 * PROFILES[profileOf(supportOf(R))].mass, 1)} kg/m`, ''] as const] : []),
  ];
  const P: SurveySheet['P'] = [
    ['P1 ARGANO', fmt(ld.P[0] ?? 0, 0)], ['P2 ATTACCO FUNI CABINA', ld.P[1] == null ? '—' : fmt(ld.P[1], 0)],
    ['P3 ATTACCO FUNI CONTRAPPESO', ld.P[2] == null ? '—' : fmt(ld.P[2], 0)], ['P4 LIMITATORE', ld.P[3] == null ? '—' : fmt(ld.P[3], 0)],
    ['P9 TOTALE SUL SOLAIO', fmt(ld.P[8] ?? 0, 0)],
  ];
  // the checks of the room, of the machine in it and of the drops; the beams again at this sheet's load
  const beams = G ? beamChecks(G, { machine, static: ld.static, dyn }) : [];
  const all = [...d.checks.filter((c) => c.id !== 'm_beam' && c.id !== 'm_beamf'), ...beams];
  const labels: Readonly<Record<string, string>> = appIt.shaft, OUTCOME = { ok: 'OK', warn: 'ATTENZIONE', fail: 'NON PASSA', info: '—' } as const;
  const withUnit = (v: number | null, dp: number, u: string): string => (v == null ? '—' : `${fmt(v, dp)}${u ? ` ${u}` : ''}`);
  const checks: SurveySheet['checks'] = all.map((c) => {
    const label = (labels[`c_${c.id}`] ?? c.id).replace(' (UNI EN 81-20, ', ' (');
    const outcome = ambitoOf(C, c.id) === 'existing' ? 'ESISTENTE' : OUTCOME[c.status];
    if (c.id === 'm_door') return [label.replace(', margine', ''), `${R.doorW} × ${R.doorH} mm`, `≥ ${KV_VERT.doorMinW} × ${KV_VERT.doorMinH} mm`, outcome];
    return [label, withUnit(c.value, c.dec, c.unit), c.limit == null ? '—' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${withUnit(c.limit, c.dec, c.unit)}`, outcome];
  });
  const notes: Note[] = [
    { ...roomNote(false), tag: 'NOTA 1' },
    {
      title: 'SOLAIO, APPOGGI E BASAMENTO', tag: 'NOTA 2',
      text: 'Il solaio del locale e gli appoggi del basamento devono sopportare i carichi di questo foglio, che non agiscono insieme: la verifica '
        + 'strutturale spetta al committente tramite il suo tecnico (NTC 2018, §8.4.1 per l\'intervento locale su un edificio esistente; §3.1.4 per i '
        + 'carichi del macchinario). Il basamento disegnato è la proposta del software, da adattare a quello fornito dal costruttore.',
    },
    {
      title: 'CALATE E APERTURE NELLA SOLETTA', tag: 'NOTA 3',
      text: 'La cabina e il contrappeso restano dove sono: le funi della nuova macchina devono scendere sulle calate esistenti rilevate in sito, '
        + `entro ${KV_VERT.dropTol} mm (verifica delle calate). Le aperture disegnate nella soletta sono quelle che servono alle funi e al rinvio della `
        + 'nuova macchina, con 30 mm di gioco: confrontarle in sito con quelle esistenti; aprire o chiudere aperture senza indebolire la soletta, '
        + 'con la verifica del tecnico. Riferimenti: UNI EN 81-20:2020, punto 5.2.',
    },
  ];
  const test = collaudoNote(C, `NOTA ${notes.length + 1}`);
  if (test) notes.push(test);
  // what the law asks of the modification (paraphrased, registry ADEMPIMENTI)
  notes.push({ title: 'ADEMPIMENTI (DPR 162/1999)', tag: `NOTA ${notes.length + 1}`, text: ADEMPIMENTI.modifica.map((p) => `${p.rif}: ${p.testo}.`).join(' ') });
  return {
    base, machines, room, loads: loadRows, notes, checks, P,
    electric: [['TENSIONE F.M.', 'V', num(Pl.voltage)], ['LUCE', 'V', num(Pl.lightVoltage)], ['FREQUENZA', 'Hz', num(Pl.frequency)], ['INTERMITTENZA', '%', num(Pl.duty)]],
    client: x.project.client || '—', location: placeLines(x.project), author: x.set.author, date: dateIt(x.set.issuedAt),
    revisions: x.set.revisions.map((r) => ({ mark: r.mark, text: r.text, date: dateIt(r.date) })),
    number: x.set.number, pages, plant: x.project.plantNumber || '—', company: x.company.name, logo: x.company.logo !== null, clientLogo: x.clientLogo != null,
  };
}
