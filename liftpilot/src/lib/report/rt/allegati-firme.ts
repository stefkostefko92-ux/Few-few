// The last sections of the relazione tecnica di modifica (RT plan §5.1): the documents attached in their order (number,
// title, kind, section, pages, fingerprint), the documents the modification expects with their state («Allegato n»,
// delivered separately, «da allegare ⚠» — never blocking), LiftPilot's documents cited but not appended (the
// relazione di calcolo, the drawing sets in force) and what the appended copies are; the note on the software; the
// signatures — «Redatto da» and «Verificato da» (an engineer with the Ordine's province and number), kept together,
// dates by hand. Pure.
import { latestRevisions, plantChanged, plantChangedBox, revisionText } from '../elaborati';
import { titoloSezione } from '../../rt/sezioni';
import type { Componente, RtAllegato } from '../../rt/types';
import type { BlockStatus, FirmeBlock, PdfBlock, ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { statoDocumento } from './sezione';
import { DOC, fill, sha16 } from './testi';

const A = DOC.allegati, F = DOC.firme, TIPI: Readonly<Record<string, string>> = DOC.tipi;

const componente = (c: Componente | null): string => (c === null ? '—' : c === 'impianto' ? A.impianto : c === 'edificio' ? A.edificio : titoloSezione(c));

export function allegatiBlocks(x: Ctx): ReportBlock[] {
  const r = x.r, B: ReportBlock[] = [x.h2(x.titolo('allegati'))];
  if (r.allegati.length) {
    B.push({ t: 'p', text: A.intro }, { t: 'grid', head: A.head, widths: [0.07, 0.33, 0.17, 0.15, 0.08, 0.2], align: ['r', 'l', 'l', 'l', 'r', 'l'],
      rows: r.allegati.map((a) => [String(a.position), a.title, TIPI[a.kind] ?? a.kind, componente(a.component), String(a.pages), `${sha16(a.sha256)}…`]) });
  } else B.push({ t: 'p', style: 'note', text: A.nessuno });

  const docs = x.d.documenti;
  if (docs.length) {
    B.push({ t: 'h3', text: A.attesi }, { t: 'grid', head: A.attesiHead, widths: [0.46, 0.3, 0.24], align: ['l', 'l', 'l'], statusCol: 2,
      rows: docs.map((d) => [`${d.titolo}${d.consigliato ? DOC.documenti.consigliato : ''}`, d.clausola, statoDocumento(d)]),
      status: docs.map((d): BlockStatus => (d.stato === 'da_allegare' ? (d.consigliato ? 'info' : 'warn') : 'ok')) });
    if (docs.some((d) => d.stato === 'da_allegare')) B.push({ t: 'p', style: 'note', text: A.attesiNota });
  }

  const calc = x.base.records.calc, sets = latestRevisions(r.sets ?? []);
  const tavole = sets.length ? fill(A.tavole, { elenco: sets.map((s) => fill(A.tavola, { numero: s.number, revisione: revisionText(s.revision),
    sha: s.sha256 ? `, SHA-256 ${sha16(s.sha256)}…` : '' })).join(', ') }) : A.tavoleNessuna;
  B.push({ t: 'h3', text: A.liftpilot }, { t: 'list', items: [fill(A.rdc, { id: calc.id, sha: sha16(calc.sha256) }), tavole] });
  // a set issued with other data of the installation than those this RT prints (elaborati.ts)
  const changed = plantChanged(r.sets ?? [], r.plant);
  if (changed.length) B.push(plantChangedBox(changed, A.tavoleDiverse));
  const app = x.d.norma === '10411-1' ? 'App. C' : 'App. A';
  B.push({ t: 'p', style: 'note', text: fill(A.copie, { clausola: `${x.sigla}, ${app}` }) });
  return B;
}

/** The first footer line of an appended file's pages (report/pdf-tool.mjs fills {i} and {m}: the page and the pages). */
export const piedeAllegato = (a: Pick<RtAllegato, 'position' | 'title' | 'sha256'>): string =>
  fill(A.piede, { n: a.position, titolo: a.title, sha: sha16(a.sha256) });

/** The signatures: who drew the RT up and the engineer who checked it, each with a box for the hand. */
export function firmeBlock(x: Ctx): FirmeBlock {
  const f = x.r.inputs.firme, red = f?.redatto, ver = f?.verificato;
  const ordine = ver?.provincia && ver.numero ? fill(F.ordine, { provincia: ver.provincia, numero: ver.numero }) : fill(F.ordine, { provincia: DOC.daIndicare, numero: DOC.daIndicare });
  return { t: 'firme', cols: [
    { title: F.redatto, lines: [red?.nome ?? DOC.daIndicare, ...(red?.qualifica ? [red.qualifica] : []), x.r.company.name, F.data], box: { label: F.firma, w: 70, h: 28 } },
    { title: F.verificato, lines: [ver?.titolo && ver.nome ? `${ver.titolo} ${ver.nome}` : DOC.daIndicare, ordine, ...(ver?.sezione ? [fill(F.sezione, { s: ver.sezione })] : []), F.data],
      box: { label: F.timbro, w: 45, h: 45 } },
  ] };
}

export function chiusuraBlocks(x: Ctx): PdfBlock[] {
  return [
    x.h2(x.P.t('rep_legal_title')), { t: 'p', text: x.P.t('rep_legal') },
    x.h2(x.titolo('firme')), firmeBlock(x), { t: 'p', style: 'note', text: F.nota },
  ];
}
