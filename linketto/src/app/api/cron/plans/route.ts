import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { SITE_URL } from '@/lib/seo';
import { emailConfigured, sendEmail } from '@/lib/email';
import { applyPlanLimits } from '@/lib/plan-limits';
import { expiryAction } from '@/lib/plan-orders';
import { planReminderEmail } from '@/lib/plan-reminder';
import { sendPlanConfirmation, settlePlanOrder, settlePlanRefund } from '@/lib/plan-order-service';
import { revolutConfigured } from '@/lib/revolut';
import { notifyAdmins } from '@/lib/admin-alert';
import { sendWithdrawalAck } from '@/lib/withdrawal-service';
import type { PlanId } from '@/lib/plans';

// Cron за предплатените планове (spec §7.1 P7–P10, P14), POST с
// `Authorization: Bearer <CRON_SECRET>` на всеки час (DEPLOY.md §9). Стъпки,
// всяка самостоятелна: (1) висящите поръчки през API-то на Revolut — хваща
// изпуснат уебхук; (1б) висящите refund-и; (1в) неизпратени потвърждения;
// (2) сваляне на изтеклите PRO/BUSINESS на FREE + спиране на платените функции;
// (3) напомняния 7 дни и 1 ден преди изтичане.

const BATCH = 300;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function authorized(request: Request, secret: string): boolean {
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) {
    return NextResponse.json({ error: 'disabled' }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const now = new Date();
  const report = { reconciled: 0, refunds: 0, confirmed: 0, downgraded: 0, reminded: 0, errors: 0 };

  // (1) P9: висящи поръчки на възраст 15 мин. – 3 дни.
  if (revolutConfigured()) {
    const pending = await prisma.planOrder.findMany({
      where: {
        state: 'pending',
        revolutOrderId: { not: null },
        createdAt: { lt: new Date(now.getTime() - 15 * MINUTE), gt: new Date(now.getTime() - 3 * DAY) },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    for (const order of pending) {
      try {
        const result = await settlePlanOrder({ id: order.id });
        if (result !== 'pending' && result !== 'noop') report.reconciled += 1;
      } catch {
        report.errors += 1;
      }
    }
  }

  // (1б) Висящи refund-и (Revolut ги приключва до 2 дни).
  if (revolutConfigured()) {
    const refunds = await prisma.planOrder.findMany({
      where: { state: 'refund_pending', refundOrderId: { not: null } },
      orderBy: { updatedAt: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    for (const order of refunds) {
      try {
        const result = await settlePlanRefund({ id: order.id });
        if (result === 'refunded' || result === 'failed') report.refunds += 1;
      } catch {
        report.errors += 1;
      }
    }
  }

  // (1в) P14: неизпратени потвърждения (Brevo е бил недостъпен) — до 3 дни назад.
  if (emailConfigured()) {
    const unconfirmed = await prisma.planOrder.findMany({
      where: {
        state: 'completed',
        applied: true,
        confirmationSentAt: null,
        completedAt: { gt: new Date(now.getTime() - 3 * DAY) },
      },
      take: BATCH,
      select: { id: true },
    });
    for (const order of unconfirmed) {
      try {
        if (await sendPlanConfirmation(order.id)) report.confirmed += 1;
      } catch {
        report.errors += 1;
      }
    }
  }

  // (1г) Чл. 11а(4): неизпратени потвърждения за получен отказ — до 14 дни назад.
  if (emailConfigured()) {
    const acks = await prisma.planOrder.findMany({
      where: {
        withdrawalRequestedAt: { not: null, gt: new Date(now.getTime() - 14 * DAY) },
        withdrawalAckSentAt: null,
      },
      take: BATCH,
      select: { id: true },
    });
    for (const order of acks) {
      try {
        if (await sendWithdrawalAck(order.id)) report.confirmed += 1;
      } catch {
        report.errors += 1;
      }
    }
  }

  // (2) и (3): платени планове с изтичане до 7 дни напред (или вече изтекли),
  // само тези с реално действие — иначе вече напомнените запушват партидата.
  const users = await prisma.user.findMany({
    where: {
      plan: { in: ['PRO', 'BUSINESS'] },
      planExpiresAt: { not: null, lt: new Date(now.getTime() + 7 * DAY) },
      OR: [
        { planExpiresAt: { lte: now } },
        { planReminded: null },
        { planReminded: 7, planExpiresAt: { lte: new Date(now.getTime() + DAY) } },
      ],
    },
    orderBy: { planExpiresAt: 'asc' },
    take: BATCH,
    select: { id: true, email: true, name: true, locale: true, plan: true, planExpiresAt: true, planReminded: true },
  });
  for (const user of users) {
    const reminded = user.planReminded === 7 || user.planReminded === 1 ? user.planReminded : null;
    const action = expiryAction({ plan: user.plan as PlanId, expiresAt: user.planExpiresAt, reminded, now });
    try {
      if (action.downgrade) {
        // Условно: само ако планът и изтичането са същите (паралелно плащане печели).
        const { count } = await prisma.user.updateMany({
          where: { id: user.id, plan: user.plan, planExpiresAt: user.planExpiresAt },
          data: { plan: 'FREE', planExpiresAt: null, planReminded: null },
        });
        if (count === 1) {
          await applyPlanLimits(user.id); // R-limits: изтичането е окончателно
          report.downgraded += 1;
        }
      } else if (action.remind && user.planExpiresAt && emailConfigured()) {
        // Резервираме етапа ПРЕДИ изпращането — два паралелни cron-а не пращат
        // двойно; при неуспешно изпращане резервацията се връща.
        const reserved = await prisma.user.updateMany({
          where: { id: user.id, planExpiresAt: user.planExpiresAt, planReminded: reminded },
          data: { planReminded: action.remind },
        });
        if (reserved.count !== 1) continue;
        const { subject, html } = planReminderEmail({
          locale: user.locale,
          name: user.name,
          plan: user.plan,
          daysLeft: action.remind,
          expiresAt: user.planExpiresAt,
          renewUrl: `${SITE_URL}/${user.locale}/dashboard#plan`,
        });
        const sent = await sendEmail({ to: user.email, subject, html, tag: 'plan-reminder' });
        if (sent) {
          report.reminded += 1;
        } else {
          await prisma.user.updateMany({
            where: { id: user.id, planExpiresAt: user.planExpiresAt, planReminded: action.remind },
            data: { planReminded: reminded },
          });
        }
      }
    } catch {
      report.errors += 1;
    }
  }
  if (report.errors) {
    await notifyAdmins('Cron на плановете: грешки', [
      `Грешки: ${report.errors}`,
      `Уредени: ${report.reconciled}, refund-и: ${report.refunds}, потвърждения: ${report.confirmed}, свалени: ${report.downgraded}, напомняния: ${report.reminded}`,
      'Подробности — в журнала на сървъра ([plan-order]).',
    ]).catch(() => undefined);
  }
  return NextResponse.json(report, { status: report.errors ? 500 : 200 });
}
