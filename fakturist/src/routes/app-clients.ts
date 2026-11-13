import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { OrganizationDataSchema } from '../accounts/register.js';
import { decideMandate } from '../accounts/mandates.js';
import { inviteOwnerByFirm, TransferError } from '../accounts/transfer.js';
import { kickOutbox } from '../mail/outbox.js';
import { param } from './app-shared.js';

/**
 * Пълномощните (фирмата решава за кантори, които издават от нейно име) и фирмите-клиенти на кантората.
 * Собствеността на фирма-клиент е на собственика ѝ: кантората го кани (при добавяне или по-късно), а
 * сама работи по пълномощно, след като той го потвърди. Пазачът requireUser е в appRouter.
 */
export function appClientsRouter(): Router {
  const router = Router();

  // --- Фирма: пълномощни на кантори, които издават от нейно име --------------------------------------
  router.get('/app/o/:orgId/palnomoshtni', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    const [org, mandates] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: access.organizationId } }),
      prisma.clientMandate.findMany({
        where: { clientId: access.organizationId },
        include: { firm: { select: { legalName: true, eik: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    res.render('app/mandates', { org, mandates });
  });

  router.post('/app/o/:orgId/palnomoshtni/:mandateId/:decision', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    if (access.viaFirmId) throw new HttpError(404);
    const decision =
      req.params['decision'] === 'potvardi'
        ? 'approve'
        : req.params['decision'] === 'ottegli'
          ? 'revoke'
          : null;
    if (!decision) throw new HttpError(404);
    await decideMandate({
      mandateId: param(req, 'mandateId'),
      actorId: req.principal!.user.id,
      decision,
      clientOrgId: access.organizationId,
    });
    res.redirect(303, `/app/o/${access.organizationId}/palnomoshtni`);
  });

  // --- Кантора: фирми-клиенти по пълномощно ----------------------------------------------------------
  router.get('/app/o/:orgId/klienti/nov', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    const firm = await prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
    });
    if (firm.kind !== 'ACCOUNTING_FIRM') throw new HttpError(404);
    res.render('app/client-new', { firm, errors: {}, values: {} });
  });

  router.post('/app/o/:orgId/klienti/nov', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    const firm = await prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
    });
    if (firm.kind !== 'ACCOUNTING_FIRM') throw new HttpError(404);
    const parsed = OrganizationDataSchema.and(
      z.object({
        documentRef: z.string().trim().min(3).max(100),
        validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        // Имейлът на собственика — по избор; поканата тръгва в същата транзакция.
        ownerEmail: z.string().trim().max(254).optional(),
      }),
    ).safeParse(req.body);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        errors[String(issue.path[0] ?? 'form')] ??= issue.message;
      return res.status(400).render('app/client-new', { firm, errors, values: req.body });
    }
    const data = parsed.data;
    type Outcome = 'added' | 'invited' | 'hasOwner';
    let outcome: Outcome;
    try {
      outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
        const existing = await tx.organization.findUnique({ where: { eik: data.eik } });
        // Пълномощното винаги започва като PENDING: потвърждава го собственикът на фирмата (ако има профил)
        // или мастър акаунтът след проверка на писменото пълномощно — кантора не може сама да присвои ЕИК.
        const client =
          existing ??
          (await tx.organization.create({
            data: {
              kind: 'COMPANY',
              legalName: data.legalName,
              eik: data.eik,
              vatNumber: data.vatNumber ?? null,
              addressStreet: data.addressStreet,
              addressCity: data.addressCity,
              postalCode: data.postalCode,
              iban: data.iban || null,
              eAddressScheme: data.vatNumber ? '9926' : null,
              eAddressValue: data.vatNumber ?? null,
            },
          }));
        if (!existing) {
          await tx.documentSeries.create({
            data: {
              organizationId: client.id,
              name: 'Основна',
              rangeStart: 1n,
              rangeEnd: 9_999_999_999n,
              nextNumber: 1n,
              isDefault: true,
            },
          });
        }
        const mandate = await tx.clientMandate.upsert({
          where: { firmId_clientId: { firmId: firm.id, clientId: client.id } },
          create: {
            firmId: firm.id,
            clientId: client.id,
            status: 'PENDING',
            documentRef: data.documentRef,
            validFrom: new Date(`${data.validFrom}T00:00:00Z`),
            createdById: req.principal!.user.id,
          },
          update: {
            documentRef: data.documentRef,
            validFrom: new Date(`${data.validFrom}T00:00:00Z`),
          },
        });
        await audit(tx, {
          actorId: req.principal!.user.id,
          organizationId: client.id,
          action: 'mandate.requested',
          targetType: 'ClientMandate',
          targetId: mandate.id,
          details: { firmId: firm.id },
        });
        // Фирма със собственик: пълномощното чака неговото потвърждение, покана не се праща.
        const owned =
          (await tx.membership.count({ where: { organizationId: client.id, role: 'OWNER' } })) > 0;
        if (owned) return 'hasOwner';
        if (!data.ownerEmail) return 'added';
        await inviteOwnerByFirm(tx, {
          firmId: firm.id,
          clientId: client.id,
          email: data.ownerEmail,
          actorId: req.principal!.user.id,
        });
        return 'invited';
      });
    } catch (error) {
      if (!(error instanceof TransferError)) throw error;
      return res
        .status(400)
        .render('app/client-new', { firm, errors: { ownerEmail: error.code }, values: req.body });
    }
    if (outcome === 'invited') kickOutbox();
    res.redirect(303, `/app?klient=${outcome}`);
  });

  // --- Кантора: покана към собственика на фирма-клиент (по-късно или наново) -------------------------
  router.post('/app/o/:orgId/klienti/:mandateId/pokana', async (req, res) => {
    const access = await requireOrg(req, 'mandates.manage');
    if (access.viaFirmId) throw new HttpError(404);
    const mandate = await prisma.clientMandate.findFirst({
      where: { id: param(req, 'mandateId'), firmId: access.organizationId },
      select: { clientId: true },
    });
    if (!mandate) throw new HttpError(404);
    const body = req.body as Record<string, unknown>;
    let result = 'ok';
    try {
      await prisma.$transaction((tx) =>
        inviteOwnerByFirm(tx, {
          firmId: access.organizationId,
          clientId: mandate.clientId,
          email: typeof body['email'] === 'string' ? body['email'] : '',
          actorId: req.principal!.user.id,
        }),
      );
      kickOutbox();
    } catch (error) {
      if (!(error instanceof TransferError)) throw error;
      result = error.code;
    }
    res.redirect(303, `/app?pokana=${result}`);
  });

  return router;
}
