'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { canWithdraw } from '@/lib/withdrawal';
import { sendWithdrawalAck } from '@/lib/withdrawal-service';
import { notifyAdmins } from '@/lib/admin-alert';
import { requestPlanRefund } from '@/lib/plan-order-service';

// Функцията за отказ (чл. 11а Дир. 2011/83, изм. с Дир. 2023/2673): втората
// стъпка „Потвърждавам отказа“. Изявлението се записва веднъж (условен запис),
// потвърждението на получаването отива на траен носител (имейл), а връщането
// тръгва автоматично — ако поръчката не е последната приложена, админът го
// поема ръчно (алармата казва защо).

const nameSchema = z.string().trim().min(1).max(120);

export async function withdrawPlanAction(formData: FormData): Promise<void> {
  const raw = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(raw) ? raw : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);

  const orderId = String(formData.get('orderId') ?? '');
  const name = nameSchema.safeParse(formData.get('name'));
  if (!name.success) redirect(`/${uiLocale}/dashboard/withdraw?order=${encodeURIComponent(orderId)}&error=name`);

  const order = await prisma.planOrder.findFirst({ where: { id: orderId, userId: user.id } });
  const now = new Date();
  if (
    !order ||
    !canWithdraw({
      state: order.state,
      applied: order.applied,
      completedAt: order.completedAt,
      withdrawalRequestedAt: order.withdrawalRequestedAt,
      now,
    })
  ) {
    redirect(`/${uiLocale}/dashboard?error=withdraw#plan`);
  }

  // Изявлението — веднъж (повторен клик/таб не записва второ).
  const { count } = await prisma.planOrder.updateMany({
    where: {
      id: order.id,
      userId: user.id,
      state: { in: ['completed', 'conflict'] },
      withdrawalRequestedAt: null,
    },
    data: { withdrawalRequestedAt: now, withdrawalName: name.data },
  });
  if (count !== 1) redirect(`/${uiLocale}/dashboard?withdrawn=1#plan`);

  // Потвърждението на траен носител; неизпратеното опитва пак cron-ът, а
  // алармата казва на админа, ако не е тръгнало.
  const ackSent = await sendWithdrawalAck(order.id).catch(() => false);

  let outcome: string;
  try {
    outcome = await requestPlanRefund(order.id);
  } catch (error) {
    outcome = `грешка: ${error instanceof Error ? error.message : 'unknown'}`;
  }
  await notifyAdmins(
    outcome === 'requested' || outcome === 'refunded'
      ? 'Отказ от договор — връщането е пуснато'
      : 'Отказ от договор — НУЖНО Е РЪЧНО ВРЪЩАНЕ',
    [
      `Поръчка: ${order.id} (${order.plan}, ${order.interval}, €${(order.amountCents / 100).toFixed(2)})`,
      `Изявление: ${now.toISOString()}`,
      `Връщане: ${outcome}${outcome === 'newer-first' ? ' — има по-нова приложена поръчка; върни по-новата или реши ръчно' : ''}`,
      `Потвърждение до потребителя: ${ackSent ? 'изпратено' : 'НЕ Е ИЗПРАТЕНО — cron-ът ще опита пак; провери Brevo'}`,
      'Срок за връщане: 14 дни от получаването на изявлението.',
    ],
  );
  redirect(`/${uiLocale}/dashboard?withdrawn=1#plan`);
}
