// Sections 1–3 of the relazione tecnica di modifica (RT plan §5.1): the installation's data (year, approval regime with
// how the RT knows it, construction number, CE marking and the part of UNI 10411 it gives, «Ascensore per», control),
// the object of the modification (type, parts, the engineer's description, the layout, the case of DPR 162/1999 art. 2
// c.1 lett. cc) and the sentence that bounds what the RT checks) and the references (the documents of the profile for
// a modification, the approval law, the clauses the RT's checks and points cite, document by document). Pure.
import { NORMA_SIGLA } from '../../lift/collaudo';
import { macchinaResta } from '../../lift/intervento';
import { normaDaMarcatura } from '../../lift/modifica';
import { regime } from '../../rt/regimi';
import { etichettaIntervento } from '../intervento-text';
import { casoNumerato } from '../modifica-dpr';
import type { ReportBlock } from '../model';
import { partiText, riferimentiRows } from '../collaudo';
import { mergeRefs } from '../refs';
import type { Ctx } from './contesto';
import { DOC, fill, perDocumento } from './testi';

/** A standard's or a law's name, as the references cite it. */
const STANDARD = /^(UNI|EN|ISO|CEI|DPR|DM|D\.\s?Lgs|Direttiva|NTC)\b[^()]*$/;

const I = DOC.impianto, O = DOC.oggettoSezione, USI: Readonly<Record<string, string>> = DOC.usi;

/** The approval regime as the RT knows it: chosen, derived and confirmed, or derived and still to confirm. */
export function regimeText(x: Ctx): string {
  const g = x.d.regime;
  if (!g.legge) return I.leggeNessuna;
  const R = regime(g.legge), legge = R.sigla;
  const testo = g.origine === 'scelta' ? fill(I.leggeScelta, { legge }) : g.confermata ? fill(I.leggeConfermata, { legge }) : fill(I.leggeDerivata, { legge });
  return `${testo}${R.nota ? ` (${R.nota})` : ''}${g.coerente ? '' : ` — ${I.leggeIncoerente}`}`;
}

/** The answer about the CE marking in words. */
export function marcaturaText(x: Ctx): string {
  const m = x.C.marcatura;
  return m === 'si' ? I.marcaturaSi : m === 'no' ? I.marcaturaNo : m === 'incerta' ? I.marcaturaIncerta : I.marcaturaNonIndicata;
}

/** The part of UNI 10411 of the modification, and whether the CE answer gives the same. */
function normaText(x: Ctx): string {
  const m = x.C.marcatura, by = m ? normaDaMarcatura(m, x.C.servizio) : null;
  if (by === null) return x.sigla;
  return by === x.d.norma ? fill(I.normaDerivata, { norma: x.sigla }) : fill(I.normaIncoerente, { norma: x.sigla, altra: NORMA_SIGLA[by] });
}

export function impiantoBlocks(x: Ctx): ReportBlock[] {
  const a = x.r.anagrafica, Pl = x.r.plant;
  return [x.h2(x.titolo('impianto')), { t: 'kv', rows: [
    [I.anno, a.annoInstallazione !== undefined ? String(a.annoInstallazione) : DOC.nonIndicato],
    [I.legge, regimeText(x)],
    [I.fabbrica, a.numeroFabbrica ?? DOC.nonIndicato],
    [I.marcatura, marcaturaText(x)],
    [I.norma, normaText(x)],
    [I.uso, Pl.liftUse ? USI[Pl.liftUse] ?? Pl.liftUse : DOC.nonIndicato],
    [I.manovra, Pl.control ?? DOC.nonIndicato],
  ] }];
}

/** The case of DPR 162/1999 art. 2 c.1 lett. cc) of the modification as a whole (each part's: «Adeguamenti e
 *  adempimenti»): the machine replaced, n. 5); kept, by the numbered cases of the other parts, or the engineer's. */
export function dprText(x: Ctx): string {
  const sezione = x.titolo('adempimenti');
  if (!macchinaResta(x.d.tipo, x.C)) return fill(O.dprMacchina, { sezione });
  return fill(casoNumerato(x.C, x.base.values) ? O.dprNumerata : O.dprDaConfermare, { sezione });
}

export function oggettoBlocks(x: Ctx): ReportBlock[] {
  const doc = x.r.inputs.doc, lay = doc?.layoutModificato;
  const disposizione = lay === undefined ? DOC.daIndicare : `${lay ? O.disposizioneSi : O.disposizioneNo}${doc?.notaLayout ? `: ${doc.notaLayout}` : ''}`;
  const scope = `${x.sigla}, ${x.d.norma === '10411-1' ? '4' : '4.3'}`;
  return [x.h2(x.titolo('oggetto')), { t: 'kv', rows: [
    [O.tipo, etichettaIntervento(x.d.tipo, x.C)],
    [O.parti, partiText(x.C)],
    [O.descrizione, doc?.descrizione ?? O.nessunaDescrizione],
    [O.disposizione, disposizione],
    [O.dpr, dprText(x)],
  ] }, { t: 'p', text: fill(O.ambito, { regole: x.titolo('regole'), clausola: scope }) }];
}

/** The clauses the RT's checks and points cite, one row per document. */
export function clausoleRows(x: Ctx): string[][] {
  const refs = [...x.d.checks.map((c) => c.ref), ...x.d.punti.map((p) => p.punto.rif)].flatMap(perDocumento);
  return perDocumento(mergeRefs(refs)).flatMap((r) => {
    const at = r.indexOf(', '), doc = at > 0 ? r.slice(0, at) : '';
    // only a standard's or a law's clauses (the registry's own words, «scelta del software», stay in the rows)
    return STANDARD.test(doc) ? [[doc, r.slice(at + 2)]] : [];
  });
}

export function riferimentiBlocks(x: Ctx): ReportBlock[] {
  const R = DOC.riferimenti, resta = macchinaResta(x.d.tipo, x.C), g = x.d.regime;
  const rows = riferimentiRows(true, x.C, x.base.analysis.ctx.I.std, x.base.path === 'vano', resta)
    .map((r) => (r[0]?.startsWith('DPR 162/1999') ? [r[0], fill(R.dpr, { sezione: x.titolo('adempimenti') })] : r));
  if (g.legge && g.legge !== 'dpr_162_1999') rows.push([regime(g.legge).sigla, R.legge]);
  const clausole = clausoleRows(x);
  return [
    x.h2(x.titolo('riferimenti')),
    { t: 'grid', head: R.head, rows, widths: [0.36, 0.64], align: ['l', 'l'] },
    ...(clausole.length ? [{ t: 'h3', text: R.clausole } as ReportBlock, { t: 'grid', head: R.clausoleHead, rows: clausole, widths: [0.3, 0.7], align: ['l', 'l'] } as ReportBlock,
      { t: 'p', style: 'note', text: R.clausoleNota } as ReportBlock] : []),
  ];
}
