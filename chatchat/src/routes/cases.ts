import { Prisma } from '@prisma/client';
import { Router } from 'express';
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
import { can } from '../auth/rbac.js';
import { DiagnosticContextSchema } from '../domain/context.js';
import {
  addTimeline,
  caseWhereFor,
  findCaseFor,
  humanNumber,
  withUniqueRetry,
} from '../services/cases.js';

/** Случаите (§12.4, §14.1): създаване, контекст, изход, поемане от оператор, хронология. */

const Id = z.string().min(1).max(40);
const CreateCase = z.object({
  context: DiagnosticContextSchema,
  deviceSerial: z.string().trim().min(1).max(80).optional(),
});
const Outcome = z.object({ outcome: z.enum(['RESOLVED', 'NOT_RESOLVED']) });

function caseView(c: {
  id: string;
  number: string;
  status: string;
  outcome: string | null;
  context: Prisma.JsonValue;
  portal: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    outcome: c.outcome,
    context: c.context,
    portal: c.portal,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function casesRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));

  router.get('/cases', async (req, res, next) => {
    try {
      const p = principalOf(req);
      const cases = await deps.db.case.findMany({
        where: caseWhereFor(p),
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
      res.json({ cases: cases.map(caseView) });
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
      let context = parsed.data.context;
      let deviceId: string | null = null;
      if (parsed.data.deviceSerial) {
        const device = await deps.db.device.findUnique({
          where: {
            tenantId_serial: { tenantId: p.user.tenantId, serial: parsed.data.deviceSerial },
          },
          include: { revision: { include: { product: true } } },
        });
        const visible =
          device !== null &&
          (can(p.user.role, 'device:readAll') ||
            (p.user.companyId !== null && device.companyId === p.user.companyId));
        if (!device || !visible) return apiError(res, 404, 'device_not_found');
        // Таблото е по-достоверно от ръчно въведеното: модел, HW и FW идват от регистъра.
        context = {
          ...context,
          productModel: device.revision.product.model,
          hardwareRevision: device.revision.hwRevision,
          firmware: device.firmware,
          serial: device.serial,
        };
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
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'case.create',
        objectType: 'case',
        objectId: created.id,
      });
      res.status(201).json({ case: caseView(created) });
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
      const authorIds = [...new Set(messages.map((m) => m.authorId).filter(Boolean))] as string[];
      const authors = new Map(
        (
          await deps.db.user.findMany({
            where: { id: { in: authorIds }, tenantId: p.user.tenantId },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name]),
      );
      const ticket = await deps.db.ticket.findUnique({ where: { caseId: c.id } });
      res.json({
        case: caseView(c),
        ticket: ticket ? { number: ticket.number, status: ticket.status } : null,
        messages: messages.map((m) => ({
          id: m.id,
          kind: m.kind,
          authorName: m.authorId ? (authors.get(m.authorId) ?? null) : null,
          body: m.body,
          payload: m.payload,
          createdAt: m.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // FR-02: контекстът е постоянен и редактируем; всяка промяна влиза в хронологията.
  router.patch('/cases/:id/context', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = z.object({ context: DiagnosticContextSchema }).safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');
      const product = await deps.db.product.findUnique({
        where: {
          tenantId_model: { tenantId: p.user.tenantId, model: body.data.context.productModel },
        },
      });
      if (!product) return apiError(res, 422, 'unknown_product');
      const updated = await deps.db.case.update({
        where: { id: c.id },
        data: { context: body.data.context as Prisma.InputJsonValue },
      });
      await addTimeline(deps.db, c.id, 'context.updated', p.user.id, {
        from: c.context,
        to: body.data.context,
      });
      res.json({ case: caseView(updated) });
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
      const resolved = body.data.outcome === 'RESOLVED';
      const updated = await deps.db.case.update({
        where: { id: c.id },
        data: resolved
          ? { status: 'RESOLVED', outcome: 'RESOLVED', closedAt: new Date() }
          : { outcome: 'NOT_RESOLVED' },
      });
      await addTimeline(deps.db, c.id, 'case.outcome', p.user.id, {
        outcome: body.data.outcome,
      });
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'case.outcome',
        objectType: 'case',
        objectId: c.id,
        detail: { outcome: body.data.outcome },
      });
      res.json({ case: caseView(updated) });
    } catch (err) {
      next(err);
    }
  });

  // FR-19: оператор поема случая — AI → човек, със същата история и контекст.
  router.post('/cases/:id/assign', requireCapability('case:readAll'), async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');
      const updated = await deps.db.case.update({
        where: { id: c.id },
        data: { assignedToId: p.user.id, status: 'IN_PROGRESS' },
      });
      await addTimeline(deps.db, c.id, 'case.assigned', p.user.id, { to: p.user.id });
      res.json({ case: caseView(updated) });
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
      const events = await deps.db.caseTimelineEvent.findMany({
        where: { caseId: c.id },
        orderBy: { at: 'asc' },
        take: 1000,
      });
      res.json({
        events: events.map((e) => ({
          type: e.type,
          actorId: e.actorId,
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
