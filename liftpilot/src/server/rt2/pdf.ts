import 'server-only';
// The body of an RT after the owner's model (round 52): rendered by report/fascicolo.py once — after the issue, outside
// the answer, or at the first download while the RT still reproduces — and kept as the first RT's (rt/pdf.ts
// keepPdfWith, TechnicalReportPdf); the fascicolo with its files is assembled at each download the same way.
import { after } from 'next/server';
import { log } from '@/lib/log';
import { RendererBusy, renderFascicolo } from '@/lib/report/render';
import type { FascicoloDoc } from '@/lib/report/rt2/model';
import { keepPdfWith } from '../rt/pdf';

export const keepRt2Pdf = (reportId: string, doc: FascicoloDoc, issuedAt: Date): Promise<Uint8Array<ArrayBuffer>> =>
  keepPdfWith(reportId, () => renderFascicolo(doc, issuedAt));

export function keepRt2PdfLater(reportId: string, doc: FascicoloDoc, issuedAt: Date): void {
  after(() => keepRt2Pdf(reportId, doc, issuedAt).then(() => undefined, (err: unknown) => {
    if (!(err instanceof RendererBusy)) log.error({ err, reportId }, 'technical report pdf not kept');
  }));
}
