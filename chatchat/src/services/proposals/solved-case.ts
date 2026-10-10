import type { Audience, Prisma } from '@prisma/client';
import { z } from 'zod';
import { appendAudit } from '../../audit.js';
import { audiencesFor, coversAudiences } from '../../auth/rbac.js';
import type { Principal } from '../../auth/sessions.js';
import { redactPii } from '../../domain/pii.js';
import { isVersion } from '../../domain/versions.js';
import type { CollabDeps } from '../collab/publish.js';
import { fail, ok, type Result } from '../collab/result.js';
import { contextOf, findCaseFor } from '../cases.js';
import { DocumentInputSchema, ingestDocument, type DocumentInput } from '../ingest.js';
import { stepsForSummary } from '../steps/summary.js';
import { OPEN_STATUSES } from './feedback.js';
import { notifyKnowledgeOwners } from './notify.js';
import { solvedCasePages, type DocLanguage } from './solved-case-text.js';

/**
 * „Решен случай → знание“ (§11.3 „Caso risolto → non entra automaticamente nella KB; richiede
 * review“): персоналът предлага решен случай; създава се ЧЕРНОВА документ тип SOLVED_CASE с
 * анонимизирано резюме през нормалното приемане (`ingestDocument` — DRAFT, AI не я вижда) и
 * предложение в опашката на отговорника за знанието. По-нататък — обичайният жизнен цикъл
 * (`admin-documents-lifecycle.ts`): submit → publish, с четири очи, ако е по безопасност
 * (предложилият е „качилият“ и не публикува сам).
 *
 * Аудиторията на черновата никога не е по-широка от цитираните в случая източници: резюме на
 * вътрешна процедура не става портален документ (ако е поискана по-тясна — тя печели).
 */

export const SolvedCaseInput = z
  .object({
    caseId: z.string().min(1).max(40),
    title: z.string().trim().min(3).max(200),
    rootCause: z.string().trim().max(2000).optional(),
    solution: z.string().trim().max(4000).optional(),
    audience: z.enum(['PORTAL', 'INTERNAL', 'ENGINEERING']).default('INTERNAL'),
    /** „exact“ — само за фърмуера на случая; „all“ — всички версии (изрично, §7.2). */
    firmwareScope: z.enum(['exact', 'all']).default('exact'),
    /** Само за конфигурация с опциите на случая (FR-01). */
    matchOptions: z.boolean().default(false),
    /** Бележка към отговорника за знанието (маскирана). */
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
export type SolvedCaseRequest = z.infer<typeof SolvedCaseInput>;

const AUDIENCE_RANK: Record<Audience, number> = { PORTAL: 0, INTERNAL: 1, ENGINEERING: 2 };
const widest = (list: readonly Audience[]): Audience =>
  list.reduce<Audience>((a, b) => (AUDIENCE_RANK[b] > AUDIENCE_RANK[a] ? b : a), 'PORTAL');

const LANGS: ReadonlySet<string> = new Set(['it', 'en']);
const UNSAFE_CLASSES: ReadonlySet<string> = new Set(['SAFETY_RELEVANT', 'DIRECT_COMMAND']);

interface AnswerPayload {
  evidence?: Array<{ documentId?: unknown }>;
  safety?: { level?: unknown };
}
const asAnswer = (v: Prisma.JsonValue): AnswerPayload =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as AnswerPayload) : {};

/** Текстът на резолюцията на тикета (само четене) — първопричина/решение, ако ги има. */
function resolutionText(json: Prisma.JsonValue | undefined): {
  rootCause: string | null;
  solution: string | null;
} {
  const r =
    json !== null && json !== undefined && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  return { rootCause: str(r.rootCause), solution: str(r.solution) };
}

export interface SolvedCaseResult {
  proposalId: string;
  documentId: string;
  documentCode: string;
  revision: string;
  audience: Audience;
  safetyRelevant: boolean;
}

export async function proposeSolvedCase(
  deps: CollabDeps,
  p: Principal,
  input: SolvedCaseRequest,
): Promise<Result<SolvedCaseResult>> {
  const { db } = deps;
  const c = await findCaseFor(db, p, input.caseId);
  if (!c) return fail(404, 'not_found');
  if (c.status !== 'RESOLVED' || c.outcome !== 'RESOLVED') return fail(409, 'case_not_resolved');
  const open = await db.knowledgeProposal.findFirst({
    where: {
      tenantId: c.tenantId,
      caseId: c.id,
      source: 'SOLVED_CASE',
      status: { in: [...OPEN_STATUSES] },
    },
    select: { id: true },
  });
  if (open) return fail(409, 'proposal_exists');

  const ticket = await db.ticket.findUnique({
    where: { caseId: c.id },
    select: { resolution: true },
  });
  const fromTicket = resolutionText(ticket?.resolution);
  const solution = input.solution ?? fromTicket.solution;
  if (!solution) return fail(422, 'solution_required');
  const rootCause = input.rootCause ?? fromTicket.rootCause;

  // Само AI отговорите, които предложилият вижда — резюмето не разширява достъпа.
  const readable = audiencesFor(p.user.role);
  const messages = (
    await db.caseMessage.findMany({
      where: { caseId: c.id, kind: 'AI' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, payload: true, audiences: true },
      take: 200,
    })
  ).filter((m) => coversAudiences(readable, m.audiences));
  const { executedSteps } = await stepsForSummary(db, c.id, messages);
  const citedIds = [
    ...new Set(
      messages.flatMap((m) =>
        (asAnswer(m.payload).evidence ?? [])
          .map((e) => e.documentId)
          .filter((x): x is string => typeof x === 'string'),
      ),
    ),
  ];
  const cited = citedIds.length
    ? await db.document.findMany({
        where: { id: { in: citedIds }, tenantId: c.tenantId },
        select: { audience: true, safetyRelevant: true },
      })
    : [];
  const audience = widest([input.audience, ...cited.map((d) => d.audience)]);
  const safetyRelevant =
    executedSteps.some((s) => UNSAFE_CLASSES.has(s.actionClass)) ||
    cited.some((d) => d.safetyRelevant) ||
    messages.some((m) => {
      const level = asAnswer(m.payload).safety?.level;
      return level === 'caution' || level === 'blocked';
    });

  const context = contextOf(c);
  const language = (LANGS.has(p.user.locale) ? p.user.locale : 'it') as DocLanguage;
  const code = `SC-${c.number.replace(/^CASE-/, '')}`;
  const revision = String((await db.document.count({ where: { tenantId: c.tenantId, code } })) + 1);
  const fw = context.firmware;
  const exactFw = input.firmwareScope === 'exact' && fw !== null && isVersion(fw);
  const options = input.matchOptions ? context.options : {};
  const parsed = DocumentInputSchema.safeParse({
    code,
    title: redactPii(input.title),
    type: 'SOLVED_CASE',
    language,
    revision,
    audience,
    safetyRelevant,
    sourceFilename: `${code}.txt`,
    effectiveFrom: new Date(),
    applicability: [
      {
        productModel: context.productModel,
        ...(context.hardwareRevision ? { hwRevision: context.hardwareRevision } : {}),
        ...(exactFw ? { fwMin: fw, fwMax: fw } : { allFirmware: true }),
        ...(Object.keys(options).length > 0 ? { options } : {}),
      },
    ],
    pages: solvedCasePages({
      context,
      steps: executedSteps.map((s) => ({
        step: s.step,
        action: s.action,
        expected: s.expected,
        result: s.result,
      })),
      rootCause,
      solution,
      language,
    }),
  });
  if (!parsed.success) return fail(422, 'invalid_input');
  const doc: DocumentInput = parsed.data;
  const ingested = await ingestDocument(db, c.tenantId, p.user.id, doc);
  if (!ingested.ok) {
    return fail(ingested.error.code === 'duplicate_revision' ? 409 : 422, ingested.error.code);
  }

  const proposal = await db.knowledgeProposal.create({
    data: {
      tenantId: c.tenantId,
      source: 'SOLVED_CASE',
      caseId: c.id,
      draftDocumentId: ingested.documentId,
      createdById: p.user.id,
      comment: input.note ? redactPii(input.note).slice(0, 1000) : null,
    },
    select: { id: true },
  });
  // Историята на документа (kb.document.*) показва и откъде е дошла черновата.
  await appendAudit(db, {
    tenantId: c.tenantId,
    actorId: p.user.id,
    action: 'kb.document.upload',
    objectType: 'document',
    objectId: ingested.documentId,
    detail: { code, revision, chunks: ingested.chunks, proposalId: proposal.id },
  });
  await appendAudit(db, {
    tenantId: c.tenantId,
    actorId: p.user.id,
    action: 'proposal.create',
    objectType: 'proposal',
    objectId: proposal.id,
    detail: {
      source: 'SOLVED_CASE',
      caseId: c.id,
      documentId: ingested.documentId,
      audience,
      safetyRelevant,
    },
  });
  await notifyKnowledgeOwners(deps, {
    tenantId: c.tenantId,
    proposalId: proposal.id,
    source: 'SOLVED_CASE',
    actorId: p.user.id,
  });
  return ok({
    proposalId: proposal.id,
    documentId: ingested.documentId,
    documentCode: code,
    revision,
    audience,
    safetyRelevant,
  });
}
