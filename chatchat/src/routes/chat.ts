import type { CaseMessage } from '@prisma/client';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sharedStore } from '../auth/rate-limit.js';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { caseAudiences } from '../auth/rbac.js';
import { redactPii } from '../domain/pii.js';
import {
  attachmentsByMessage,
  bindToMessage,
  type MessageAttachment,
} from '../services/attachments.js';
import { awaitPeerAnswer, claimAi, findPrior, type PriorMessage } from '../services/chat-replay.js';
import { addTimeline, findCaseFor, isUniqueOn } from '../services/cases.js';
import { afterCaseMessage, aiPausedFor, onCaseMessageTx } from '../services/tickets/messages.js';
import type { MessageFlow } from '../services/tickets/messages.js';
import { answerMessage, messageView } from './chat-answer.js';

/**
 * §14.1 POST /chat/messages — съобщение в случая и (по подразбиране) диагностика от AI.
 * Записът на човешкото съобщение е ПРЕДИ извикването на модела: ако AI падне, разговорът
 * остава. Повтор със същия clientMessageId не дублира нищо (NFR-12).
 * Прикачените файлове (`attachmentIds`) се привързват към човешкото съобщение в същата
 * транзакция; PHOTO/LOG от ТОВА съобщение отиват към модела като допълващо доказателство (§9.2,
 * `services/model-inputs.ts` → `ai/attachments.ts`), само за този отговор, през Vertex в ЕС.
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

export function chatRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));

  // Разход и злоупотреба (§15.1): по потребител, не по IP — техниците са зад един NAT.
  const askLimiter = rateLimit({
    store: sharedStore('chat-ask'),
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

        const sendPrior = (found: PriorMessage) =>
          res.json({
            message: messageView(found.prior, found.files),
            answer: found.answer ? messageView(found.answer) : null,
          });

        const audiences = caseAudiences(p.user.role, c.portal);
        // FR-18/FR-19: предаден на оператор — техникът пише на човека, AI мълчи до „върни към AI“.
        const paused = aiPausedFor(c, p);
        const answerWith = (
          message: CaseMessage,
          question: string,
          files: MessageAttachment[],
          created: 200 | 201,
        ) => answerMessage(deps, { res, c, p, audiences, message, question, files, created });
        // Отказ на клиента прекъсва и изчакването на паралелен повтор.
        const gone = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) gone.abort();
        });
        /**
         * Паралелен повтор (NFR-12): друга заявка вече пита модела за СЪЩОТО съобщение → изчакай
         * нейния отговор; ако тя е паднала без отговор — питай сам (само когато повторът е позволен).
         */
        const replay = async (key: string, found: PriorMessage, mayRetry: boolean) => {
          if (found.answer) return sendPrior(found);
          const done =
            (await awaitPeerAnswer(deps.db, p.user.tenantId, c.id, key, gone.signal)) ?? found;
          if (done.answer || !mayRetry) return sendPrior(done);
          if (!(await claimAi(deps.db, c.id))) return apiError(res, 409, 'ai_in_progress');
          return answerWith(done.prior, done.prior.body, done.files, 200);
        };

        // AC-12: AI е паднал (503, скъсана връзка) → повторът пита модела за СЪЩОТО съобщение,
        // без второ човешко. Само авторът и само за последното му съобщение.
        const mayRetry = (found: PriorMessage) =>
          askAi &&
          !paused &&
          found.latest &&
          found.prior.kind === 'HUMAN' &&
          found.prior.authorId === p.user.id &&
          deps.diagnose !== null;

        if (clientMessageId) {
          const found = await findPrior(deps.db, p.user.tenantId, c.id, clientMessageId);
          if (found) {
            if (found.answer || !mayRetry(found)) return sendPrior(found);
            if (await claimAi(deps.db, c.id)) {
              return await answerWith(found.prior, found.prior.body, found.files, 200);
            }
            return await replay(clientMessageId, found, true);
          }
        }

        let message: CaseMessage;
        let flow: MessageFlow;
        try {
          ({ message, flow } = await deps.db.$transaction(async (tx) => {
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
            // Отговор на „поискай още данни“ → случаят се връща в работа (същата транзакция).
            return { message: created, flow: await onCaseMessageTx(tx, c, p.user.id, created.id) };
          }));
        } catch (err) {
          if (err instanceof InvalidAttachments) return apiError(res, 422, 'invalid_attachment');
          // Паралелен повтор със същия clientMessageId — първият печели, останалите го виждат.
          if (clientMessageId && isUniqueOn(err, 'clientMessageId')) {
            const found = await findPrior(deps.db, p.user.tenantId, c.id, clientMessageId);
            if (found) return await replay(clientMessageId, found, mayRetry(found));
          }
          throw err;
        }

        const files = attachmentIds.length
          ? ((await attachmentsByMessage(deps.db, p.user.tenantId, [message.id])).get(message.id) ??
            [])
          : [];
        if (flow.applied) c.status = flow.applied.c.status;
        await afterCaseMessage(deps, flow, c, p.user.id);
        if (!askAi || paused) {
          return res
            .status(201)
            .json({ message: messageView(message, files), answer: null, aiPaused: paused });
        }
        if (!deps.diagnose) return apiError(res, 503, 'ai_unavailable');
        if (!(await claimAi(deps.db, c.id))) return apiError(res, 409, 'ai_in_progress');
        await answerWith(message, text, files, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
