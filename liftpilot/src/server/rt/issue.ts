import 'server-only';
// The issue of a relazione tecnica di modifica and its revisions (RT plan §7): the inputs validated (zod, the day of the
// RT filled with Italy's day when missing), the base the installation has now (base.ts) reproduced, the files of this
// installation only and within the RT's limits, nothing blocking missing (the registry's identity, the signatures, a
// regime chosen or confirmed and agreeing with the CE marking), and what is not satisfied, missing or still to attach
// confirmed by the engineer. Then, in one transaction: the RT's files locked against a delete and read again, a new
// number YY-NNN of the company and year (or, for a revision of the latest revision of a number, the same number and
// revision + 1 with its note), the RT made from its parts (compose.ts) and stored with its files' snapshot. The body's PDF
// is kept after the answer (pdf.ts); the draft is dropped; nothing is sent to anyone.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { SessionUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { RT_ALLEGATI_LIMITS } from '@/lib/allegati/limits';
import { PNG_HEAD_BYTES, pngWay } from '@/lib/allegati/png';
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { plantData } from '@/lib/plant';
import { DOC } from '@/lib/report/rt/testi';
import { anagraficaData } from '@/lib/rt/anagrafica';
import { dataRtValida, rtInputsSchema, type RtInputs } from '@/lib/rt/input';
import { titoloSezione } from '@/lib/rt/sezioni';
import { RT_ENGINE_VERSION } from '@/lib/rt/version';
import { idSchema } from '@/lib/schemas';
import { setNumber } from '@/lib/tavole/compose';
import { etichettaIntervento } from '@/lib/report/intervento-text';
import { blobHead } from '../allegati/blob';
import { dropDraft } from '../drafts';
import { rtBaseOf } from './base';
import { allegatiRt, asJson, composeRt, filesOf, setsCitati, type ProjectDataRt } from './compose';
import { keepRtPdfLater } from './pdf';
import { idsNamed } from './queries';
import { logoImage } from './record';
import { confermaOf, daConfermare, summaryOf, type Conferma } from './summary';

export type RtError = 'forbidden' | 'rateLimited' | 'invalidFields' | 'notFound' | 'archived' | 'rtNotEligible' | 'rtBaseOutdated' | 'rtIncomplete'
  | 'rtLawMismatch' | 'conferma' | 'allegatoEstraneo' | 'allegatiTroppi' | 'dataNonValida' | 'notaRevisione' | 'revisioneNonUltima' | 'allegatoEliminato' | 'conflict';
export type RtIssueResult = { ok: true; id: string } | { ok: false; error: RtError; campi?: string[]; conferma?: Conferma };

/** Italy's day of an instant, YYYY-MM-DD. */
export const giornoIt = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const yearIt = (d: Date): number => Number(giornoIt(d).slice(0, 4));

/** Refused inside the transaction: thrown, so the number taken rolls back. */
class Refused extends Error {
  constructor(readonly code: RtError) { super(code); }
}
const codeOf = (err: unknown): string | undefined => (typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined);

const revisioniSchema = z.array(z.object({ mark: z.string(), text: z.string(), date: z.string() }).strict());

/** The inputs with the day of the RT (Italy's, when none) before the issue's schema. */
function conGiorno(raw: unknown, day: string): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>, doc = o.doc && typeof o.doc === 'object' && !Array.isArray(o.doc) ? o.doc as Record<string, unknown> : {};
  return { ...o, doc: { ...doc, data: typeof doc.data === 'string' && doc.data.trim() ? doc.data : day } };
}

/** The pixels of the RT's PNGs the fascicolo decodes again (src/lib/allegati/png.ts, read from their first bytes): what
 *  its assembly's time depends on. */
async function slowPixels(rows: readonly { id: string; mime: string }[]): Promise<number> {
  let n = 0;
  for (const r of rows.filter((x) => x.mime === 'image/png')) {
    const w = pngWay(await blobHead(r.id, PNG_HEAD_BYTES));
    n += !w ? 0 : w.way === 'slow' ? w.pixels : 0;
  }
  return n;
}

/** «Solo argano · 7 sezioni · 2 allegati · R0». */
const summaryLine = (tipo: string, sezioni: number, allegati: number, revision: number): string =>
  `${tipo} · ${sezioni} ${sezioni === 1 ? 'sezione' : 'sezioni'} · ${allegati} ${allegati === 1 ? 'allegato' : 'allegati'} · R${revision}`;

export async function emettiRt(user: SessionUser, input: { projectId: unknown; inputs: unknown; conferma?: unknown; revisionOf?: unknown }): Promise<RtIssueResult> {
  const pid = idSchema.safeParse(input.projectId), revOf = input.revisionOf == null ? null : idSchema.safeParse(input.revisionOf);
  if (!pid.success || revOf?.success === false) return { ok: false, error: 'invalidFields' };
  const projectId = pid.data;
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    select: { id: true, archivedAt: true, name: true, address: true, city: true, province: true, plantNumber: true, client: true, plant: true, anagrafica: true },
  });
  if (!project) return { ok: false, error: 'notFound' };
  if (project.archivedAt) return { ok: false, error: 'archived' };
  const prev = revOf?.data ? await prisma.technicalReport.findFirst({ where: { id: revOf.data, companyId: user.companyId, projectId }, select: { id: true, number: true, year: true, seq: true } }) : null;
  if (revOf?.data && !prev) return { ok: false, error: 'notFound' };

  const state = await rtBaseOf(user, projectId);
  if (!state.result.ok) return { ok: false, error: state.result.reason === 'engineChanged' ? 'rtBaseOutdated' : 'rtNotEligible' };
  const base = state.result.base, issuedAt = new Date(), oggi = giornoIt(issuedAt);
  const parsed = rtInputsSchema.safeParse(conGiorno(input.inputs, oggi));
  if (!parsed.success) {
    const richiesti = parsed.error.issues.every((i) => i.message === 'richiesto');
    return { ok: false, error: richiesti ? 'rtIncomplete' : 'invalidFields', campi: [...new Set(parsed.error.issues.map((i) => i.path.join('.')))] };
  }
  const inputs: RtInputs = asJson(parsed.data), day = inputs.doc?.data ?? oggi;
  if (!dataRtValida(day, oggi, giornoIt(new Date(base.records.calc.createdAt)))) return { ok: false, error: 'dataNonValida', campi: ['doc.data'] };
  const nota = inputs.revisione?.testo?.trim() ?? '';
  if (prev && (nota.length < 3 || nota.length > 120)) return { ok: false, error: 'notaRevisione', campi: ['revisione.testo'] };

  // the files: of this installation, each one named in the RT's list (documents and sources too), within the limits
  const ids = (inputs.allegati ?? []).map((a) => a.attachmentId), listed = new Set(ids);
  if (idsNamed(inputs).some((id) => !listed.has(id))) return { ok: false, error: 'allegatoEstraneo' };
  const rows = await filesOf(prisma, user, projectId, ids), allegati = allegatiRt(inputs.allegati, rows);
  if (!allegati) return { ok: false, error: 'allegatoEstraneo' };
  if (allegati.length > RT_ALLEGATI_LIMITS.maxFiles || allegati.reduce((n, a) => n + a.pages, 0) > RT_ALLEGATI_LIMITS.maxPages
    || rows.reduce((n, r) => n + r.size, 0) > RT_ALLEGATI_LIMITS.maxBytes
    || await slowPixels(rows) > RT_ALLEGATI_LIMITS.maxSlowPixels) return { ok: false, error: 'allegatiTroppi' };

  const anagrafica = asJson(anagraficaData(project.anagrafica)), plant = asJson(plantData(project.plant));
  const projectData: ProjectDataRt = { name: project.name, address: project.address, city: project.city, province: project.province, plantNumber: project.plantNumber, client: project.client };
  // before a number is taken: what blocks, what the engineer confirms (on the draft's document: the same derivation)
  const draft = composeRt({ number: null, revision: 0, revisions: [], base, inputs, anagrafica, plant, project: projectData, company: { name: user.companyName, logo: null, logoSha256: null }, allegati, sets: [] });
  const d = draft.derived;
  if (d.regime.legge && !d.regime.coerente) return { ok: false, error: 'rtLawMismatch' };
  const bloccanti = d.mancanti.filter((m) => m.bloccante);
  if (bloccanti.length) return { ok: false, error: 'rtIncomplete', campi: [...new Set(bloccanti.map((m) => m.campo))] };
  const conferma = confermaOf(summaryOf(draft.input));
  if (daConfermare(conferma) && input.conferma !== true) return { ok: false, error: 'conferma', conferma };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await prisma.$transaction(async (tx) => {
        // the RT's files locked (a delete waits for the issue, src/server/allegati/quota.ts) and read again
        if (ids.length) {
          const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Attachment" WHERE id IN (${Prisma.join(ids)}) AND "companyId" = ${user.companyId} AND "projectId" = ${projectId} FOR KEY SHARE`;
          if (locked.length !== ids.length) throw new Refused('allegatoEliminato');
        }
        const files = allegatiRt(inputs.allegati, await filesOf(tx, user, projectId, ids));
        if (!files) throw new Refused('allegatoEliminato');
        let number: string, year: number, seq: number, revision: number, revisions: { mark: string; text: string; date: string }[];
        if (prev) {
          const last = await tx.technicalReport.findFirst({ where: { companyId: user.companyId, year: prev.year, seq: prev.seq }, orderBy: { revision: 'desc' }, select: { id: true, revision: true, revisions: true } });
          const past = revisioniSchema.safeParse(last?.revisions);
          if (!last || last.id !== prev.id || !past.success) throw new Refused('revisioneNonUltima');
          ({ number, year, seq } = prev);
          revision = last.revision + 1;
          revisions = [...past.data, { mark: `R${revision}`, text: nota, date: day }];
        } else {
          year = yearIt(issuedAt);
          const counter = await tx.technicalReportCounter.upsert({
            where: { companyId_year: { companyId: user.companyId, year } }, create: { companyId: user.companyId, year, last: 1 }, update: { last: { increment: 1 } },
          });
          seq = counter.last; number = setNumber(year, seq); revision = 0;
          revisions = [{ mark: 'R0', text: DOC.primaEmissione, date: day }];
        }
        const company = await tx.company.findUnique({ where: { id: user.companyId }, select: { name: true, logo: { select: { id: true, mime: true, data: true, sha256: true } } } });
        if (!company) throw new Refused('notFound');
        const logo = logoImage(company.logo), logoRow = logo ? company.logo : null, sets = await setsCitati(tx, user.companyId, base, issuedAt);
        const c = composeRt({ number, revision, revisions, base, inputs, anagrafica, plant, project: projectData,
          company: { name: company.name, logo, logoSha256: logoRow?.sha256 ?? null }, allegati: files, sets });
        const rt = await tx.technicalReport.create({
          data: {
            companyId: user.companyId, projectId, userId: user.id, number, year, seq, revision, revisions, calculationId: base.records.calc.id,
            roomDesignId: base.records.room?.id ?? null, liftDesignId: base.records.lift?.id ?? null, inputs: inputs as Prisma.InputJsonValue,
            anagrafica: anagrafica as Prisma.InputJsonValue, projectData: { ...projectData }, plant: plant as Prisma.InputJsonValue, companyName: company.name,
            logoId: logoRow?.id ?? null, results: asJson(c.results) as unknown as Prisma.InputJsonValue, engineVersion: RT_ENGINE_VERSION, sha256: c.sha256,
            verdict: c.derived.verdict, failCount: c.derived.failCount, warnCount: c.derived.warnCount, createdAt: issuedAt, citedSetIds: sets.map((x) => x.id),
            summary: summaryLine(etichettaIntervento(base.tipo, base.collaudo), c.derived.sezioni.length, files.length, revision),
            attachments: { create: files.map((a) => ({ position: a.position, attachmentId: a.attachmentId, title: a.title, kind: a.kind, component: a.component, sha256: a.sha256, pages: a.pages })) },
          },
          select: { id: true },
        });
        return { id: rt.id, number, revision, doc: c.doc, sezioni: c.derived.sezioni.map((s) => titoloSezione(s.key)) };
      }, { timeout: 30_000, maxWait: 10_000 });
      keepRtPdfLater(out.id, out.doc, issuedAt);
      await dropDraft(user.companyId, projectId, 'rt');
      await audit({ companyId: user.companyId, userId: user.id, action: prev ? 'TECHNICAL_REPORT_REVISED' : 'TECHNICAL_REPORT_ISSUED', entity: 'TechnicalReport',
        entityId: out.id, meta: { number: out.number, revision: out.revision } });
      log.info({ userId: user.id, technicalReportId: out.id }, prev ? 'technical report revised' : 'technical report issued');
      return { ok: true, id: out.id };
    } catch (err) {
      if (err instanceof Refused) return { ok: false, error: err.code };
      const code = codeOf(err);
      // a file deleted meanwhile without waiting (the deferred key, checked at the commit)
      if (code === 'P2003') return { ok: false, error: 'allegatoEliminato' };
      // two first issues of the year at once: the counter row was made by the other one; once more
      if (code === 'P2002' && attempt === 0 && !prev) continue;
      if (code === 'P2002') return { ok: false, error: 'conflict' };
      throw err;
    }
  }
  return { ok: false, error: 'conflict' };
}
