// The head of the relazione tecnica di modifica (RT plan §5.1, intestazione): the company's letterhead, the title with
// the part of UNI 10411 of the modification and its type, the draft's warning, the RT's identity (number, revision,
// day, job), the installation (name, address, matricola, owner, client when another, maintenance company), the records
// it is made from with their day and fingerprint, the versions of the engines, the count of the checks, the revisions
// and the first page's note; in a draft, what the issue still misses. Pure.
import { etichettaIntervento } from '../intervento-text';
import { CAMPI } from '../../rt/componenti/punti';
import type { RecordRef } from '../../rt/types';
import type { ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { DOC, campo, elenco, fill, giorno, sha16 } from './testi';

const K = DOC.kv;

/** The RT's number as printed: «RT 26-004», or the draft's. */
export const numeroRt = (n: string | null): string => (n ? fill(DOC.numero, { n }) : DOC.numeroBozza);
/** The place of the installation in one line. */
export const luogo = (p: Ctx['r']['project']): string => [p.address, p.city, p.province].filter(Boolean).join(', ');

/** A record of the base in one line: what it is, its id, its day, the start of its SHA-256. */
const recordText = (k: keyof typeof DOC.record, r: RecordRef): string => fill(DOC.record[k], { id: r.id, data: giorno(r.createdAt), sha: `${sha16(r.sha256)}…` });

/** The records of the base in their order. */
export function records(x: Ctx): string[] {
  const r = x.base.records;
  return [recordText('calc', r.calc), ...(r.room ? [recordText('room', r.room)] : []), ...(r.lift ? [recordText('lift', r.lift)] : []), ...(r.shaft ? [recordText('shaft', r.shaft)] : [])];
}

/** The versions of the engines: the RT's and the base's records'. */
function motori(x: Ctx): string {
  const r = x.base.records, M = DOC.motori;
  return [fill(M.rt, { v: x.d.engineVersion }), fill(M.calc, { v: r.calc.engineVersion }), ...(r.room ? [fill(M.room, { v: r.room.engineVersion })] : []),
    ...(r.lift ? [fill(M.lift, { v: r.lift.engineVersion })] : []), ...(r.shaft ? [fill(M.shaft, { v: r.shaft.engineVersion })] : [])].join(' · ');
}

/** The owner as the registry gives him, with his address. */
export function proprietario(x: Ctx): string {
  const p = x.r.anagrafica.proprietario;
  return p?.nome ? `${p.nome}${p.indirizzo ? `, ${p.indirizzo}` : ''}` : DOC.nonIndicato;
}

export function intestazioneBlocks(x: Ctx): ReportBlock[] {
  const { r, d, C } = x, pr = r.project, inp = r.inputs, place = luogo(pr), richieste = d.checks.filter((c) => c.ambito === 'richiesta').length;
  const B: ReportBlock[] = [
    { t: 'letterhead', logo: r.company.logo ? 'logo' : null, from: [r.company.name, ...(r.company.city ? [r.company.city] : [])], to: [] },
    { t: 'h1', text: DOC.titolo },
    { t: 'sub', text: fill(DOC.sottotitolo, { norma: x.sigla, tipo: etichettaIntervento(d.tipo, C) }) },
  ];
  if (!r.number) B.push({ t: 'box', text: DOC.boxBozza });
  const client = pr.client && pr.client !== r.anagrafica.proprietario?.nome ? pr.client : null;
  B.push({ t: 'kv', rows: [
    [K.numero, numeroRt(r.number)], [K.revisione, `R${r.revision}`], [K.data, inp.doc?.data ? giorno(inp.doc.data) : DOC.daIndicare],
    ...(inp.doc?.commessa ? [[K.commessa, inp.doc.commessa] as [string, string]] : []),
    [K.impianto, pr.name], [K.indirizzo, place || DOC.nonIndicato], [K.matricola, pr.plantNumber || DOC.daComunicare],
    [K.proprietario, proprietario(x)], ...(client ? [[K.committente, client] as [string, string]] : []),
    [K.manutentore, r.anagrafica.manutentore ?? DOC.nonIndicato], [K.azienda, r.company.name],
    [K.base, records(x).join('\n')], [K.motori, motori(x)],
    [K.esito, fill(DOC.esitoBreve, { fail: d.failCount, warn: d.warnCount, n: richieste, sezione: x.titolo('esito') })],
  ] });
  const revs = r.revisions.length ? r.revisions.map((v) => [v.mark, giorno(v.date), v.text])
    : [[`R${r.revision}`, inp.doc?.data ? giorno(inp.doc.data) : '—', r.revision ? inp.revisione?.testo ?? DOC.daIndicare : DOC.primaEmissione]];
  B.push({ t: 'h3', text: DOC.revisioni }, { t: 'grid', head: DOC.revisioniHead, rows: revs, widths: [0.14, 0.18, 0.68], align: ['l', 'l', 'l'] });
  if (inp.doc?.nota) B.push({ t: 'p', style: 'note', text: inp.doc.nota });
  // a draft says what the issue still misses (an issued RT has none of these)
  const bloccanti = d.mancanti.filter((m) => m.bloccante);
  if (bloccanti.length) B.push({ t: 'box', text: fill(DOC.mancantiEmissione, { campi: elenco([...new Set(bloccanti.map((m) => campo(m.campo, CAMPI)))]) }) });
  return B;
}
