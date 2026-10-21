// Section 6 of the relazione tecnica di modifica (RT plan §4.5 «Strutture», §5.1): the building's structures (point 5 of
// UNI 10411) by the RT engine's rule (documenti.ts struttureRt) — the owner's suitability declaration with its state, the
// engineer's statement, point 5 not applied within 10 % (-11), the engineer's answer still missing, or no rule calling
// it, said as the software's reading — never an unconditional «no change»; why the standard calls it; on the room path
// the machine's loads on the slab as sheet 1 counts them and the existing machine's beside the new one's, with the
// software's reading of the forces and of their points (and a warning when the engineer's answer says otherwise). Pure.
import { KL } from '../../lift/norme';
import { CAMPI } from '../../rt/componenti/punti';
import { EXISTING_SUPPORT_IT } from '../../room/survey-site';
import { surveySheetData } from '../../tavole/survey-data';
import { labelCase, lowerKeeping } from '../label-case';
import type { ReportBlock } from '../model';
import { massesBlock, p4Block, slabChange } from '../tecnica-site';
import type { Ctx } from './contesto';
import { motivoText, statoDocumento } from './sezione';
import { mergeRefs } from '../refs';
import { DOC, campo, elenco, fill, perDocumento } from './testi';

const S = DOC.strutture;

/** A change of load on the slab as the documents write it [daN]: «+99», «−146» or «0». */
export const segnato = (x: Ctx, v: number): string => (v > 0.5 ? `+${x.fmt(Math.round(v), 0)}` : v < -0.5 ? `−${x.fmt(Math.round(-v), 0)}` : '0');

function esitoText(x: Ctx): string {
  const s = x.d.strutture, clausole = mergeRefs(s.motivi.flatMap((m) => perDocumento(m.clausola))), a = x.r.inputs.strutture;
  switch (s.esito) {
    case 'documento': {
      const doc = x.d.documenti.find((d) => d.id === 'idoneita_strutture');
      return fill(S.documento, { clausole, stato: doc ? statoDocumento(doc) : DOC.documenti.daAllegare });
    }
    case 'dichiarazione': {
      const frasi = [...(s.domande.includes('forze') && a?.forze === 'non_aumentano' ? [S.dichiarazioneForze] : []),
        ...(s.domande.includes('pertinente') && a?.pertinente === false ? [S.dichiarazionePertinente] : [])];
      return (frasi.length ? frasi : [S.dichiarazione]).map((f) => fill(f, { clausole })).join(' ');
    }
    case 'non_applicato': return fill(S.nonApplicato, { pct: x.fmt(KL.loadStruct11 * 100, 0), clausole });
    case 'manca_risposta': {
      const domande = s.domande.filter((d) => x.r.inputs.strutture?.[d] === undefined).map((d) => S.domande[d]);
      return fill(S.mancaRisposta, { domande: elenco(domande.length ? domande : s.domande.map((d) => campo(`strutture.${d}`, CAMPI))), clausole });
    }
    default: return S.nonRichiamato;
  }
}

/** The room path's loads on the slab and the existing machine's against the new one's (RoomDesign survey). */
function caricoLocale(x: Ctx): ReportBlock[] {
  const room = x.base.room, r = x.r;
  if (!room) return x.base.lift?.layout.inputs.room ? [{ t: 'p', style: 'note', text: S.progetto }] : [];
  const dr = room.derived, s = room.survey, Pl = r.plant, { fmt } = x, r0 = (v: number): string => fmt(Math.round(v), 0);
  const sheet = surveySheetData({
    values: x.base.values, survey: s, collaudo: x.C, plant: Pl, project: r.project, company: { name: r.company.name, logo: null },
    set: { number: '', issuedAt: new Date(x.base.records.room?.createdAt ?? x.base.records.calc.createdAt), author: '', revisions: [] }, tipo: x.d.tipo,
  }, dr, 1);
  const B: ReportBlock[] = [{ t: 'h3', text: S.carichi }, { t: 'kv', rows: [
    ...sheet.loads.map(([k, v, u]): [string, string] => [labelCase(k), `${v}${u ? ` ${u}` : ''}`]),
    ...sheet.P.map(([k, v]): [string, string] => [fill(S.caricoP, { p: k.slice(0, 2), testo: lowerKeeping(k.slice(3)) }), /\d/.test(v) ? `${v} daN` : v]),
  ] }, ...massesBlock(dr, Pl, fmt), { t: 'p', style: 'note', text: S.carichiNota }, ...p4Block(Pl)];

  const { P1, P9, P9old, grow, machine, known } = slabChange(dr, Pl), O = dr.analysis.ctx.O, old = s.existingSupport;
  B.push({ t: 'h3', text: S.confrontoTitolo }, { t: 'grid', head: S.confrontoHead, widths: [0.42, 0.29, 0.29], align: ['l', 'l', 'l'], rows: [
    [S.massa, known ? `${r0(O.mass)} kg` : S.nonInserita, `${r0(machine)} kg`],
    [S.p1, fill(S.stesseMasse, { v: r0(P1) }), `${r0(P1)} daN`],
    [S.p9, P9old === null ? '—' : `${r0(P9old)} daN`, `${r0(P9)} daN`],
    [S.appoggi, old ? `${EXISTING_SUPPORT_IT[old.kind]}, ${old.keep ? S.appoggiRiusato : S.appoggiRimosso}` : '—',
      dr.G ? (old?.keep ? S.appoggiNuovoRiusato : S.appoggiNuovo) : '—'],
  ] });
  const forze = grow === null ? S.nonConfrontabili : fill(grow > 0.5 ? S.aumentati : S.nonAumentati, { d: segnato(x, grow) });
  const cal = room.checks.find((c) => c.id === 'm_calata');
  const calate = cal?.status === 'ok' ? S.calateInvariate : cal?.value != null ? fill(S.calateScarto, { d: r0(cal.value) }) : S.calateDaVerificare;
  const punti = !old ? S.puntiNonNoti : old.keep ? fill(S.puntiDaVerificare, { calate }) : S.puntiSpostati;
  B.push({ t: 'p', text: fill(S.lettura, { forze, punti }) });
  // the engineer's answer against the software's reading of the slab
  if (x.r.inputs.strutture?.forze === 'non_aumentano' && grow !== null && grow > 0.5) B.push({ t: 'box', text: S.contrasto });
  return B;
}

export function struttureBlocks(x: Ctx): ReportBlock[] {
  const s = x.d.strutture, B: ReportBlock[] = [x.h2(x.titolo('strutture')), { t: 'p', text: esitoText(x) }];
  if (s.motivi.length) B.push({ t: 'h3', text: S.motivi }, { t: 'list', items: s.motivi.map(motivoText) });
  return [...B, ...caricoLocale(x)];
}
