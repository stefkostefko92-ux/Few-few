import 'server-only';
// The PDF of an issued drawing set, kept as it was issued (DrawingSetPdf, immutable): rendered once — right after the
// issue, or at the first download while the running engines still reproduce the set (the hash of its drawing) — and
// served from the database from then on, after an engine's change too.
import { after } from 'next/server';
import { createHash } from 'node:crypto';
import type { DrawingDoc } from '@/drawing';
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { RendererBusy, renderTavole } from '@/lib/report/render';

/** The renders under way, by set: the background one after the issue and a first download right after it share one
 *  render (round 46: two ran, the second's insert failed on the unique set). */
const inFlight = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

/** The set's drawing rendered (dated `issuedAt`, the set's issue) and kept, once per set at a time; when another
 *  process kept it first, that PDF (the insert skips a set already kept, so no failed insert is logged). */
export function keepSetPdf(drawingSetId: string, doc: DrawingDoc, issuedAt: Date): Promise<Uint8Array<ArrayBuffer>> {
  const running = inFlight.get(drawingSetId);
  if (running) return running;
  const job = (async () => {
    const pdf = new Uint8Array(await renderTavole(doc, issuedAt));
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const made = await prisma.drawingSetPdf.createMany({ data: [{ drawingSetId, sha256, data: pdf }], skipDuplicates: true });
    if (made.count) return pdf;
    const kept = await prisma.drawingSetPdf.findUnique({ where: { drawingSetId }, select: { data: true } });
    return kept ? new Uint8Array(kept.data) : pdf;
  })().finally(() => inFlight.delete(drawingSetId));
  inFlight.set(drawingSetId, job);
  return job;
}

/** After an issue or a revision, once the answer is sent: the PDF kept (with the renderers busy, the first download
 *  keeps it). */
export function keepSetPdfLater(drawingSetId: string, doc: DrawingDoc, issuedAt: Date): void {
  after(() => keepSetPdf(drawingSetId, doc, issuedAt).then(() => undefined, (err: unknown) => {
    if (!(err instanceof RendererBusy)) log.error({ err, drawingSetId }, 'drawing set pdf not kept');
  }));
}

/** The PDF kept for a set, if any. */
export async function keptSetPdf(drawingSetId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const kept = await prisma.drawingSetPdf.findUnique({ where: { drawingSetId }, select: { data: true } });
  return kept ? new Uint8Array(kept.data) : null;
}
