import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { redactPii } from '../domain/pii.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import {
  addTimeline,
  buildTicketSummary,
  findCaseFor,
  humanNumber,
  isUniqueOn,
  withUniqueRetry,
} from '../services/cases.js';
import { caseAudiences } from '../auth/rbac.js';
import { notifyTicketChange } from '../services/collab/notify.js';

/** Ескалация с тикет (FR-09, AC-08) и обратна връзка върху AI отговор (FR-10). */

const Id = z.string().min(1).max(40);
const TicketInput = z.object({ caseId: Id, reason: z.string().trim().min(3).max(1000) });
const FeedbackInput = z.object({
  messageId: Id,
  rating: z.enum(['USEFUL', 'NOT_USEFUL', 'TECHNICAL_ERROR']),
  comment: z.string().trim().max(1000).optional(),
});

export function ticketsRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));

  router.post('/tickets', requireCapability('ticket:create'), async (req, res, next) => {
    try {
      const parsed = TicketInput.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, parsed.data.caseId);
      if (!c) return apiError(res, 404, 'not_found');
      if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');
      const existing = await deps.db.ticket.findUnique({ where: { caseId: c.id } });
      if (existing) return apiError(res, 409, 'ticket_exists');
      const summary = await buildTicketSummary(deps.db, c, caseAudiences(p.user.role, c.portal));
      // Тикет + ескалиран случай + хронология + одит — всичко или нищо. Повторът при съвпаднал
      // номер е около цялата транзакция (грешка в Postgres прекратява текущата).
      let ticket;
      try {
        ticket = await withUniqueRetry(() =>
          deps.db.$transaction(async (tx) => {
            const created = await tx.ticket.create({
              data: {
                caseId: c.id,
                number: humanNumber('TS'),
                reason: redactPii(parsed.data.reason),
                summary: summary as unknown as Prisma.InputJsonValue,
                createdById: p.user.id,
              },
            });
            await tx.case.update({
              where: { id: c.id },
              data: { status: 'WAITING_TECHNICIAN', outcome: 'ESCALATED' },
            });
            await addTimeline(tx, c.id, 'ticket.created', p.user.id, { number: created.number });
            await appendAudit(tx, {
              tenantId: p.user.tenantId,
              actorId: p.user.id,
              action: 'ticket.create',
              objectType: 'ticket',
              objectId: created.id,
              detail: { caseId: c.id },
            });
            return created;
          }),
        );
      } catch (err) {
        // Паралелна заявка за същия случай вече създаде тикета.
        if (isUniqueOn(err, 'caseId')) return apiError(res, 409, 'ticket_exists');
        throw err;
      }
      await notifyTicketChange(deps, c, ticket, p.user.id);
      res.status(201).json({
        ticket: { number: ticket.number, status: ticket.status, summary },
      });
    } catch (err) {
      next(err);
    }
  });

  // FR-10: „Utile / Non utile / Errore tecnico“ — само върху AI отговор в достъпен случай.
  router.post('/feedback', requireCapability('feedback:create'), async (req, res, next) => {
    try {
      const parsed = FeedbackInput.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const message = await deps.db.caseMessage.findUnique({
        where: { id: parsed.data.messageId },
      });
      if (!message || message.kind !== 'AI') return apiError(res, 404, 'not_found');
      const c = await findCaseFor(deps.db, p, message.caseId);
      if (!c) return apiError(res, 404, 'not_found');
      await deps.db.feedback.upsert({
        where: { messageId_userId: { messageId: message.id, userId: p.user.id } },
        create: {
          messageId: message.id,
          userId: p.user.id,
          rating: parsed.data.rating,
          comment: parsed.data.comment ? redactPii(parsed.data.comment) : null,
        },
        update: {
          rating: parsed.data.rating,
          comment: parsed.data.comment ? redactPii(parsed.data.comment) : null,
        },
      });
      await addTimeline(deps.db, c.id, 'feedback', p.user.id, {
        messageId: message.id,
        rating: parsed.data.rating,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
