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
import { can } from '../auth/rbac.js';
import { DiagnosticContextSchema, redactContext } from '../domain/context.js';
import { attachmentsByMessage } from '../services/attachments.js';
import { notify } from '../services/collab/notify.js';
import { publishCaseAssigned } from '../services/collab/publish.js';
import {
  addTimeline,
  caseWhereFor,
  findCaseFor,
  humanNumber,
  isParticipant,
  withUniqueRetry,
} from '../services/cases.js';
import {
  assigneeViews,
  authorFor,
  caseView,
  contextWarnings,
  messageViews,
} from '../services/case-views.js';

/** Случаите (§12.4, §14.1): създаване, контекст, изход, поемане от оператор, хронология. */

const Id = z.string().min(1).max(40);
const CreateCase = z.object({
  context: DiagnosticContextSchema,
  deviceSerial: z.string().trim().min(1).max(80).optional(),
});
const Outcome = z.object({ outcome: z.enum(['RESOLVED', 'NOT_RESOLVED']) });

export function casesRouter(deps: WiredDeps): Router {
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
      const ticket = await deps.db.ticket.findUnique({ where: { caseId: c.id } });
      // Само CLEAN файлове, привързани към съобщение; самите байтове — през подписан адрес.
      const files = await attachmentsByMessage(
        deps.db,
        p.user.tenantId,
        messages.map((m) => m.id),
      );
      const views = await messageViews(deps.db, p, c, messages);
      const assignees = await assigneeViews(deps.db, p.user, [c]);
      res.json({
        case: {
          ...caseView(c),
          assignedTo: c.assignedToId ? (assignees.get(c.assignedToId) ?? null) : null,
        },
        ticket: ticket ? { number: ticket.number, status: ticket.status } : null,
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
      const body = z.object({ context: DiagnosticContextSchema }).safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const c = await findCaseFor(deps.db, p, id.data);
      if (!c) return apiError(res, 404, 'not_found');
      if (!isParticipant(p, c)) return apiError(res, 403, 'forbidden');
      if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');
      const product = await deps.db.product.findUnique({
        where: {
          tenantId_model: { tenantId: p.user.tenantId, model: body.data.context.productModel },
        },
      });
      if (!product) return apiError(res, 422, 'unknown_product');
      const updated = await deps.db.case.update({
        where: { id: c.id },
        data: { context: redactContext(body.data.context) as Prisma.InputJsonValue },
      });
      await addTimeline(deps.db, c.id, 'context.updated', p.user.id, {
        from: c.context,
        to: body.data.context,
      });
      const warnings = await contextWarnings(deps.db, c.id, product.id, body.data.context);
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
  router.post('/cases/:id/assign', requireCapability('case:assign'), async (req, res, next) => {
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
      // FR-18: създателят научава кой е поел случая (известие + събитие в реално време).
      const assignedTo = { id: p.user.id, name: p.user.name };
      if (c.createdById !== p.user.id) {
        await notify(
          deps,
          [
            {
              tenantId: c.tenantId,
              userId: c.createdById,
              eventType: 'case.assigned',
              objectType: 'case',
              objectId: c.id,
              payload: { caseId: c.id, number: c.number, assignedTo },
            },
          ],
          p.user.id,
        );
      }
      publishCaseAssigned(deps, { ...c, assignedToId: p.user.id }, assignedTo);
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
