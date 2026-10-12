import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import type { Principal } from '../auth/sessions.js';
import { caseView } from '../services/case-views.js';
import type { Result } from '../services/collab/result.js';
import {
  assignTicket,
  claimTicket,
  escalateTicket,
  requestInfo,
  returnToAi,
} from '../services/tickets/actions.js';
import { closeTicket, reopenTicket } from '../services/tickets/lifecycle.js';
import { loadTicketFor, type Applied } from '../services/tickets/tx.js';
import { ticketCore, ticketDetail } from '../services/tickets/views.js';
import { sendFailure } from './collab-common.js';

/**
 * Работният поток на тикета (FR-09, FR-19): изглед и действия на оператора. Всеки вход — Zod;
 * достъпът — тикетът се вижда, ако се вижда случаят му (чужд клиент/случай = 404); действията —
 * `case:assign`; повторното отваряне — и създателят на случая.
 */

const Id = z.string().min(1).max(40);
const Reason = z.string().trim().min(3).max(1000);
const AssignInput = z.object({ userId: Id, reason: Reason.optional() });
const InfoInput = z.object({
  items: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  note: z.string().trim().max(1000).optional(),
});
const EscalateInput = z.object({ reason: Reason });
const ReturnInput = z.object({ note: z.string().trim().max(500).optional() });
const CloseInput = z.object({
  rootCause: z.string().trim().min(3).max(2000),
  solution: z.string().trim().min(3).max(2000),
  sourceDocumentIds: z.array(Id).max(20).default([]),
});
const ReopenInput = z.object({ reason: Reason });

type Action = (
  p: Principal,
  ticketId: string,
  body: unknown,
) => Promise<Result<Applied | null>> | null;

export function ticketFlowRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));

  router.get('/tickets/:id', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const loaded = await loadTicketFor(deps.db, p, id.data);
      if (!loaded) return apiError(res, 404, 'not_found');
      res.json({ ticket: await ticketDetail(deps.db, p, loaded.ticket, loaded.c) });
    } catch (err) {
      next(err);
    }
  });

  /** Общото на действията: id + тяло (Zod в `run`) → резултат → изгледът на тикета и случая. */
  const handle =
    (run: Action) => async (req: Request, res: Response, next: (e: unknown) => void) => {
      try {
        const id = Id.safeParse(req.params.id);
        if (!id.success) return apiError(res, 400, 'invalid_input');
        const p = principalOf(req);
        const pending = run(p, id.data, req.body);
        if (!pending) return apiError(res, 400, 'invalid_input');
        const result = await pending;
        if (sendFailure(res, result)) return;
        if (result.value) {
          return res.json({
            ticket: ticketCore(result.value.ticket),
            case: caseView(result.value.c),
          });
        }
        // Без промяна (повтор): текущото състояние.
        const loaded = await loadTicketFor(deps.db, p, id.data);
        if (!loaded) return apiError(res, 404, 'not_found');
        res.json({ ticket: ticketCore(loaded.ticket), case: caseView(loaded.c) });
      } catch (err) {
        next(err);
      }
    };

  const parse = <T>(schema: z.ZodType<T>, body: unknown): T | null => {
    const parsed = schema.safeParse(body ?? {});
    return parsed.success ? parsed.data : null;
  };
  const assign = requireCapability('case:assign');

  router.post(
    '/tickets/:id/claim',
    assign,
    handle((p, id) => claimTicket(deps, p, id)),
  );
  router.post(
    '/tickets/:id/assign',
    assign,
    handle((p, id, body) => {
      const input = parse(AssignInput, body);
      return input ? assignTicket(deps, p, id, input) : null;
    }),
  );
  router.post(
    '/tickets/:id/request-info',
    assign,
    handle((p, id, body) => {
      const input = parse(InfoInput, body);
      return input ? requestInfo(deps, p, id, input) : null;
    }),
  );
  router.post(
    '/tickets/:id/escalate',
    assign,
    handle((p, id, body) => {
      const input = parse(EscalateInput, body);
      return input ? escalateTicket(deps, p, id, input) : null;
    }),
  );
  router.post(
    '/tickets/:id/return-to-ai',
    assign,
    handle((p, id, body) => {
      const input = parse(ReturnInput, body);
      return input ? returnToAi(deps, p, id, input) : null;
    }),
  );
  router.post(
    '/tickets/:id/close',
    assign,
    handle((p, id, body) => {
      const input = parse(CloseInput, body);
      return input ? closeTicket(deps, p, id, input) : null;
    }),
  );
  // Повторно отваряне: и създателят на случая (техникът) — правото се проверява в услугата.
  router.post(
    '/tickets/:id/reopen',
    handle((p, id, body) => {
      const input = parse(ReopenInput, body);
      return input ? reopenTicket(deps, p, id, input) : null;
    }),
  );

  return router;
}
