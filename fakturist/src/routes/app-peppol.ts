import { Router } from 'express';
import { PEPPOL_BILLING_URN } from '../einvoice/ubl.js';
import { Prisma } from '@prisma/client';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { HOUR } from '../time.js';
import { accessPoint, peppolAllowed } from '../peppol/settings.js';
import { partyIdForVat, partyIdFromAddress } from '../peppol/ids.js';
import { disableOrganization, enrollOrganization, PeppolError } from '../peppol/participants.js';
import { queueTransmission } from '../peppol/transmissions.js';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { param } from './app-shared.js';
import { afterDate, PAGE_SIZE, pageOf, pagerLinks, readCursor } from '../http/pagination.js';

/**
 * „Peppol“ на фирмата (SPEC 57–58): адресът, регистрацията за получаване (OWNER/ADMIN — `org.settings`,
 * пряк член), последните изпращания; „Изпрати през Peppol“ за вече издаден документ в профил Peppol.
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,30}$/.test(value) ? value : '';
}

export function appPeppolRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/peppol', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const cursor = readCursor(req.query['predi']);
    const [org, participant, rows, configured, available] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: access.organizationId },
        select: { id: true, legalName: true, vatNumber: true, verifiedAt: true },
      }),
      prisma.peppolParticipant.findUnique({ where: { organizationId: access.organizationId } }),
      prisma.peppolTransmission.findMany({
        where: { organizationId: access.organizationId, ...afterDate('createdAt', cursor, 'desc') },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
        include: { document: { select: { id: true, number: true, buyerName: true } } },
      }),
      accessPoint().then((ap) => ap !== null),
      peppolAllowed(access.organizationId, { viaFirmId: access.viaFirmId }),
    ]);
    const page = pageOf(rows, PAGE_SIZE, (row) => row.createdAt);
    res.render('app/peppol', {
      org,
      participant,
      transmissions: page.items,
      pager: pagerLinks(req, `/app/o/${org.id}/peppol`, 'predi', [], page.next),
      configured,
      available,
      verified: org.verifiedAt !== null,
      partyId: participant?.partyId ?? partyIdForVat(org.vatNumber),
      canManage: roleCan(access.role, 'org.settings') && access.viaFirmId === null,
      ok: code(req.query['ok']),
      err: code(req.query['err']),
    });
  });

  router.post('/app/o/:orgId/peppol/vklyuchi', limiter, async (req, res) => {
    const access = await requireOrg(req, 'org.settings');
    if (access.viaFirmId !== null) throw new HttpError(404);
    const base = `/app/o/${access.organizationId}/peppol`;
    try {
      const status = await enrollOrganization(access, req.principal!.user.id, await accessPoint());
      res.redirect(303, `${base}?${status === 'ACTIVE' ? 'ok=enrolled' : 'err=provider'}`);
    } catch (error) {
      if (error instanceof PeppolError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
  });

  router.post('/app/o/:orgId/peppol/izklyuchi', limiter, async (req, res) => {
    const access = await requireOrg(req, 'org.settings');
    if (access.viaFirmId !== null) throw new HttpError(404);
    const base = `/app/o/${access.organizationId}/peppol`;
    try {
      await disableOrganization(access, req.principal!.user.id, await accessPoint());
      res.redirect(303, `${base}?ok=disabled`);
    } catch (error) {
      if (error instanceof PeppolError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
  });

  // Вече издаден документ в профил Peppol, без изпращане досега.
  router.post('/app/o/:orgId/d/:docId/peppol', limiter, async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const docId = param(req, 'docId');
    const back = `/app/o/${access.organizationId}/d/${docId}`;
    const document = await prisma.document.findFirst({
      where: { id: docId, organizationId: access.organizationId, status: 'ISSUED' },
      select: { id: true, input: true, ublXml: true, peppolTransmission: { select: { id: true } } },
    });
    if (!document) throw new HttpError(404);
    if (document.peppolTransmission) return res.redirect(303, `${back}?peppol=already`);
    if (!document.ublXml?.includes(PEPPOL_BILLING_URN)) {
      return res.redirect(303, `${back}?peppol=profile`);
    }
    const input = InvoiceInputSchema.safeParse(document.input);
    const receiver = input.success ? partyIdFromAddress(input.data.buyer.electronicAddress) : null;
    if (!receiver) return res.redirect(303, `${back}?peppol=receiver`);
    try {
      await prisma.$transaction((tx) =>
        queueTransmission(tx, {
          organizationId: access.organizationId,
          documentId: document.id,
          receiverPartyId: receiver,
          actorId: req.principal!.user.id,
        }),
      );
    } catch (error) {
      if (error instanceof PeppolError) {
        return res.redirect(
          303,
          `${back}?peppol=${error.code === 'notAvailable' ? 'notAvailable' : 'notActive'}`,
        );
      }
      // Едновременно „Изпрати“ за същия документ: уникалният documentId спира второто.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.redirect(303, `${back}?peppol=already`);
      }
      throw error;
    }
    res.redirect(303, `${back}?peppol=queued`);
  });

  return router;
}
