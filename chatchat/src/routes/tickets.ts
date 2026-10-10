import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { redactPii } from '../domain/pii.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { addTimeline, findCaseFor } from '../services/cases.js';
import { createTicket } from '../services/tickets/lifecycle.js';
import { sendFailure } from './collab-common.js';

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
      // Тикет + ескалиран случай + хронология + одит (`recordTicketEvent`) — всичко или нищо.
      const created = await createTicket(deps, p, c, parsed.data.reason);
      if (sendFailure(res, created)) return;
      const { ticket, summary } = created.value;
      res.status(201).json({
        ticket: {
          id: ticket.id,
          number: ticket.number,
          status: ticket.status,
          queue: ticket.queue,
          summary,
        },
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
