import 'server-only';
import { prisma } from '@/lib/db';
import { getRevolutDispute, getRevolutOrder, refundRevolutOrder } from '@/lib/revolut';
import { applyPlanLimits } from '@/lib/plan-limits';
import { emailReady, sendEmail } from '@/lib/email';
import { notifyAdmins } from '@/lib/admin-alert';
import { SITE_URL } from '@/lib/seo';
export { RefundUnreadableError } from './plan-order-core';
import { createPlanOrderService } from '@/lib/plan-order-core';

// Сървърната обвивка на ядрото за поръчките на планове (lib/plan-order-core.ts)
// с истинските зависимости. Логиката и коментарите към нея са в ядрото.

export type { DisputeRecord, RefundRequest, SettleResult } from '@/lib/plan-order-core';

const service = createPlanOrderService({
  db: prisma,
  revolut: { getOrder: getRevolutOrder, refund: refundRevolutOrder, getDispute: getRevolutDispute },
  email: { configured: emailReady, send: sendEmail },
  notifyAdmins,
  applyPlanLimits,
  siteUrl: SITE_URL,
  log: (...args) => console.error(...args),
});

export const {
  settlePlanOrder,
  sendPlanConfirmation,
  requestPlanRefund,
  settlePlanRefund,
  closeRefundManually,
  recordDispute,
  resendDisputeAlerts,
  alertStuckRefunds,
  releaseReferralBonuses,
} = service;
