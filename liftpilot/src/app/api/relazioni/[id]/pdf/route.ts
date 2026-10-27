import { Readable } from 'node:stream';
import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { attachment, downloader, inFlight, text } from '@/server/download';
import { getRt } from '@/server/rt/queries';
import { fascicolo, keepRtPdf, keptRtPdf } from '@/server/rt/pdf';
import { rtFileName } from '@/server/rt/file-name';
import { rtRecord } from '@/server/rt/record';
import { rt2Record } from '@/server/rt2/record';
import { keepRt2Pdf } from '@/server/rt2/pdf';
import { isRt2 } from '@/lib/rt2/version';
import { RendererBusy, busyResponse } from '@/lib/report/render';
import { ANSWER } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The PDF of an issued relazione tecnica di modifica: its body as kept at the issue (src/server/rt/pdf.ts) — or, not kept
// yet, made again from its record only while the running engines reproduce it (src/server/rt/record.ts, the one rule) and
// kept —, then the files of the RT appended in their order with every page stamped, streamed from the file the tool
// wrote (never held whole). Otherwise 409: a new revision makes it again. Whoever may download the documents
// (report:download), at most 10 in 10 minutes and one at a time per user; another company's id: 404.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const d = await downloader('rt', 10);
  if ('refused' in d) return d.refused;
  const { user } = d;
  const release = inFlight(`rt:${user.id}`, 1);
  if (!release) return text(429, ANSWER.rateLimited);
  let streaming = false;
  try {
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, ANSWER.notFound);
    const r = await getRt(user, id.data);
    if (!r) return text(404, ANSWER.notFound);
    let body = await keptRtPdf(r.id);
    if (!body) {
      // after the owner's model (round 52) or the first RT: each made again by its own engine and renderer
      if (isRt2(r.engineVersion)) {
        const rec = rt2Record(r);
        if (!rec.ok) return text(409, ANSWER.stale);
        body = await keepRt2Pdf(r.id, rec.composed.doc, r.createdAt);
      } else {
        const rec = await rtRecord(r);
        if (!rec.ok) return text(409, ANSWER.stale);
        body = await keepRtPdf(r.id, rec.composed.doc, r.createdAt);
      }
    }
    const out = await fascicolo(r, body);
    await audit({ companyId: user.companyId, userId: user.id, action: 'REPORT_DOWNLOADED', entity: 'TechnicalReport', entityId: r.id, meta: { number: r.number, revision: r.revision } });
    if (out.kind === 'body') {
      const res = attachment(out.bytes, 'application/pdf', rtFileName(r));
      res.headers.set('Content-Length', String(out.bytes.length));
      return res;
    }
    // the file streamed and closed at its end, on an error or when the client goes away; the place freed then
    const file = out.handle.createReadStream({ autoClose: true });
    file.once('close', release);
    streaming = true;
    const res = attachment(Readable.toWeb(file) as ReadableStream<Uint8Array>, 'application/pdf', rtFileName(r));
    res.headers.set('Content-Length', String(out.size));
    return res;
  } catch (err) {
    if (err instanceof RendererBusy) return busyResponse();
    log.error({ err }, 'technical report pdf failed');
    return text(500, ANSWER.failed);
  } finally {
    if (!streaming) release();
  }
}
