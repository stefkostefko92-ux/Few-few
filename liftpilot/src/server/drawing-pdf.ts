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

const isUniqueViolation = (err: unknown): boolean => typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';

/** The set's drawing rendered (dated `issuedAt`, the set's issue) and kept; when a concurrent first download kept it
 *  first, that PDF. */
export async function keepSetPdf(drawingSetId: string, doc: DrawingDoc, issuedAt: Date): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = new Uint8Array(await renderTavole(doc, issuedAt));
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  try {
    await prisma.drawingSetPdf.create({ data: { drawingSetId, sha256, data: pdf } });
    return pdf;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const kept = await prisma.drawingSetPdf.findUnique({ where: { drawingSetId }, select: { data: true } });
    return kept ? new Uint8Array(kept.data) : pdf;
  }
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
