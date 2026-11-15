import 'server-only';
import { prisma } from '@/lib/db';
import { emailConfigured, sendEmail } from '@/lib/email';
import { withdrawalAckEmail } from '@/lib/withdrawal';

/**
 * Потвърждението на получаването на изявлението за отказ (чл. 11а(4) Дир.
 * 2011/83) — на траен носител, веднъж (условен запис на withdrawalAckSentAt).
 * Неизпратеното го опитва пак /api/cron/plans. Връща true, ако е изпратено сега.
 */
export async function sendWithdrawalAck(planOrderId: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  const order = await prisma.planOrder.findUnique({
    where: { id: planOrderId },
    include: { user: { select: { email: true, locale: true } } },
  });
  if (!order?.withdrawalRequestedAt || order.withdrawalAckSentAt) return false;
  const { subject, html } = withdrawalAckEmail({
    locale: order.user.locale,
    name: order.withdrawalName ?? '',
    plan: order.plan,
    interval: order.interval,
    amountCents: order.amountCents,
    orderRef: order.id,
    orderedAt: order.completedAt ?? order.createdAt,
    requestedAt: order.withdrawalRequestedAt,
  });
  const sent = await sendEmail({ to: order.user.email, subject, html, tag: 'withdrawal-ack' }).catch(() => false);
  if (!sent) return false;
  const { count } = await prisma.planOrder.updateMany({
    where: { id: order.id, withdrawalAckSentAt: null },
    data: { withdrawalAckSentAt: new Date() },
  });
  return count === 1;
}
