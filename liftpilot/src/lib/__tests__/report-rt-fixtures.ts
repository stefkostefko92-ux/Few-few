// The documents of the four golden installations of the relazione tecnica di modifica (fixtures/rt/scenari.ts) as the
// server would build them at issue: number, first revision, project, company, the RT engine's derivation; and the
// texts of a document, block by block, for the builder's tests (report-rt*.test.ts) and the review's PDFs. Pure.
import { deriveRt } from '../rt/derive';
import { buildRelazioneModifica, type RtDocInput } from '../report/rt/build';
import type { PdfBlock, ReportDoc } from '../report/model';
import { SCENARI, type Scenario } from './fixtures/rt/scenari';

export const PROGETTO: RtDocInput['project'] = {
  name: 'Condominio Via Roma 1 — impianto A', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB 1234/78', client: 'Studio Amministrazioni Brianza',
};
export const AZIENDA: RtDocInput['company'] = { name: 'Ascensori Esempio S.r.l.', city: 'Milano', logo: null };

/** The document's input of a scenario: issued as RT 26-0nn R0 on its day (or a draft, `number` null). */
export function docInput(s: Scenario, i: number, over: Partial<RtDocInput> = {}): RtDocInput {
  const day = s.inputs.doc?.data ?? '2026-10-21';
  return {
    number: `26-${String(i + 1).padStart(3, '0')}`, revision: 0, revisions: [{ mark: 'R0', text: 'Prima emissione', date: day }],
    project: PROGETTO, company: AZIENDA, anagrafica: s.anagrafica, plant: s.plant, inputs: s.inputs, allegati: s.allegati,
    derived: deriveRt(s.base, s.inputs, s.anagrafica, s.plant, s.allegati), sets: [], ...over,
  };
}

/** The four scenarios with their documents. */
export const documenti = (): { s: Scenario; input: RtDocInput; doc: ReportDoc<PdfBlock> }[] => SCENARI.map((f, i) => {
  const s = f(), input = docInput(s, i);
  return { s, input, doc: buildRelazioneModifica(input) };
});

/** Every text of a block. */
export function testiBlocco(b: PdfBlock): string[] {
  switch (b.t) {
    case 'kv': return b.rows.flat();
    case 'grid': return [...b.head, ...b.rows.flat()];
    case 'list': return b.items;
    case 'sign': return b.labels;
    case 'letterhead': return [...b.from, ...b.to];
    case 'plan': return [b.scale];
    case 'firme': return b.cols.flatMap((c) => [c.title, ...c.lines, c.box.label]);
    default: return [b.text];
  }
}

/** Every text of a document: its blocks and its meta. */
export const testi = (doc: ReportDoc<PdfBlock>): string[] => [...doc.blocks.flatMap(testiBlocco), ...Object.values(doc.meta).filter((v): v is string => typeof v === 'string')];

/** The blocks of the section titled «n. <titolo>», up to the next section. */
export function sezione(doc: ReportDoc<PdfBlock>, titolo: string): PdfBlock[] {
  const i = doc.blocks.findIndex((b) => b.t === 'h2' && b.text.replace(/^\d+\. /, '') === titolo);
  if (i < 0) return [];
  const j = doc.blocks.findIndex((b, k) => k > i && b.t === 'h2');
  return doc.blocks.slice(i, j < 0 ? undefined : j);
}
