import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { caseAudiences, coversAudiences } from '../auth/rbac.js';
import type { DiagnosticAnswer } from '../domain/response.js';
import { redactPii } from '../domain/pii.js';
import {
  attachmentsByMessage,
  bindToMessage,
  type MessageAttachment,
} from '../services/attachments.js';
import { addTimeline, contextOf, findCaseFor, isUniqueOn } from '../services/cases.js';
import { caseAudience, notify } from '../services/collab/notify.js';

/**
 * §14.1 POST /chat/messages — съобщение в случая и (по подразбиране) диагностика от AI.
 * Записът на човешкото съобщение е ПРЕДИ извикването на модела: ако AI падне, разговорът
 * остава. Повтор със същия clientMessageId не дублира нищо (NFR-12).
 * Прикачените файлове (`attachmentIds`) се привързват към човешкото съобщение в същата
 * транзакция и НЕ се подават на AI — анализът на снимки е отделна стъпка (§9.2).
 */

const MessageInput = z.object({
  caseId: z.string().min(1).max(40),
  text: z.string().trim().min(1).max(4000),
  clientMessageId: z.uuid().optional(),
  /** false — съобщение до оператора без AI (FR-19). */
  askAi: z.boolean().default(true),
  /** CLEAN файлове от същия случай, качени от същия човек и още непривързани (FR-06). */
  attachmentIds: z.array(z.string().min(1).max(40)).max(5).default([]),
});

/** Невалиден файл в attachmentIds — транзакцията на съобщението се отменя. */
class InvalidAttachments extends Error {}

const HISTORY_MESSAGES = 12;
const LOCALES = new Set(['it', 'en', 'bg']);

function messageView(
  m: {
    id: string;
    kind: string;
    body: string;
    payload: Prisma.JsonValue;
    createdAt: Date;
  },
  attachments: MessageAttachment[] = [],
) {
  return {
    id: m.id,
    kind: m.kind,
    body: m.body,
    payload: m.payload,
    createdAt: m.createdAt,
    attachments,
  };
}

export function chatRouter(deps: WiredDeps): Router {
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
        const { caseId, clientMessageId, askAi } = parsed.data;
        const attachmentIds = [...new Set(parsed.data.attachmentIds)];
        // Лични данни в свободния текст се маскират ПРЕДИ запис и преди модела (GDPR чл. 5(1)(c)).
        const text = redactPii(parsed.data.text);
        const c = await findCaseFor(deps.db, p, caseId);
        if (!c) return apiError(res, 404, 'not_found');
        if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');

        /** Повтор със същия clientMessageId: вече записаното, без ново извикване (NFR-12). */
        const replay = async (id: string) => {
          const prior = await deps.db.caseMessage.findUnique({
            where: { caseId_clientMessageId: { caseId: c.id, clientMessageId: id } },
          });
          if (!prior) return false;
          // Отговорът на ТОВА съобщение: първият AI след него, но преди следващото човешко —
          // иначе повтор на съобщение без AI (askAi=false) би взел чужд, по-късен отговор.
          const next = await deps.db.caseMessage.findFirst({
            where: { caseId: c.id, kind: 'HUMAN', createdAt: { gt: prior.createdAt } },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          });
          const answer = await deps.db.caseMessage.findFirst({
            where: {
              caseId: c.id,
              kind: 'AI',
              createdAt: { gte: prior.createdAt, ...(next ? { lt: next.createdAt } : {}) },
            },
            orderBy: { createdAt: 'asc' },
          });
          const files = await attachmentsByMessage(deps.db, p.user.tenantId, [prior.id]);
          res.json({
            message: messageView(prior, files.get(prior.id)),
            answer: answer ? messageView(answer) : null,
          });
          return true;
        };
        if (clientMessageId && (await replay(clientMessageId))) return;

        const audiences = caseAudiences(p.user.role, c.portal);
        // Историята към модела — без AI отговори, търсени с аудитории, които питащият няма.
        const history = (
          await deps.db.caseMessage.findMany({
            where: { caseId: c.id, kind: { in: ['HUMAN', 'AI'] } },
            orderBy: { createdAt: 'desc' },
            take: HISTORY_MESSAGES,
            select: { kind: true, body: true, audiences: true },
          })
        ).filter((h) => h.kind !== 'AI' || coversAudiences(audiences, h.audiences));
        let message;
        try {
          message = await deps.db.$transaction(async (tx) => {
            const created = await tx.caseMessage.create({
              data: {
                caseId: c.id,
                kind: 'HUMAN',
                authorId: p.user.id,
                body: text,
                clientMessageId: clientMessageId ?? null,
              },
            });
            const bound = await bindToMessage(tx, attachmentIds, {
              tenantId: p.user.tenantId,
              caseId: c.id,
              userId: p.user.id,
              messageId: created.id,
            });
            if (!bound) throw new InvalidAttachments();
            await addTimeline(tx, c.id, 'message.created', p.user.id, {
              messageId: created.id,
              ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
            });
            return created;
          });
        } catch (err) {
          if (err instanceof InvalidAttachments) return apiError(res, 422, 'invalid_attachment');
          // Паралелен повтор със същия clientMessageId — първият печели, останалите го виждат.
          if (
            clientMessageId &&
            isUniqueOn(err, 'clientMessageId') &&
            (await replay(clientMessageId))
          )
            return;
          throw err;
        }

        const files = attachmentIds.length
          ? ((await attachmentsByMessage(deps.db, p.user.tenantId, [message.id])).get(message.id) ??
            [])
          : [];
        if (!askAi) {
          return res.status(201).json({ message: messageView(message, files), answer: null });
        }
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
              scope: { tenantId: p.user.tenantId, audiences },
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
          // Само вид и код — тялото на грешката от доставчика може да носи части от заявката.
          deps.logger.warn(
            {
              caseId: c.id,
              errName: err instanceof Error ? err.name : 'unknown',
              status:
                typeof err === 'object' && err !== null && 'status' in err ? err.status : null,
            },
            'AI извикването се провали',
          );
          return apiError(res, 503, 'ai_unavailable');
        }

        const answer: DiagnosticAnswer = result.answer;
        // Поет от оператор → остава при него; ескалиран с тикет → чака оператора, каквото и да
        // каже AI; иначе по отговора.
        const status =
          c.status === 'IN_PROGRESS'
            ? 'IN_PROGRESS'
            : c.outcome === 'ESCALATED' ||
                answer.escalation.recommended ||
                answer.status === 'undetermined'
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
              audiences: [...audiences],
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
        // FR-18: нов AI отговор в собствен случай — за създателя/поелия, ако не е питал сам.
        await notify(
          deps,
          caseAudience(c, p.user.id).map((userId) => ({
            tenantId: c.tenantId,
            userId,
            eventType: 'case.ai_answer' as const,
            objectType: 'case' as const,
            objectId: c.id,
            payload: { caseId: c.id, number: c.number, messageId: aiMessage.id },
          })),
          null,
        );
        res
          .status(201)
          .json({ message: messageView(message, files), answer: messageView(aiMessage) });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
