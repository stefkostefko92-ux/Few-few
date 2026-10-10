import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { can } from '../auth/rbac.js';
import { notify } from '../services/collab/notify.js';
import { publishCaseAssigned } from '../services/collab/publish.js';
import { addTimeline, findCaseFor } from '../services/cases.js';
import { assigneeFor, authorFor, caseView } from '../services/case-views.js';
import { afterTicketChange } from '../services/tickets/effects.js';
import { recordTicketEvent } from '../services/tickets/events.js';
import { caseStatusFor, isOpenTicket, nextTicketStatus } from '../services/tickets/flow.js';
import { handoffToOperator } from '../services/tickets/lifecycle.js';
import { changeOf, type Applied } from '../services/tickets/tx.js';
import { sendFailure } from './collab-common.js';

/**
 * Случаят в ръцете на хората (FR-19, AC-19): поемане от оператор (синхронно с тикета, ако има
 * отворен), изрично „Предай на оператор“ от техника и хронологията за читателя.
 */

const Id = z.string().min(1).max(40);
const HandoffInput = z.object({ message: z.string().trim().min(3).max(2000) });

export function caseFlowRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));

  // FR-19: оператор поема случая — AI → човек, със същата история и контекст.
  router.post('/cases/:id/assign', requireCapability('case:assign'), async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');
      // Отговорникът на отворения тикет и поелият случая са един човек: чужд тикет не се поема тук.
      const outcome = await deps.db.$transaction(async (tx) => {
        const t = await tx.ticket.findUnique({ where: { caseId: c.id } });
        const open = t && isOpenTicket(t.status) ? t : null;
        if (open?.ownerId && open.ownerId !== p.user.id) return { conflict: true as const };
        const to = open ? nextTicketStatus('claim', open.status, true) : null;
        const updated = await tx.case.update({
          where: { id: c.id },
          data: { assignedToId: p.user.id, status: to ? caseStatusFor(to) : 'IN_PROGRESS' },
        });
        await addTimeline(tx, c.id, 'case.assigned', p.user.id, { to: p.user.id });
        let applied: Applied | null = null;
        if (open && to && (open.ownerId !== p.user.id || open.status !== to)) {
          const ticket = await tx.ticket.update({
            where: { id: open.id },
            data: { ownerId: p.user.id, status: to },
          });
          await recordTicketEvent(tx, {
            tenantId: c.tenantId,
            ticket,
            type: 'ticket.claimed',
            actorId: p.user.id,
            from: open.status,
            to,
          });
          applied = { kind: 'ticket.claimed', ticket, c: updated, previousOwnerId: open.ownerId };
        }
        return { conflict: false as const, updated, applied };
      });
      if (outcome.conflict) return apiError(res, 409, 'ticket_owned');
      // FR-18: създателят научава кой е поел случая (известие + събитие в реално време).
      // Порталният създател получава РОЛЯТА на служителя, не името (правният одит, т. 12).
      const operator = { id: p.user.id, name: p.user.name, role: p.user.role, kind: p.user.kind };
      const creator = await deps.db.user.findFirst({
        where: { id: c.createdById, tenantId: c.tenantId },
        select: { id: true, kind: true },
      });
      if (creator && c.createdById !== p.user.id) {
        await notify(
          deps,
          [
            {
              tenantId: c.tenantId,
              userId: c.createdById,
              eventType: 'case.assigned',
              objectType: 'case',
              objectId: c.id,
              payload: {
                caseId: c.id,
                number: c.number,
                assignedTo: assigneeFor(creator, operator),
              },
            },
          ],
          p.user.id,
        );
      }
      publishCaseAssigned(deps, { ...c, assignedToId: p.user.id }, operator);
      if (outcome.applied) await afterTicketChange(deps, changeOf(outcome.applied, p.user.id));
      res.json({ case: caseView(outcome.updated) });
    } catch (err) {
      next(err);
    }
  });

  // FR-19 „Предай на оператор“: изрично предаване със съобщение; тикет, ако няма; AI спира.
  router.post('/cases/:id/handoff', requireCapability('ticket:create'), async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = HandoffInput.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      const result = await handoffToOperator(deps, p, c, body.data.message);
      if (sendFailure(res, result)) return;
      const { ticket, c: updated } = result.value;
      res.status(201).json({
        case: caseView(updated),
        ticket: {
          id: ticket.id,
          number: ticket.number,
          status: ticket.status,
          queue: ticket.queue,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/cases/:id/timeline', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      // Вътрешната дискусия на персонала (internal.*) не се вижда от портала и от техниците
      // без `case:readAll` — дори като идентификатори (AC-18).
      const staff = p.user.kind === 'INTERNAL' && can(p.user.role, 'case:readAll');
      const events = await deps.db.caseTimelineEvent.findMany({
        where: {
          caseId: c.id,
          ...(staff ? {} : { NOT: { type: { startsWith: 'internal.' } } }),
        },
        orderBy: { at: 'asc' },
        take: 1000,
      });
      // Авторът на събитието по правилото на читателя: порталът вижда ролята, не името (AC-19).
      const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
      const actors = new Map(
        (
          await deps.db.user.findMany({
            where: { id: { in: actorIds }, tenantId: p.user.tenantId },
            select: { id: true, name: true, role: true, kind: true },
          })
        ).map((u) => [u.id, u]),
      );
      res.json({
        events: events.map((e) => ({
          type: e.type,
          actorId: e.actorId,
          actor: e.actorId ? authorFor(p.user, actors.get(e.actorId)) : null,
          // Източникът на събитието (AC-19): човек, AI или системата.
          source: e.type.startsWith('ai.') ? 'ai' : e.actorId ? 'human' : 'system',
          payload: e.payload,
          at: e.at,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
