import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { kickOutbox } from '../mail/outbox.js';
import { activatePayment, BillingError } from '../billing/orders.js';
import { settleRevolutOrder } from '../billing/card.js';
import { RevolutError } from '../billing/revolut-client.js';
import { HttpError } from '../auth/guards.js';
import { sealHmac } from '../auth/keys.js';
import {
  CHAIN_START,
  sha256,
  verifyChainFrom,
  type ChainProblem,
  type ChainState,
} from '../ledger/chain.js';
import { decideMandate } from '../accounts/mandates.js';
import { createTransferInvite, revokeTransferInvite, TransferError } from '../accounts/transfer.js';
import { smtpSettings } from '../admin/integrations.js';
import {
  confirmOwnerReview,
  isRevokeReason,
  OwnershipError,
  revokeOwnership,
} from '../accounts/ownership.js';

/** Поканата за прехвърляне: имейлът на собственика + отметката, че мастърът е проверил представителството. */
const TransferForm = z.object({
  email: z.string().max(254),
  representationChecked: z.literal('on'),
});

/**
 * Действията на мастър панела върху записи: проверка на веригата, потвърждения (плащане, фирма,
 * пълномощно) и прехвърляне на фирма, добавена от кантора, към собственика ѝ.
 */
/** Датата от извлечението: точно ГГГГ-ММ-ДД, съществуваща, не в бъдещето, до година назад. */
export function paidOn(raw: unknown, now = new Date()): Date | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const at = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== raw) return null;
  const today = now.toISOString().slice(0, 10);
  if (raw > today || now.getTime() - at.getTime() > 366 * 24 * 60 * 60 * 1000) return null;
  return at;
}

export function adminActionsRouter(): Router {
  const router = Router();

  // --- Проверка на веригата на документите на фирма --------------------------------------------------
  router.get('/admin/veriga/:orgId', async (req, res) => {
    const organizationId = String(req.params['orgId']);
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new HttpError(404);
    // На страници по 500 — голяма фирма не зарежда всичките си XML-и наведнъж.
    let state: ChainState = CHAIN_START;
    let problem: ChainProblem | null = null;
    let count = 0;
    for (;;) {
      const docs = await prisma.document.findMany({
        where: { organizationId, chainIndex: { gte: state.nextIndex } },
        orderBy: { chainIndex: 'asc' },
        take: 500,
        select: {
          organizationId: true,
          chainIndex: true,
          number: true,
          typeCode: true,
          issueDate: true,
          payableCents: true,
          vatCents: true,
          ublXml: true,
          ciiXml: true,
          prevHash: true,
          sha256: true,
          seal: true,
        },
      });
      if (docs.length === 0) break;
      const result = verifyChainFrom(
        docs.map((d) => ({
          organizationId: d.organizationId,
          chainIndex: d.chainIndex!,
          number: d.number ?? '',
          typeCode: d.typeCode,
          status: 'ISSUED' as const,
          issueDate: d.issueDate.toISOString().slice(0, 10),
          payableCents: d.payableCents,
          vatCents: d.vatCents,
          ublSha256: sha256(d.ublXml ?? ''),
          ciiSha256: sha256(d.ciiXml ?? ''),
          prevHash: d.prevHash ?? '',
          sha256: d.sha256 ?? '',
          seal: d.seal ?? '',
        })),
        sealHmac,
        state,
      );
      count += docs.length;
      if (result.problem) {
        problem = result.problem;
        break;
      }
      state = result.state;
      if (docs.length < 500) break;
    }
    res.render('admin/chain', { org, count, problem });
  });

  // --- Ръчно потвърждение на плащане (банков превод към Revolut Business) -----------------------------
  // Поръчка на план (SPEC 49–50): активиране + фактура от Карбон Стелт в една транзакция; датата на
  // плащането е от извлечението (BT-7). Плащане с карта не се потвърждава на ръка — само „Провери в
  // Revolut“ (поръчката се чете оттам). Плащане без план (отпреди поръчките) — само се отбелязва.
  router.post('/admin/plashtaniya/:id/potvardi', async (req, res) => {
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params['id']) } });
    if (!payment) throw new HttpError(404);
    const paidAt = paidOn((req.body as Record<string, unknown>)['paidOn']);
    if (!paidAt) throw new HttpError(400);
    if (payment.planCode) {
      if (payment.provider !== 'MANUAL') throw new HttpError(409);
      try {
        const result = await activatePayment({
          paymentId: payment.id,
          paidAt,
          confirmedById: req.principal!.user.id,
        });
        if (!result.activated) throw new HttpError(409);
      } catch (error) {
        if (error instanceof BillingError) throw new HttpError(409);
        throw error;
      }
      kickOutbox();
      return res.redirect(303, `/admin/r/payments/${payment.id}`);
    }
    await prisma.$transaction(async (tx) => {
      // Условен запис: две едновременни потвърждения (или потвърждение + webhook) не минават двете.
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'COMPLETED', paidAt, confirmedById: req.principal!.user.id },
      });
      if (updated.count !== 1) throw new HttpError(409);
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: payment.organizationId,
        action: 'billing.payment.confirmed',
        targetType: 'Payment',
        targetId: payment.id,
        details: { amountCents: payment.amountCents },
      });
    });
    res.redirect(303, `/admin/r/payments/${payment.id}`);
  });

  // Плащане с карта, за което webhook не е дошъл: поръчката се чете от Revolut и се сверява (card.ts).
  router.post('/admin/plashtaniya/:id/proveri', async (req, res) => {
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params['id']) } });
    if (!payment?.providerOrderId) throw new HttpError(404);
    let outcome: string;
    try {
      outcome = await settleRevolutOrder(payment.providerOrderId);
    } catch (error) {
      outcome = error instanceof RevolutError ? `revolut-${error.code}` : 'error';
    }
    res.redirect(303, `/admin/r/payments/${payment.id}?proverka=${encodeURIComponent(outcome)}`);
  });

  // --- Пълномощни и потвърждаване на фирми ----------------------------------------------------------
  router.post('/admin/palnomoshtni/:id/:decision', async (req, res) => {
    const decision =
      req.params['decision'] === 'potvardi'
        ? 'approve'
        : req.params['decision'] === 'ottegli'
          ? 'revoke'
          : null;
    if (!decision) throw new HttpError(404);
    const mandateId = String(req.params['id']);
    await decideMandate({
      mandateId,
      actorId: req.principal!.user.id,
      decision,
      clientOrgId: null,
    });
    res.redirect(303, `/admin/r/mandates/${mandateId}`);
  });

  router.post('/admin/firmi/:id/potvardi', async (req, res) => {
    const id = String(req.params['id']);
    try {
      await confirmOwnerReview({ organizationId: id, actorId: req.principal!.user.id });
    } catch (error) {
      if (!(error instanceof OwnershipError)) throw error;
      throw new HttpError(error.code === 'notFound' ? 404 : 409);
    }
    res.redirect(303, `/admin/r/organizations/${id}`);
  });

  // --- Прехвърляне на фирма без собственик (добавена от кантора) ---------------------------------
  router.post('/admin/firmi/:id/prehvarli', async (req, res) => {
    const id = String(req.params['id']);
    const parsed = TransferForm.safeParse(req.body);
    if (!parsed.success) {
      const missing = parsed.error.issues.some((i) => i.path[0] === 'representationChecked');
      return res.redirect(
        303,
        `/admin/r/organizations/${id}?greshka=${missing ? 'notChecked' : 'invalidEmail'}`,
      );
    }
    try {
      const invite = await createTransferInvite({
        organizationId: id,
        email: parsed.data.email,
        actorId: req.principal!.user.id,
      });
      const org = await prisma.organization.findUniqueOrThrow({
        where: { id },
        select: { id: true, legalName: true, eik: true },
      });
      // Връзката се показва веднъж: в базата е само хешът ѝ.
      res.set('Cache-Control', 'no-store');
      res.render('admin/transfer-sent', {
        org,
        email: parsed.data.email.trim().toLowerCase(),
        expiresAt: invite.expiresAt,
        link: `${config().PUBLIC_BASE_URL}/pokana/${invite.token}`,
        mailReady: (await smtpSettings()) !== null,
      });
    } catch (error) {
      if (!(error instanceof TransferError)) throw error;
      if (error.code === 'notFound') throw new HttpError(404);
      if (error.code === 'hasOwner') throw new HttpError(409);
      res.redirect(303, `/admin/r/organizations/${id}?greshka=${error.code}`);
    }
  });

  // --- Отнемане на собствеността (собственик, поканен от кантора, при спор) ------------------------
  router.post('/admin/firmi/:id/otnemi', async (req, res) => {
    const id = String(req.params['id']);
    const body = req.body as Record<string, unknown>;
    if (body['understood'] !== 'on') {
      return res.redirect(303, `/admin/r/organizations/${id}?greshka=notUnderstood`);
    }
    const reason = body['reason'];
    if (!isRevokeReason(reason)) {
      return res.redirect(303, `/admin/r/organizations/${id}?greshka=invalidReason`);
    }
    try {
      await revokeOwnership({ organizationId: id, actorId: req.principal!.user.id, reason });
    } catch (error) {
      if (!(error instanceof OwnershipError)) throw error;
      if (error.code === 'notFound') throw new HttpError(404);
      return res.redirect(303, `/admin/r/organizations/${id}?greshka=${error.code}`);
    }
    res.redirect(303, `/admin/r/organizations/${id}?otneta=1`);
  });

  router.post('/admin/pokani/:id/otmeni', async (req, res) => {
    const id = String(req.params['id']);
    try {
      await revokeTransferInvite({ inviteId: id, actorId: req.principal!.user.id });
    } catch (error) {
      if (!(error instanceof TransferError)) throw error;
      throw new HttpError(error.code === 'notFound' ? 404 : 409);
    }
    res.redirect(303, `/admin/r/transfers/${id}`);
  });

  return router;
}
