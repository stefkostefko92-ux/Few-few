// Round 49: the body of every issued relazione tecnica di modifica kept before an engine moves, as round 46a keeps the
// drawing sets' PDFs (keep-set-pdfs.ts, which runs this after the sets: `npm run pdf:keep`). An RT's body is rendered the
// first time it is needed — after the issue, or at its first download — and only while the running engines still
// reproduce it (src/server/rt/record.ts, the one rule); one issued and never downloaded whose body was not kept loses it
// for good once an engine changes (its PDF route answers 409, a new revision makes it again). This walks every
// TechnicalReport without a TechnicalReportPdf: one the running engines reproduce is rendered and kept as its first
// download would keep it, one at a time, trying again while the renderers are busy; the others are listed. Nothing else
// is written (no audit, no record); the files appended at download are the uploaded ones and are never copied.
import { RendererBusy } from '../src/lib/report/render';
import { prisma } from '../src/lib/db';
import { keepRtPdf } from '../src/server/rt/pdf';
import { getRt } from '../src/server/rt/queries';
import { rtRecord } from '../src/server/rt/record';

export interface RtLine {
  id: string;
  number: string;
  revision: number;
  company: string;
  outcome: 'kept' | 'already' | 'stale' | 'notFound' | 'failed' | 'listed';
  sha256?: string;
  error?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Every RT without a kept body, oldest first: rendered and kept when the running engines still reproduce it. */
export async function keepRtPdfs(o: { dryRun?: boolean; tries?: number; waitMs?: number; report?: (l: RtLine) => void } = {}): Promise<RtLine[]> {
  const tries = o.tries ?? 6, waitMs = o.waitMs ?? 5000, out: RtLine[] = [];
  const missing = await prisma.technicalReport.findMany({ where: { pdf: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, companyId: true } });
  for (const m of missing) {
    const r = await getRt({ companyId: m.companyId }, m.id);
    const head = { id: m.id, number: r?.number ?? '?', revision: r?.revision ?? 0, company: r?.companyName ?? '?' };
    const done = (line: RtLine): void => { out.push(line); o.report?.(line); };
    if (!r || r.pdf) { done({ ...head, outcome: r ? 'already' : 'notFound', ...(r?.pdf ? { sha256: r.pdf.sha256 } : {}) }); continue; }
    let rec: Awaited<ReturnType<typeof rtRecord>>;
    try { rec = await rtRecord(r); } catch (err) { done({ ...head, outcome: 'failed', error: err instanceof Error ? err.message : String(err) }); continue; }
    if (!rec.ok) { done({ ...head, outcome: rec.reason === 'unreadable' ? 'notFound' : 'stale', ...(rec.reason === 'unreadable' ? { error: 'unreadable' } : {}) }); continue; }
    if (o.dryRun) { done({ ...head, outcome: 'listed' }); continue; }
    for (let i = 1; ; i++) {
      try {
        await keepRtPdf(r.id, rec.composed.doc, r.createdAt);
        const kept = await prisma.technicalReportPdf.findUnique({ where: { reportId: r.id }, select: { sha256: true } });
        done({ ...head, outcome: 'kept', ...(kept ? { sha256: kept.sha256 } : {}) });
        break;
      } catch (err) {
        if (err instanceof RendererBusy && i < tries) { await sleep(waitMs); continue; }
        done({ ...head, outcome: 'failed', error: err instanceof Error ? err.message : String(err) });
        break;
      }
    }
  }
  return out;
}
