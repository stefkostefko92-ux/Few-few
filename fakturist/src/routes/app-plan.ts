import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { errorMessage, logger } from '../logger.js';
import { HOUR } from '../time.js';
import { BillingError, createOrder } from '../billing/orders.js';
import { CHECKOUT_TTL_MS, startCardCheckout } from '../billing/card.js';
import { RevolutError } from '../billing/revolut-client.js';
import { addressLine, paymentMethods, planPage, planSupplier } from '../billing/plan-view.js';
import { proformaPdf } from '../billing/proforma-pdf.js';
import { param } from './app-shared.js';

/**
 * „План“ на фирмата (SPEC 49): избор на план и период, плащане с карта (Revolut) или по банков път
 * (проформа с основание). Само собственикът (`billing.manage`) на пряка фирма. Сумата е от сървъра;
 * връщането от Revolut само показва „обработва се“ — права дава проверката (card.ts).
 */
const OrderSchema = z.object({
  // „план:период“ от една радио група — формата работи и без JavaScript.
  choice: z
    .string()
    .regex(/^[a-z0-9-]{1,40}:(MONTH|YEAR)$/)
    .transform((value) => {
      const [plan, interval] = value.split(':') as [string, 'MONTH' | 'YEAR'];
      return { plan, interval };
    }),
  method: z.enum(['card', 'transfer']),
});

/** Поръчките викат Revolut — до 10 на час за човек. */
const orderLimiter = rateLimit({
  windowMs: HOUR,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

async function owner(req: Request) {
  const access = await requireOrg(req, 'billing.manage');
  if (access.viaFirmId !== null) throw new HttpError(404);
  return access;
}

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z-]{2,40}$/.test(value) ? value : '';
}

async function orderOf(organizationId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, organizationId, planCode: { not: null } },
    include: { invoiceDocument: { select: { id: true, number: true } } },
  });
  if (!payment) throw new HttpError(404);
  return payment;
}

export function appPlanRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/plan', async (req, res) => {
    const access = await owner(req);
    res.render('app/plan', {
      ...(await planPage(access.organizationId)),
      err: code(req.query['err']),
    });
  });

  router.post('/app/o/:orgId/plan/poruchka', orderLimiter, async (req, res) => {
    const access = await owner(req);
    const base = `/app/o/${access.organizationId}/plan`;
    const parsed = OrderSchema.safeParse(req.body);
    if (!parsed.success) return res.redirect(303, `${base}?err=invalid`);
    if (!(await paymentMethods())[parsed.data.method]) {
      return res.redirect(303, `${base}?err=method`);
    }
    let paymentId: string;
    try {
      ({ paymentId } = await createOrder({
        organizationId: access.organizationId,
        actorId: req.principal!.user.id,
        planCode: parsed.data.choice.plan,
        interval: parsed.data.choice.interval,
        method: parsed.data.method,
      }));
    } catch (error) {
      if (error instanceof BillingError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
    const failed =
      parsed.data.method === 'card' ? await openCheckout(access.organizationId, paymentId) : null;
    res.redirect(303, `${base}/${paymentId}${failed ? `?err=${failed}` : ''}`);
  });

  /** Страницата при Revolut се създава след поръчката; при грешка — кодът за съобщението. */
  async function openCheckout(organizationId: string, paymentId: string): Promise<string | null> {
    try {
      await startCardCheckout({
        paymentId,
        organizationId,
        redirectUrl: `${config().PUBLIC_BASE_URL}/app/o/${organizationId}/plan/${paymentId}?vrashtane=1`,
      });
      return null;
    } catch (error) {
      if (error instanceof BillingError && error.code === 'expired') return 'expired';
      if (!(error instanceof RevolutError) && !(error instanceof BillingError)) throw error;
      logger.warn({ paymentId, err: errorMessage(error) }, 'страницата за плащане не се създаде');
      return 'revolut';
    }
  }

  router.get('/app/o/:orgId/plan/:paymentId', async (req, res) => {
    const access = await owner(req);
    const payment = await orderOf(access.organizationId, param(req, 'paymentId'));
    const [plan, supplier, entry] = await Promise.all([
      prisma.plan.findUnique({
        where: { code: payment.planCode ?? '' },
        select: { nameBg: true, nameEn: true },
      }),
      planSupplier(),
      payment.invoiceDocument
        ? prisma.inboxEntry.findFirst({
            where: {
              recipientOrgId: access.organizationId,
              documentId: payment.invoiceDocument.id,
            },
            select: { id: true },
          })
        : null,
    ]);
    const returning = req.query['vrashtane'] === '1';
    res.render('app/plan-order', {
      orgId: access.organizationId,
      payment,
      plan,
      supplier,
      inboxEntryId: entry?.id ?? null,
      returning,
      err: code(req.query['err']),
      // Страницата при Revolut е изтекла — само нова поръчка.
      expired:
        payment.provider === 'REVOLUT' &&
        payment.status === 'PENDING' &&
        Date.now() - payment.createdAt.getTime() > CHECKOUT_TTL_MS,
      // Връщане от Revolut, а webhook-ът още не е дошъл: страницата се презарежда на 5 секунди.
      refresh: returning && payment.status === 'PENDING' && payment.provider === 'REVOLUT',
    });
  });

  router.post('/app/o/:orgId/plan/:paymentId/karta', orderLimiter, async (req, res) => {
    const access = await owner(req);
    const payment = await orderOf(access.organizationId, param(req, 'paymentId'));
    if (payment.provider !== 'REVOLUT' || payment.status !== 'PENDING') throw new HttpError(409);
    const failed = await openCheckout(access.organizationId, payment.id);
    res.redirect(
      303,
      `/app/o/${access.organizationId}/plan/${payment.id}${failed ? `?err=${failed}` : ''}`,
    );
  });

  router.post('/app/o/:orgId/plan/:paymentId/otkazhi', async (req, res) => {
    const access = await owner(req);
    const payment = await orderOf(access.organizationId, param(req, 'paymentId'));
    await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (updated.count !== 1) throw new HttpError(409);
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: access.organizationId,
        action: 'billing.order.cancelled',
        targetType: 'Payment',
        targetId: payment.id,
      });
    });
    res.redirect(303, `/app/o/${access.organizationId}/plan`);
  });

  router.get('/app/o/:orgId/plan/:paymentId/proforma.pdf', async (req, res) => {
    const access = await owner(req);
    const payment = await orderOf(access.organizationId, param(req, 'paymentId'));
    if (payment.provider !== 'MANUAL' || !payment.reference) throw new HttpError(404);
    const [supplier, buyer, plan] = await Promise.all([
      planSupplier(),
      prisma.organization.findUniqueOrThrow({ where: { id: access.organizationId } }),
      prisma.plan.findUnique({ where: { code: payment.planCode ?? '' } }),
    ]);
    if (!supplier?.iban) throw new HttpError(404);
    const pdf = await proformaPdf({
      supplierOrgId: supplier.id,
      supplier: { ...supplier, iban: supplier.iban },
      buyer: {
        legalName: buyer.legalName,
        eik: buyer.eik,
        vatNumber: buyer.vatNumber,
        address: addressLine(buyer),
      },
      reference: payment.reference,
      createdAt: payment.createdAt,
      description: `Абонамент за Фактурист — план „${plan?.nameBg ?? payment.planCode}“, ${
        payment.interval === 'YEAR' ? '12 месеца' : '1 месец'
      }`,
      netCents: payment.netCents,
      creditCents: payment.creditCents,
      vatCents: payment.vatCents,
      vatRate: payment.vatRate,
      totalCents: payment.amountCents,
    });
    res
      .set('Cache-Control', 'private, no-store')
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="proforma-${payment.reference}.pdf"`)
      .send(pdf);
  });

  return router;
}
