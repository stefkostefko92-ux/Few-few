import 'server-only';
// The PDF of an issued relazione tecnica di modifica (RT plan §0 row 2, §6.2, §7): its body — the document relazione.py
// draws, its pages numbered over the files that follow (meta.extraPages) — is rendered once (right after the issue,
// outside the answer, or at the first download while the RT still reproduces) and kept as issued (TechnicalReportPdf,
// immutable), served from then on, after an engine's change too; the fascicolo is assembled at each download from that
// body and the files as uploaded (their bytes are never stored twice), each page stamped like the body's
// (report/pdf-tool.mjs assemble), streamed from a file. The lines it stamps are read from the record, never from a
// document made again, so the same RT gives the same bytes before and after an engine changes.
import { after } from 'next/server';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { TYPE_OF, isAllegatoMime } from '@/lib/allegati/limits';
import type { PdfBlock, ReportDoc } from '@/lib/report/model';
import { RendererBusy, renderPdf } from '@/lib/report/render';
import { assembleFascicoloFile } from '@/lib/report/pdf-tool';
import type { ToolOutput } from '@/lib/report/render';
import { blobSlices } from '../allegati/blob';
import { piedeAllegato } from '@/lib/report/rt/build';
import { numeroRt } from '@/lib/report/rt/intestazione';
import { DOC, fill, sha16 } from '@/lib/report/rt/testi';
import type { RtRow } from './queries';

/** The renders under way, by RT: the one after the issue and a first download right after it share one render. */
const inFlight = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

/** The pages of a PDF the renderer made. */
async function pagesOf(pdf: Uint8Array): Promise<number> {
  return (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount();
}

/** The body rendered (dated `issuedAt`, the RT's issue) and kept, once per RT at a time; when another process kept it
 *  first, that one. */
export function keepRtPdf(reportId: string, doc: ReportDoc<PdfBlock>, issuedAt: Date): Promise<Uint8Array<ArrayBuffer>> {
  const running = inFlight.get(reportId);
  if (running) return running;
  const job = (async () => {
    const pdf = new Uint8Array(await renderPdf(doc, issuedAt));
    const sha256 = createHash('sha256').update(pdf).digest('hex'), pages = await pagesOf(pdf);
    const made = await prisma.technicalReportPdf.createMany({ data: [{ reportId, sha256, pages, data: pdf }], skipDuplicates: true });
    if (made.count) return pdf;
    const kept = await prisma.technicalReportPdf.findUnique({ where: { reportId }, select: { data: true } });
    return kept ? new Uint8Array(kept.data) : pdf;
  })().finally(() => inFlight.delete(reportId));
  inFlight.set(reportId, job);
  return job;
}

/** After an issue or a revision, once the answer is sent: the body kept (with the renderers busy, the first download
 *  keeps it). */
export function keepRtPdfLater(reportId: string, doc: ReportDoc<PdfBlock>, issuedAt: Date): void {
  after(() => keepRtPdf(reportId, doc, issuedAt).then(() => undefined, (err: unknown) => {
    if (!(err instanceof RendererBusy)) log.error({ err, reportId }, 'technical report pdf not kept');
  }));
}

/** The body kept for an RT, if any. */
export async function keptRtPdf(reportId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const kept = await prisma.technicalReportPdf.findUnique({ where: { reportId }, select: { data: true } });
  return kept ? new Uint8Array(kept.data) : null;
}

type StampRow = Pick<RtRow, 'number' | 'revision' | 'companyName' | 'createdAt'> & {
  projectData: unknown;
  roomDesign: { sha256: string; calculation: { sha256: string } } | null;
  liftDesign: { sha256: string; calculation: { sha256: string } } | null;
};

/** The installation's name as snapshotted on the RT. */
export const projectName = (pd: unknown): string => (pd && typeof pd === 'object' && 'name' in pd && typeof pd.name === 'string' ? pd.name : '');

/** The lines the appended pages carry (the body's header and code: src/lib/report/rt/build.ts meta; their own notice —
 *  a copy of a document the company uploaded, not made by LiftPilot, never the body's «valid with the signatures») and
 *  the PDF's information, read from the record. */
export function stampOf(r: StampRow): { header: string; code: string; notice: string; info: { title: string; author: string; subject: string; created: Date } } {
  const name = projectName(r.projectData), short = name.length > 60 ? `${name.slice(0, 59)}…` : name, numero = `${numeroRt(r.number)} R${r.revision}`;
  const calc = r.roomDesign?.calculation ?? r.liftDesign?.calculation;
  const impronte = [...(calc ? [`calcolo ${sha16(calc.sha256)}…`] : []), ...(r.roomDesign ? [`rilievo ${sha16(r.roomDesign.sha256)}…`] : []),
    ...(r.liftDesign ? [`progetto ${sha16(r.liftDesign.sha256)}…`] : [])].join(' · ');
  return {
    header: fill(DOC.header, { numero, impianto: short }), code: fill(DOC.code, { impronte }), notice: DOC.noticeAllegato,
    info: { title: `${DOC.titolo} ${numeroRt(r.number)} — ${name}`, author: r.companyName, subject: DOC.oggetto, created: r.createdAt },
  };
}

/** A fascicolo to send: the kept body alone (an RT without files), or the assembled file, open and already unlinked. */
export type Fascicolo = { kind: 'body'; bytes: Uint8Array<ArrayBuffer> } | ({ kind: 'file' } & ToolOutput);

/** The fascicolo: the kept body and every file of the RT in its order, with their bytes as uploaded — read from the
 *  database a slice at a time inside the renderer's slot (blob.ts), so a download holds no file whole and none before
 *  its turn; the fascicolo is a file the route streams. The lines stamped are made one-line by the typed side
 *  (pdf-tool.ts oneLine): a control character typed into a name never keeps an issued RT from its PDF. */
export async function fascicolo(r: RtRow, body: Uint8Array<ArrayBuffer>): Promise<Fascicolo> {
  if (!r.attachments.length) return { kind: 'body', bytes: body };
  const files = r.attachments.map((a) => {
    const mime = a.attachment.mime;
    if (!isAllegatoMime(mime)) throw new Error(`technical report ${r.id}: file ${a.position} missing`);
    return { data: blobSlices(a.attachmentId, a.attachment.size), type: TYPE_OF[mime], orientation: a.attachment.orientation, pages: a.pages,
      footer: piedeAllegato({ position: a.position, title: a.title, sha256: a.sha256 }) };
  });
  const s = stampOf(r);
  return { kind: 'file', ...await assembleFascicoloFile({ body, header: s.header, code: s.code, notice: s.notice, info: s.info, attachments: files }) };
}
