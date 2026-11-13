import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { money } from '../http/view.js';
import { DOWNLOAD_SELECT, param, sendDocumentFile } from './app-shared.js';

/** Записът в шкафчето САМО на тази фирма — чужд запис е 404, а получателят не вижда други документи на изпращача. */
async function inboxEntryFor(recipientOrgId: string, entryId: string) {
  const entry = await prisma.inboxEntry.findFirst({
    where: { id: entryId, recipientOrgId },
    include: {
      senderOrg: { select: { legalName: true, eik: true, vatNumber: true, verifiedAt: true } },
      decidedBy: { select: { name: true } },
      document: {
        select: {
          ...DOWNLOAD_SELECT,
          typeCode: true,
          issueDate: true,
          dueDate: true,
          currency: true,
          taxExclusiveCents: true,
          vatCents: true,
          payableCents: true,
          buyerName: true,
        },
      },
    },
  });
  if (!entry) throw new HttpError(404);
  return entry;
}

/** Шкафчето на фирмата: документи от други фирми във Фактурист. Пазачът requireUser е в appRouter. */
export function appInboxRouter(): Router {
  const router = Router();

  // --- Шкафче: документи от други фирми във Фактурист --------------------------------------------------
  router.get('/app/o/:orgId/shkafche', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const [org, entries] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: access.organizationId } }),
      prisma.inboxEntry.findMany({
        where: { recipientOrgId: access.organizationId },
        orderBy: { deliveredAt: 'desc' },
        take: 200,
        include: {
          senderOrg: { select: { legalName: true, eik: true, verifiedAt: true } },
          document: {
            select: {
              number: true,
              status: true,
              typeCode: true,
              issueDate: true,
              payableCents: true,
              currency: true,
            },
          },
        },
      }),
    ]);
    res.render('app/inbox', {
      org,
      entries,
      money: (cents: bigint, currency: string) => money(cents, currency, res.locals.lang),
    });
  });

  router.get('/app/o/:orgId/shkafche/:entryId', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const entry = await inboxEntryFor(access.organizationId, param(req, 'entryId'));
    if (!entry.readAt) {
      await prisma.inboxEntry.updateMany({
        where: { id: entry.id, readAt: null },
        data: { readAt: new Date() },
      });
    }
    res.render('app/inbox-entry', {
      entry,
      document: entry.document,
      canDecide: roleCan(access.role, 'documents.issue'),
      money: (cents: bigint) => money(cents, entry.document.currency, res.locals.lang),
    });
  });

  router.get('/app/o/:orgId/shkafche/:entryId/:format', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const entry = await inboxEntryFor(access.organizationId, param(req, 'entryId'));
    await sendDocumentFile(res, entry.document, String(req.params['format']));
  });

  router.post('/app/o/:orgId/shkafche/:entryId/:decision', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const entry = await inboxEntryFor(access.organizationId, param(req, 'entryId'));
    const decision = req.params['decision'];
    if (decision !== 'priemi' && decision !== 'otkazhi') throw new HttpError(404);
    const reason = z
      .string()
      .trim()
      .max(200)
      .safeParse((req.body as { reason?: unknown }).reason);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.inboxEntry.updateMany({
        where: { id: entry.id, recipientOrgId: access.organizationId, status: 'RECEIVED' },
        data: {
          status: decision === 'priemi' ? 'ACCEPTED' : 'REJECTED',
          decidedAt: new Date(),
          decidedById: req.principal!.user.id,
          rejectReason: decision === 'otkazhi' && reason.success ? reason.data || null : null,
        },
      });
      if (updated.count !== 1) throw new HttpError(409);
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: access.organizationId,
        action: decision === 'priemi' ? 'inbox.accepted' : 'inbox.rejected',
        targetType: 'InboxEntry',
        targetId: entry.id,
      });
    });
    res.redirect(303, `/app/o/${access.organizationId}/shkafche/${entry.id}`);
  });

  return router;
}
