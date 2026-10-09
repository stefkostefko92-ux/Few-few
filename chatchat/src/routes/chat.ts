import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { caseAudiences } from '../auth/rbac.js';
import type { DiagnosticAnswer } from '../domain/response.js';
import { addTimeline, contextOf, findCaseFor } from '../services/cases.js';

/**
 * §14.1 POST /chat/messages — съобщение в случая и (по подразбиране) диагностика от AI.
 * Записът на човешкото съобщение е ПРЕДИ извикването на модела: ако AI падне, разговорът
 * остава. Повтор със същия clientMessageId не дублира нищо (NFR-12).
 */

const MessageInput = z.object({
  caseId: z.string().min(1).max(40),
  text: z.string().trim().min(1).max(4000),
  clientMessageId: z.uuid().optional(),
  /** false — съобщение до оператора без AI (FR-19). */
  askAi: z.boolean().default(true),
});

const HISTORY_MESSAGES = 12;
const LOCALES = new Set(['it', 'en', 'bg']);

function messageView(m: {
  id: string;
  kind: string;
  body: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
}) {
  return { id: m.id, kind: m.kind, body: m.body, payload: m.payload, createdAt: m.createdAt };
}

export function chatRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));

  // Разход и злоупотреба (§15.1): по потребител, не по IP — техниците са зад един NAT.
  const askLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
    handler: (_req, res) => apiError(res, 429, 'too_many_requests'),
  });

  router.post(
    '/chat/messages',
    askLimiter,
    requireCapability('chat:ask'),
    async (req, res, next) => {
      try {
        const parsed = MessageInput.safeParse(req.body);
        if (!parsed.success) return apiError(res, 400, 'invalid_input');
        const p = principalOf(req);
        const { caseId, text, clientMessageId, askAi } = parsed.data;
        const c = await findCaseFor(deps.db, p, caseId);
        if (!c) return apiError(res, 404, 'not_found');
        if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');

        if (clientMessageId) {
          const prior = await deps.db.caseMessage.findUnique({
            where: { caseId_clientMessageId: { caseId: c.id, clientMessageId } },
          });
          if (prior) {
            const answer = await deps.db.caseMessage.findFirst({
              where: { caseId: c.id, kind: 'AI', createdAt: { gte: prior.createdAt } },
              orderBy: { createdAt: 'asc' },
            });
            return res.json({
              message: messageView(prior),
              answer: answer ? messageView(answer) : null,
            });
          }
        }

        const history = await deps.db.caseMessage.findMany({
          where: { caseId: c.id, kind: { in: ['HUMAN', 'AI'] } },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_MESSAGES,
          select: { kind: true, body: true },
        });
        const message = await deps.db.caseMessage.create({
          data: {
            caseId: c.id,
            kind: 'HUMAN',
            authorId: p.user.id,
            body: text,
            clientMessageId: clientMessageId ?? null,
          },
        });
        await addTimeline(deps.db, c.id, 'message.created', p.user.id, { messageId: message.id });

        if (!askAi) return res.status(201).json({ message: messageView(message), answer: null });
        if (!deps.diagnose) return apiError(res, 503, 'ai_unavailable');

        await deps.db.case.update({ where: { id: c.id }, data: { status: 'AI_IN_PROGRESS' } });
        const controller = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) controller.abort();
        });
        let result;
        try {
          result = await deps.diagnose(
            {
              scope: {
                tenantId: p.user.tenantId,
                audiences: caseAudiences(p.user.role, c.portal),
              },
              context: contextOf(c),
              question: text,
              history: history.reverse().map((h) => ({
                role: h.kind === 'AI' ? ('assistant' as const) : ('user' as const),
                content: h.body,
              })),
              locale: (LOCALES.has(p.user.locale) ? p.user.locale : 'it') as 'it' | 'en' | 'bg',
            },
            controller.signal,
          );
        } catch (err) {
          await deps.db.case.update({ where: { id: c.id }, data: { status: c.status } });
          await appendAudit(deps.db, {
            tenantId: p.user.tenantId,
            actorId: p.user.id,
            action: 'ai.error',
            objectType: 'case',
            objectId: c.id,
            detail: { name: err instanceof Error ? err.name : 'unknown' },
          });
          deps.logger.warn({ caseId: c.id, err }, 'AI извикването се провали');
          return apiError(res, 503, 'ai_unavailable');
        }

        const answer: DiagnosticAnswer = result.answer;
        const status =
          c.status === 'IN_PROGRESS'
            ? 'IN_PROGRESS'
            : answer.escalation.recommended || answer.status === 'undetermined'
              ? 'WAITING_TECHNICIAN'
              : 'OPEN';
        const aiMessage = await deps.db.$transaction(async (tx) => {
          const created = await tx.caseMessage.create({
            data: {
              caseId: c.id,
              kind: 'AI',
              body: answer.summary,
              payload: answer as unknown as Prisma.InputJsonValue,
              knowledgeSnapshotId: answer.knowledgeSnapshotId,
              promptVersion: answer.promptVersion,
            },
          });
          if (answer.evidence.length > 0) {
            await tx.caseEvidence.createMany({
              data: answer.evidence.map((e) => ({
                caseId: c.id,
                messageId: created.id,
                documentId: e.documentId,
                chunkId: e.chunkId,
                errorId: e.errorId,
                page: e.page,
                quote: e.quote,
              })),
            });
          }
          await tx.case.update({ where: { id: c.id }, data: { status } });
          await addTimeline(tx, c.id, 'ai.answer', null, {
            messageId: created.id,
            status: answer.status,
            confidence: answer.confidence,
            evidenceLevel: answer.gate.evidenceLevel,
            decisions: answer.gate.decisions,
          });
          return created;
        });
        // FR-12: retrieval, извиквания на инструменти, версия на знанието и решенията на Gate.
        await appendAudit(deps.db, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'ai.answer',
          objectType: 'case_message',
          objectId: aiMessage.id,
          detail: {
            caseId: c.id,
            modelCalled: result.modelCalled,
            evidenceLevel: answer.gate.evidenceLevel,
            evidenceRefs: result.evidence.map((e) => e.chunkId ?? e.errorId),
            citations: answer.evidence.length,
            removedSteps: answer.gate.removedSteps,
            droppedCitations: answer.gate.droppedCitations,
            decisions: answer.gate.decisions,
            safety: answer.safety.level,
            escalation: answer.escalation.recommended,
            knowledgeSnapshotId: answer.knowledgeSnapshotId,
            promptVersion: answer.promptVersion,
            usage: result.usage,
          },
        });
        res.status(201).json({ message: messageView(message), answer: messageView(aiMessage) });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
