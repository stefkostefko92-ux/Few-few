import { Router, type Request } from 'express';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { InvoiceInputSchema } from '../einvoice/index.js';
import {
  changeRecurring,
  createRecurring,
  findRecurring,
  isRecurringAction,
  RecurringError,
  RecurringFormSchema,
  templateLines,
  templateOf,
  updateRecurring,
} from '../recurring/recurring.js';
import { advance } from '../recurring/schedule.js';
import { sofiaToday } from '../time.js';
import { param } from './app-shared.js';

/**
 * „Повтарящи се“ (SPEC 51) и напомнянията (SPEC 52): списък, нова от издадена фактура („Повтаряй“),
 * редакция, пауза/продължи/край; включване на напомнянията (`org.settings`, пряк член). Създава и
 * управлява който може да издава; по пълномощно кантората вижда само своите шаблони.
 */
function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,30}$/.test(value) ? value : '';
}

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : '');

async function issuer(req: Request) {
  const access = await requireOrg(req, 'documents.issue');
  const feature = await orgHasFeature(access.organizationId, 'recurring', {
    viaFirmId: access.viaFirmId,
  });
  return { access, feature };
}

export function appRecurringRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/povtaryashti', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const [org, templates, recurring, reminders] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: access.organizationId },
        select: { id: true, legalName: true, remindersEnabled: true },
      }),
      prisma.recurringInvoice.findMany({
        where: {
          organizationId: access.organizationId,
          ...(access.viaFirmId ? { viaFirmId: access.viaFirmId } : {}),
        },
        orderBy: [{ status: 'asc' }, { nextRunOn: 'asc' }],
        include: { _count: { select: { documents: true } } },
      }),
      orgHasFeature(access.organizationId, 'recurring', { viaFirmId: access.viaFirmId }),
      orgHasFeature(access.organizationId, 'reminders'),
    ]);
    res.render('app/recurring', {
      org,
      templates,
      features: { recurring, reminders },
      canIssue: roleCan(access.role, 'documents.issue'),
      canSettings: roleCan(access.role, 'org.settings') && access.viaFirmId === null,
      ok: code(req.query['ok']),
      err: code(req.query['err']),
    });
  });

  router.post('/app/o/:orgId/napomnyaniya', async (req, res) => {
    const access = await requireOrg(req, 'org.settings');
    if (access.viaFirmId !== null) throw new HttpError(404);
    const enabled = (req.body as Record<string, unknown>)['enabled'] === 'on';
    const base = `/app/o/${access.organizationId}/povtaryashti`;
    if (enabled && !(await orgHasFeature(access.organizationId, 'reminders'))) {
      return res.redirect(303, `${base}?err=feature`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: access.organizationId },
        data: { remindersEnabled: enabled },
      });
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: access.organizationId,
        action: 'organization.reminders',
        targetType: 'Organization',
        targetId: access.organizationId,
        details: { enabled },
      });
    });
    res.redirect(303, `${base}?ok=${enabled ? 'remindersOn' : 'remindersOff'}`);
  });

  router.get('/app/o/:orgId/d/:docId/povtaryay', async (req, res) => {
    const { access, feature } = await issuer(req);
    const doc = await prisma.document.findFirst({
      where: {
        id: param(req, 'docId'),
        organizationId: access.organizationId,
        status: 'ISSUED',
        typeCode: '380',
      },
      select: { id: true, number: true, issueDate: true, dueDate: true, input: true },
    });
    if (!doc) throw new HttpError(404);
    const input = InvoiceInputSchema.safeParse(doc.input);
    const today = sofiaToday();
    const day = Number(today.slice(8, 10));
    res.render('app/recurring-form', {
      orgId: access.organizationId,
      doc,
      template: null,
      lines: templateLines(templateOf(doc.input)),
      feature,
      values: {
        name: input.success ? input.data.buyer.name : '',
        frequency: 'MONTHLY',
        nextRunOn: advance(today, 'MONTHLY', day),
        endOn: '',
        dueDays: doc.dueDate
          ? String(Math.round((doc.dueDate.getTime() - doc.issueDate.getTime()) / 86_400_000))
          : '',
        sendTo: input.success ? (input.data.buyer.contact?.email ?? '') : '',
      },
      err: code(req.query['err']),
    });
  });

  router.post('/app/o/:orgId/d/:docId/povtaryay', async (req, res) => {
    const { access } = await issuer(req);
    const docId = param(req, 'docId');
    const parsed = RecurringFormSchema.safeParse(req.body);
    const back = `/app/o/${access.organizationId}/d/${docId}/povtaryay`;
    if (!parsed.success) return res.redirect(303, `${back}?err=invalid`);
    try {
      await createRecurring(access, req.principal!.user.id, docId, parsed.data);
    } catch (error) {
      if (error instanceof RecurringError) return res.redirect(303, `${back}?err=${error.code}`);
      throw error;
    }
    res.redirect(303, `/app/o/${access.organizationId}/povtaryashti?ok=created`);
  });

  router.get('/app/o/:orgId/povtaryashti/:id', async (req, res) => {
    const { access, feature } = await issuer(req);
    let template;
    try {
      template = await findRecurring(access, param(req, 'id'));
    } catch {
      throw new HttpError(404);
    }
    const documents = await prisma.document.findMany({
      where: { recurringId: template.id, organizationId: access.organizationId },
      orderBy: { issueDate: 'desc' },
      take: 24,
      select: {
        id: true,
        number: true,
        issueDate: true,
        recurringPeriod: true,
        paymentState: true,
      },
    });
    res.render('app/recurring-form', {
      orgId: access.organizationId,
      doc: null,
      template,
      lines: templateLines(template.template),
      documents,
      feature,
      values: {
        name: template.name,
        frequency: template.frequency,
        nextRunOn: iso(template.nextRunOn),
        endOn: iso(template.endOn),
        dueDays: template.dueDays === null ? '' : String(template.dueDays),
        sendTo: template.sendTo ?? '',
      },
      err: code(req.query['err']),
    });
  });

  router.post('/app/o/:orgId/povtaryashti/:id', async (req, res) => {
    const { access } = await issuer(req);
    const id = param(req, 'id');
    const back = `/app/o/${access.organizationId}/povtaryashti/${id}`;
    const parsed = RecurringFormSchema.safeParse(req.body);
    if (!parsed.success) return res.redirect(303, `${back}?err=invalid`);
    try {
      await updateRecurring(access, req.principal!.user.id, id, parsed.data);
    } catch (error) {
      if (error instanceof RecurringError) {
        if (error.code === 'notFound') throw new HttpError(404);
        return res.redirect(303, `${back}?err=${error.code}`);
      }
      throw error;
    }
    res.redirect(303, `/app/o/${access.organizationId}/povtaryashti?ok=updated`);
  });

  router.post('/app/o/:orgId/povtaryashti/:id/:action', async (req, res) => {
    const { access } = await issuer(req);
    const action = req.params['action'];
    if (!isRecurringAction(action)) throw new HttpError(404);
    const id = param(req, 'id');
    try {
      await changeRecurring(access, req.principal!.user.id, id, action);
    } catch (error) {
      if (error instanceof RecurringError) {
        if (error.code === 'notFound') throw new HttpError(404);
        return res.redirect(303, `/app/o/${access.organizationId}/povtaryashti?err=${error.code}`);
      }
      throw error;
    }
    res.redirect(303, `/app/o/${access.organizationId}/povtaryashti?ok=${action}`);
  });

  return router;
}
