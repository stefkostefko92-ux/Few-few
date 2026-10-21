// Round 46a: the PDF of every issued drawing set kept before an engine moves. A set's PDF is drawn the first time it is
// needed — after the issue, or at its first download — and only while the running engines still give its drawing
// (src/server/drawing-pdf.ts). A set issued and never downloaded whose PDF was not kept loses it for good once an engine
// changes (the route answers 409). This walks every DrawingSet without a DrawingSetPdf: one the running engines still
// draw (the hash of its drawing) is drawn and kept as its first download would keep it (compose → keepSetPdf), one at a
// time (the renderers take at most two at once), trying again while they are busy; the sets no longer drawn are listed
// for the owner; then (round 49) the bodies of the relazioni tecniche di modifica the same way (keep-rt-pdfs.ts, loaded only
// when the script runs). It writes nothing else (no audit, no record). Run it with a release that does not change an engine,
// before the one that does (DEPLOY.md): `npm run pdf:keep [-- --dry-run]` — in the container
// `docker compose exec -T app npm run pdf:keep`. It needs the server's environment (DATABASE_URL, AUTH_SECRET…) and the
// renderer (python3 with ReportLab, the fonts). --dry-run: only the list, nothing drawn. Idempotent.
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/lib/db';
import { RendererBusy } from '../src/lib/report/render';
import { composeStored } from '../src/server/drawing-compose';
import { keepSetPdf } from '../src/server/drawing-pdf';
import { getDrawingSet } from '../src/server/queries';
import { composeStoredRoom } from '../src/server/room-compose';
import { firstIssuedAt } from '../src/server/set-identity';

/** A set the walk met: kept now, kept meanwhile by another process, no longer drawn by the running engines, or failed. */
export interface SetLine {
  id: string;
  number: string;
  revision: number;
  company: string;
  project: string;
  outcome: 'kept' | 'already' | 'stale' | 'notFound' | 'failed' | 'listed';
  sha256?: string;
  error?: string;
}

export interface KeepOptions {
  dryRun?: boolean;
  /** tries while the renderers are busy, and the wait between them [ms] */
  tries?: number;
  waitMs?: number;
  /** one line per set as it is met */
  report?: (line: SetLine) => void;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The set drawn again from what it was made of, as the PDF route does: a whole project's set from its shaft design, a
 *  replacement's from its machine room; null when it has neither. */
async function compose(s: NonNullable<Awaited<ReturnType<typeof getDrawingSet>>>) {
  const first = await firstIssuedAt(s.companyId, s);
  return s.roomDesign ? composeStoredRoom({ ...s, firstIssuedAt: first, calculation: s.calculation, roomDesign: s.roomDesign, logo: s.logo, clientLogo: s.clientLogo })
    : s.shaftDesign ? composeStored({ ...s, firstIssuedAt: first, calculation: s.calculation, shaftDesign: s.shaftDesign, logo: s.logo, clientLogo: s.clientLogo }) : null;
}

/** Every set without a kept PDF, oldest first: drawn and kept when the running engines still draw it. */
export async function keepSetPdfs(o: KeepOptions = {}): Promise<SetLine[]> {
  const tries = o.tries ?? 6, waitMs = o.waitMs ?? 5000, out: SetLine[] = [];
  const missing = await prisma.drawingSet.findMany({ where: { pdf: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, companyId: true } });
  for (const m of missing) {
    const s = await getDrawingSet({ companyId: m.companyId }, m.id);
    const head = { id: m.id, number: s?.number ?? '?', revision: s?.revision ?? 0, company: s?.companyName ?? '?', project: s?.project.name ?? '?' };
    const done = (line: SetLine): void => { out.push(line); o.report?.(line); };
    // kept by the server between the list and now: never drawn again
    if (!s || s.pdf) { done({ ...head, outcome: s ? 'already' : 'notFound', ...(s?.pdf ? { sha256: s.pdf.sha256 } : {}) }); continue; }
    // a set that throws while it is drawn again (as the PDF route answers 500 for that set only): failed, the walk goes on
    let r: Awaited<ReturnType<typeof compose>>;
    try { r = await compose(s); } catch (err) { done({ ...head, outcome: 'failed', error: err instanceof Error ? err.message : String(err) }); continue; }
    // no longer drawn by the running engines: listed for the owner; any other reason the set is not drawn is named
    if (!r || 'ok' in r) { done({ ...head, ...(r?.error === 'engineChanged' ? { outcome: 'stale' } : { outcome: 'notFound', error: r?.error ?? 'noDesign' }) }); continue; }
    if (o.dryRun) { done({ ...head, outcome: 'listed' }); continue; }
    for (let i = 1; ; i++) {
      try {
        // dated as the set's issue (its revision's row), as the route keeps it: the same bytes as its first download
        await keepSetPdf(s.id, r.doc, s.createdAt);
        const kept = await prisma.drawingSetPdf.findUnique({ where: { drawingSetId: s.id }, select: { sha256: true } });
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

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const lines = await keepSetPdfs({ dryRun, report: (l) => process.stdout.write(`${l.outcome}\t${l.id}\t${l.number}${l.revision ? ` R${l.revision}` : ''}\t${l.company}\t${l.project}${l.sha256 ? `\t${l.sha256}` : ''}${l.error ? `\t${l.error}` : ''}\n`) });
  const count = (k: SetLine['outcome']): number => lines.filter((l) => l.outcome === k).length;
  process.stdout.write(`sets without a kept PDF: ${lines.length} — kept ${count('kept')}, kept meanwhile ${count('already')}, `
    + `${dryRun ? `to keep ${count('listed')}, ` : ''}no longer drawn by the running engines ${count('stale')} (listed above as "stale": the owner issues a `
    + `new revision where one is needed), not found or not drawn for another reason ${count('notFound')}, failed ${count('failed')} (the reason on `
    + `each line)\n`);
  // the relazioni tecniche di modifica (round 49): their bodies, kept the same way
  const { keepRtPdfs } = await import('./keep-rt-pdfs');
  const rts = await keepRtPdfs({ dryRun, report: (l) => process.stdout.write(`rt ${l.outcome}\t${l.id}\tRT ${l.number} R${l.revision}\t${l.company}${l.sha256 ? `\t${l.sha256}` : ''}${l.error ? `\t${l.error}` : ''}\n`) });
  const rtCount = (k: (typeof rts)[number]['outcome']): number => rts.filter((l) => l.outcome === k).length;
  process.stdout.write(`relazioni tecniche without a kept body: ${rts.length} — kept ${rtCount('kept')}, kept meanwhile ${rtCount('already')}, `
    + `${dryRun ? `to keep ${rtCount('listed')}, ` : ''}no longer reproduced ${rtCount('stale')} (a new revision makes them again), not found ${rtCount('notFound')}, `
    + `failed ${rtCount('failed')}\n`);
  await prisma.$disconnect();
  if (count('failed') || rtCount('failed')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
