import 'server-only';
// The issue of an RT after the owner's model and its revisions (round 52): the inputs validated (zod, the day filled with
// Italy's day when missing), the base the installation has now (base.ts) reproduced, the files of this installation only
// and within the RT's limits, nothing missing to issue (derive.ts mancanti: the first page, the signatures, the regime,
// each component's required inputs), and the checks not met or with «Attenzione» confirmed by the engineer. Then, in one
// transaction, as the first RT: the files locked and read again, a number YY-NNN of the company and year (or, for a
// revision of the latest revision of a number, the same number, revision + 1 with its note), the RT made from its parts
// (compose.ts) and stored. The body's PDF is kept after the answer (pdf.ts); the draft is dropped; nothing is sent.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { SessionUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { RT_ALLEGATI_LIMITS } from '@/lib/allegati/limits';
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { plantData } from '@/lib/plant';
import { etichettaIntervento } from '@/lib/report/intervento-text';
import { DOC } from '@/lib/report/rt/testi';
import { dataRtValida } from '@/lib/rt/input';
import { rt2InputsSchema, type Rt2Inputs } from '@/lib/rt2/input';
import { RT2_ENGINE_VERSION } from '@/lib/rt2/version';
import { idSchema } from '@/lib/schemas';
import { setNumber } from '@/lib/tavole/compose';
import { dropDraft } from '../drafts';
import { allegatiRt, filesOf } from '../rt/compose';
import { giornoIt, type RtError } from '../rt/issue';
import { logoImage } from '../rt/record';
import { rt2BaseOf, type ProjectRt2 } from './base';
import { composeRt2 } from './compose';
import { keepRt2PdfLater } from './pdf';

/** What the engineer confirms before the issue: the checks not met and those with «Attenzione», by their text. */
export interface Conferma2 { fails: string[]; warns: string[] }
export type Rt2IssueResult = { ok: true; id: string } | { ok: false; error: RtError; campi?: string[]; conferma?: Conferma2 };

class Refused extends Error {
  constructor(readonly code: RtError) { super(code); }
}
const codeOf = (err: unknown): string | undefined => (typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined);
const revisioniSchema = z.array(z.object({ mark: z.string(), text: z.string(), date: z.string() }).strict());
const asJson = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function conGiorno(raw: unknown, day: string): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>, doc = o.doc && typeof o.doc === 'object' && !Array.isArray(o.doc) ? o.doc as Record<string, unknown> : {};
  return { ...o, doc: { ...doc, data: typeof doc.data === 'string' && doc.data.trim() ? doc.data : day } };
}

export async function emettiRt2(user: SessionUser, input: { projectId: unknown; inputs: unknown; conferma?: unknown; revisionOf?: unknown }): Promise<Rt2IssueResult> {
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

  const state = await rt2BaseOf(user, projectId);
  if (!state.result.ok) return { ok: false, error: state.result.reason === 'engineChanged' ? 'rtBaseOutdated' : 'rtNotEligible' };
  const base = state.result.base, issuedAt = new Date(), oggi = giornoIt(issuedAt);
  const parsed = rt2InputsSchema.safeParse(conGiorno(input.inputs, oggi));
  if (!parsed.success) return { ok: false, error: 'invalidFields', campi: [...new Set(parsed.error.issues.map((i) => i.path.join('.')))] };
  const inputs: Rt2Inputs = asJson(parsed.data), day = inputs.doc?.data ?? oggi;
  if (!dataRtValida(day, oggi, giornoIt(base.calc.createdAt))) return { ok: false, error: 'dataNonValida', campi: ['doc.data'] };
  const nota = inputs.revisione?.testo?.trim() ?? '';
  if (prev && (nota.length < 3 || nota.length > 120)) return { ok: false, error: 'notaRevisione', campi: ['revisione.testo'] };

  const ids = (inputs.allegati ?? []).map((a) => a.attachmentId);
  const rows = await filesOf(prisma, user, projectId, ids), allegati = allegatiRt(inputs.allegati, rows);
  if (!allegati) return { ok: false, error: 'allegatoEstraneo' };
  if (allegati.length > RT_ALLEGATI_LIMITS.maxFiles || allegati.reduce((n, a) => n + a.pages, 0) > RT_ALLEGATI_LIMITS.maxPages
    || rows.reduce((n, r) => n + r.size, 0) > RT_ALLEGATI_LIMITS.maxBytes) return { ok: false, error: 'allegatiTroppi' };

  const projectData: ProjectRt2 = { name: project.name, address: project.address, city: project.city, province: project.province, plantNumber: project.plantNumber, client: project.client };
  const company0 = { name: user.companyName, logo: null, logoSha256: null };
  const draft = composeRt2({ number: null, revision: 0, revisions: [], base, inputs, project: projectData, company: company0, allegati });
  const d = draft.derived;
  if (d.mancanti.length) return { ok: false, error: 'rtIncomplete', campi: [...new Set(d.mancanti.map((m) => (m.campo.includes('.') ? m.campo : `${m.dove}.${m.campo}`)))] };
  const conferma: Conferma2 = { fails: d.verifiche.filter((v) => v.esito === 'fail').map((v) => v.testo), warns: d.verifiche.filter((v) => v.esito === 'warn').map((v) => v.testo) };
  if ((conferma.fails.length || conferma.warns.length) && input.conferma !== true) return { ok: false, error: 'conferma', conferma };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await prisma.$transaction(async (tx) => {
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
          year = Number(oggi.slice(0, 4));
          const counter = await tx.technicalReportCounter.upsert({
            where: { companyId_year: { companyId: user.companyId, year } }, create: { companyId: user.companyId, year, last: 1 }, update: { last: { increment: 1 } },
          });
          seq = counter.last; number = setNumber(year, seq); revision = 0;
          revisions = [{ mark: 'R0', text: DOC.primaEmissione, date: day }];
        }
        const company = await tx.company.findUnique({ where: { id: user.companyId }, select: { name: true, logo: { select: { id: true, mime: true, data: true, sha256: true } } } });
        if (!company) throw new Refused('notFound');
        const logo = logoImage(company.logo), logoRow = logo ? company.logo : null;
        const c = composeRt2({ number, revision, revisions, base, inputs, project: projectData, company: { name: company.name, logo, logoSha256: logoRow?.sha256 ?? null }, allegati: files });
        const rt = await tx.technicalReport.create({
          data: {
            companyId: user.companyId, projectId, userId: user.id, number, year, seq, revision, revisions, calculationId: base.calc.id, roomDesignId: null, liftDesignId: null,
            inputs: inputs as Prisma.InputJsonValue, anagrafica: asJson(base.base.anagrafica) as Prisma.InputJsonValue, projectData: { ...projectData },
            plant: asJson(plantData(project.plant)) as Prisma.InputJsonValue, companyName: company.name, logoId: logoRow?.id ?? null,
            results: c.results as Prisma.InputJsonValue, engineVersion: RT2_ENGINE_VERSION, sha256: c.sha256,
            verdict: c.derived.esito === 'fail' ? 'FAIL' : c.derived.esito === 'warn' ? 'WARN' : 'OK', failCount: c.derived.fails, warnCount: c.derived.warns,
            createdAt: issuedAt, citedSetIds: [],
            summary: `${etichettaIntervento(base.calc.tipo, base.base.C)} · ${c.derived.componenti.length} componenti · ${files.length} allegati · R${revision}`,
            attachments: { create: files.map((a) => ({ position: a.position, attachmentId: a.attachmentId, title: a.title, kind: a.kind, component: a.component, sha256: a.sha256, pages: a.pages })) },
          },
          select: { id: true },
        });
        return { id: rt.id, number, revision, doc: c.doc };
      }, { timeout: 30_000, maxWait: 10_000 });
      keepRt2PdfLater(out.id, out.doc, issuedAt);
      await dropDraft(user.companyId, projectId, 'rt2');
      await audit({ companyId: user.companyId, userId: user.id, action: prev ? 'TECHNICAL_REPORT_REVISED' : 'TECHNICAL_REPORT_ISSUED', entity: 'TechnicalReport',
        entityId: out.id, meta: { number: out.number, revision: out.revision } });
      log.info({ userId: user.id, technicalReportId: out.id }, prev ? 'technical report revised' : 'technical report issued');
      return { ok: true, id: out.id };
    } catch (err) {
      if (err instanceof Refused) return { ok: false, error: err.code };
      const code = codeOf(err);
      if (code === 'P2003') return { ok: false, error: 'allegatoEliminato' };
      if (code === 'P2002' && attempt === 0 && !prev) continue;
      if (code === 'P2002') return { ok: false, error: 'conflict' };
      throw err;
    }
  }
  return { ok: false, error: 'conflict' };
}
