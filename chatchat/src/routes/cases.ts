import { Prisma } from '@prisma/client';
import { Router } from 'express';
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
import type { Principal } from '../auth/sessions.js';
import { DiagnosticContextSchema, redactContext } from '../domain/context.js';
import { attachmentsByMessage } from '../services/attachments.js';
import {
  addTimeline,
  caseWhereFor,
  findCaseFor,
  humanNumber,
  isParticipant,
  withUniqueRetry,
} from '../services/cases.js';
import { assigneeViews, caseView, contextWarnings, messageViews } from '../services/case-views.js';
import { boardContext, deviceVisible, type DeviceWithProduct } from '../services/devices.js';
import { afterTicketChange } from '../services/tickets/effects.js';
import { closeTicketByOutcomeTx } from '../services/tickets/lifecycle.js';
import { changeOf } from '../services/tickets/tx.js';
import { caseFlowView } from '../services/tickets/views.js';

/**
 * Случаите (§12.4, §14.1): създаване, контекст, изход. Поемането от оператор, предаването и
 * хронологията — в routes/case-flow.ts; тикетът и стъпките — в tickets/ticket-flow/case-steps.
 */

const Id = z.string().min(1).max(40);
const CreateCase = z.object({
  context: DiagnosticContextSchema,
  deviceSerial: z.string().trim().min(1).max(80).optional(),
});
const Outcome = z.object({ outcome: z.enum(['RESOLVED', 'NOT_RESOLVED']) });
/**
 * FR-02 + FR-07: контекстът се редактира; с `deviceSerial` (сериен номер/QR, поискан като липсваща
 * данна) случаят се ВЪРЗВА за таблото — същите правила за видимост като при създаване.
 */
const ContextPatch = z.object({
  context: DiagnosticContextSchema,
  deviceSerial: z.string().trim().min(1).max(80).optional(),
});

export function casesRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));

  /** Таблото по сериен номер — само в клиента и само видимо за човека (порталът: своята фирма). */
  const visibleBoard = async (p: Principal, serial: string): Promise<DeviceWithProduct | null> => {
    const device = await deps.db.device.findUnique({
      where: { tenantId_serial: { tenantId: p.user.tenantId, serial } },
      include: { revision: { include: { product: true } } },
    });
    return device && deviceVisible(p.user, device) ? device : null;
  };

  router.get('/cases', async (req, res, next) => {
    try {
      const p = principalOf(req);
      const cases = await deps.db.case.findMany({
        where: caseWhereFor(p),
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
      const assignees = await assigneeViews(deps.db, p.user, cases);
      res.json({
        cases: cases.map((c) => ({
          ...caseView(c),
          assignedTo: c.assignedToId ? (assignees.get(c.assignedToId) ?? null) : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // §14.1 POST /sessions — нова техническа сесия (случай) с контекст на таблото.
  router.post('/sessions', requireCapability('case:create'), async (req, res, next) => {
    try {
      const parsed = CreateCase.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      let context = redactContext(parsed.data.context);
      let deviceId: string | null = null;
      if (parsed.data.deviceSerial) {
        const device = await visibleBoard(p, parsed.data.deviceSerial);
        if (!device) return apiError(res, 404, 'device_not_found');
        // Таблото е по-достоверно от ръчно въведеното: модел, HW, FW и опциите (FR-01) идват от
        // регистъра.
        context = boardContext(context, device);
        deviceId = device.id;
      }
      const product = await deps.db.product.findUnique({
        where: { tenantId_model: { tenantId: p.user.tenantId, model: context.productModel } },
      });
      if (!product) return apiError(res, 422, 'unknown_product');
      const created = await withUniqueRetry(() =>
        deps.db.case.create({
          data: {
            tenantId: p.user.tenantId,
            number: humanNumber('CASE'),
            companyId: p.user.companyId,
            deviceId,
            portal: p.user.kind === 'PORTAL',
            context: context as Prisma.InputJsonValue,
            createdById: p.user.id,
          },
        }),
      );
      await addTimeline(deps.db, created.id, 'case.created', p.user.id, { context });
      const warnings = await contextWarnings(deps.db, created.id, product.id, context);
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'case.create',
        objectType: 'case',
        objectId: created.id,
      });
      res.status(201).json({ case: caseView(created), warnings });
    } catch (err) {
      next(err);
    }
  });

  router.get('/cases/:id', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      const messages = await deps.db.caseMessage.findMany({
        where: { caseId: c.id },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      // Само CLEAN файлове, привързани към съобщение; самите байтове — през подписан адрес.
      const files = await attachmentsByMessage(
        deps.db,
        p.user.tenantId,
        messages.map((m) => m.id),
      );
      const views = await messageViews(deps.db, p, c, messages);
      const assignees = await assigneeViews(deps.db, p.user, [c]);
      // Тикетът (отговорник, заявка за данни), изпълнените стъпки и разрешенията (§11.2).
      const flow = await caseFlowView(deps.db, p, c);
      res.json({
        case: {
          ...caseView(c),
          assignedTo: c.assignedToId ? (assignees.get(c.assignedToId) ?? null) : null,
        },
        ...flow,
        messages: views.map((m) => ({ ...m, attachments: files.get(m.id) ?? [] })),
      });
    } catch (err) {
      next(err);
    }
  });

  // FR-02: контекстът е постоянен и редактируем; всяка промяна влиза в хронологията.
  router.patch('/cases/:id/context', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = ContextPatch.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      if (!isParticipant(p, c)) return apiError(res, 403, 'forbidden');
      if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');
      let context = redactContext(body.data.context);
      let board: DeviceWithProduct | null = null;
      if (body.data.deviceSerial) {
        board = await visibleBoard(p, body.data.deviceSerial);
        // Портален случай — само табло на фирмата на случая: поелият оператор (персонал вижда
        // всички табла) не може да отвори към портала схемите на чуждо табло (AC-18).
        if (!board || (c.portal && board.companyId !== c.companyId)) {
          return apiError(res, 404, 'device_not_found');
        }
        context = boardContext(context, board);
      }
      const product = await deps.db.product.findUnique({
        where: { tenantId_model: { tenantId: p.user.tenantId, model: context.productModel } },
      });
      if (!product) return apiError(res, 422, 'unknown_product');
      const updated = await deps.db.case.update({
        where: { id: c.id },
        data: {
          context: context as Prisma.InputJsonValue,
          ...(board ? { deviceId: board.id } : {}),
        },
      });
      await addTimeline(deps.db, c.id, 'context.updated', p.user.id, {
        from: c.context,
        to: context,
      });
      if (board && board.id !== c.deviceId) {
        // Вързването за табло отключва уникалните му схеми — в одита само id-та.
        await appendAudit(deps.db, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'case.board',
          objectType: 'case',
          objectId: c.id,
          detail: { deviceId: board.id, previousDeviceId: c.deviceId },
        });
      }
      const warnings = await contextWarnings(deps.db, c.id, product.id, context);
      res.json({ case: caseView(updated), warnings });
    } catch (err) {
      next(err);
    }
  });

  // §10.3: случаят се затваря само когато техникът потвърди изхода.
  router.post('/cases/:id/outcome', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = Outcome.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      if (!isParticipant(p, c)) return apiError(res, 403, 'forbidden');
      if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');
      const resolved = body.data.outcome === 'RESOLVED';
      // „Решен“ при отворен тикет затваря и тикета — в същата транзакция (не остава в опашката).
      const { updated, closed } = await deps.db.$transaction(async (tx) => {
        const row = await tx.case.update({
          where: { id: c.id },
          data: resolved
            ? { status: 'RESOLVED', outcome: 'RESOLVED', closedAt: new Date(), aiPaused: false }
            : { outcome: 'NOT_RESOLVED' },
        });
        await addTimeline(tx, c.id, 'case.outcome', p.user.id, { outcome: body.data.outcome });
        await appendAudit(tx, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'case.outcome',
          objectType: 'case',
          objectId: c.id,
          detail: { outcome: body.data.outcome },
        });
        return {
          updated: row,
          closed: resolved ? await closeTicketByOutcomeTx(tx, row, p.user.id) : null,
        };
      });
      if (closed) await afterTicketChange(deps, changeOf(closed, p.user.id));
      res.json({ case: caseView(updated) });
    } catch (err) {
      next(err);
    }
  });

  // Поемане (assign), „Предай на оператор“ и хронологията — в routes/case-flow.ts.
  return router;
}
