import { Router } from 'express';
import { requireOrg } from '../auth/guards.js';
import {
  amountCents,
  DocumentPaymentError,
  PaymentFormSchema,
  recordPayment,
  removePayment,
} from '../documents/payments.js';
import { param } from './app-shared.js';

/**
 * Плащане по документ (SPEC 52): отбелязване (сума, дата, бележка) и махане на ръчно отбелязано —
 * който може да издава. Сумата се проверява срещу остатъка под заключване (payments.ts).
 */
export function appDocPaymentsRouter(): Router {
  const router = Router();

  router.post('/app/o/:orgId/d/:docId/plashtane', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const docId = param(req, 'docId');
    const back = `/app/o/${access.organizationId}/d/${docId}`;
    const parsed = PaymentFormSchema.safeParse(req.body);
    if (!parsed.success) return res.redirect(303, `${back}?plashtane=invalid#plashtane`);
    try {
      await recordPayment({
        organizationId: access.organizationId,
        documentId: docId,
        amountCents: amountCents(parsed.data.amount),
        paidOn: parsed.data.paidOn,
        source: 'MANUAL',
        note: parsed.data.note,
        actorId: req.principal!.user.id,
      });
    } catch (error) {
      if (error instanceof DocumentPaymentError) {
        return res.redirect(303, `${back}?plashtane=${error.code}#plashtane`);
      }
      throw error;
    }
    res.redirect(303, `${back}?plashtane=ok#plashtane`);
  });

  router.post('/app/o/:orgId/d/:docId/plashtane/:paymentId/mahni', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const docId = param(req, 'docId');
    const back = `/app/o/${access.organizationId}/d/${docId}`;
    try {
      await removePayment({
        organizationId: access.organizationId,
        documentId: docId,
        paymentId: param(req, 'paymentId'),
        actorId: req.principal!.user.id,
      });
    } catch (error) {
      if (error instanceof DocumentPaymentError) {
        return res.redirect(303, `${back}?plashtane=${error.code}#plashtane`);
      }
      throw error;
    }
    res.redirect(303, `${back}?plashtane=removed#plashtane`);
  });

  return router;
}
