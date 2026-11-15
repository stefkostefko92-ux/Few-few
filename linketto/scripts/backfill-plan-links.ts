// Попълване на заварените връзки план ↔ плащане след миграция
// 20261102120000_plan_payment_links. Без тях заварен FOUNDER/реферал не се
// разпознава при refund/спор (абонаментите се осиновяват и от webhook-а).
//
// Употреба (в linketto/, на сървъра, с env STRIPE_SECRET_KEY + DATABASE_URL):
//   npx tsx scripts/backfill-plan-links.ts            # само отчет (dry-run, по подразбиране)
//   npx tsx scripts/backfill-plan-links.ts --apply    # запис
//
// Идемпотентно: пише само в празни полета (CAS `where: { поле: null }`),
// повторното пускане не променя нищо. Не сменя планове и не пипа пари.
// Ключове само от env; препоръчително restricted key само за четене
// (Checkout Sessions, Subscriptions, Invoices).
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import {
  buildPlanPriceMap,
  classifyCheckout,
  firstPaidPaymentIntent,
  planForPriceIds,
  subscriptionGrantsPlan,
} from '../src/lib/billing-sync';
import {
  firstPaymentIntentOfSession,
  listCustomerSubscriptions,
  STRIPE_API_VERSION,
} from '../src/lib/stripe-state';

const APPLY = process.argv.includes('--apply');

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/** Завършени планови checkout сесии на потребителя, най-старата първа. */
async function planSessions(
  stripe: Stripe,
  customerId: string,
  userId: string,
): Promise<Stripe.Checkout.Session[]> {
  const sessions: Stripe.Checkout.Session[] = [];
  for await (const session of stripe.checkout.sessions.list({ customer: customerId, limit: 100 })) {
    const kind = classifyCheckout(session.metadata);
    if (
      kind.kind === 'plan' &&
      kind.userId === userId &&
      session.status === 'complete' &&
      session.payment_status !== 'unpaid'
    ) {
      sessions.push(session);
    }
  }
  return sessions.sort((a, b) => a.created - b.created);
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY липсва в env');
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  const prisma = new PrismaClient();
  const priceMap = buildPlanPriceMap(process.env);
  const live = key.includes('_live_');
  console.log(`backfill-plan-links: ${APPLY ? 'ЗАПИС' : 'dry-run'} · ${live ? 'LIVE' : 'test'} ключ`);
  const report = { founder: 0, subscription: 0, referral: 0, skipped: 0, conflicts: 0, manual: 0 };
  // Всеки ред „РЪЧНО:“ трябва да е разчистен, преди да се включи новият webhook (DEPLOY.md §1).
  const manual = (line: string): void => {
    report.manual += 1;
    console.warn(`  РЪЧНО: ${line}`);
  };

  async function write(label: string, fn: () => Promise<{ count: number }>): Promise<void> {
    if (!APPLY) return;
    try {
      const result = await fn();
      if (result.count === 0) report.skipped += 1; // вече попълнено междувременно
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      report.conflicts += 1;
      manual(`${label}: ключът вече е вързан към друг запис`);
    }
  }

  try {
    // 1) FOUNDER → PaymentIntent на платената FOUNDER сесия.
    const founders = await prisma.user.findMany({
      where: { plan: 'FOUNDER', planPaymentIntentId: null, stripeCustomerId: { not: null } },
      select: { id: true, stripeCustomerId: true },
    });
    for (const user of founders) {
      const sessions = await planSessions(stripe, user.stripeCustomerId as string, user.id);
      const pi = await firstPaidPaymentIntent(
        sessions.filter((s) => s.metadata?.plan === 'FOUNDER' && s.mode === 'payment'),
        (s) => firstPaymentIntentOfSession(stripe, s),
      );
      if (!pi) {
        report.skipped += 1;
        manual(`FOUNDER ${user.id}: няма платена FOUNDER сесия с PaymentIntent`);
        continue;
      }
      report.founder += 1;
      console.log(`  + FOUNDER ${user.id} → ${pi}`);
      await write(`FOUNDER ${user.id}`, () =>
        prisma.user.updateMany({
          where: { id: user.id, planPaymentIntentId: null },
          data: { planPaymentIntentId: pi },
        }),
      );
    }

    // 2) PRO/BUSINESS → единственият жив абонамент с планова цена.
    const subscribers = await prisma.user.findMany({
      where: {
        plan: { in: ['PRO', 'BUSINESS'] },
        planSubscriptionId: null,
        stripeCustomerId: { not: null },
      },
      select: { id: true, plan: true, stripeCustomerId: true },
    });
    for (const user of subscribers) {
      const subs = await listCustomerSubscriptions(stripe, user.stripeCustomerId as string);
      const alive = subs.filter(
        (s) => subscriptionGrantsPlan(s.status) && planForPriceIds(s.priceIds, priceMap) !== null,
      );
      if (alive.length !== 1) {
        report.skipped += 1;
        manual(`${user.plan} ${user.id}: ${alive.length} живи планови абонамента (очаква се 1)`);
        continue;
      }
      const sub = alive[0];
      const pricePlan = planForPriceIds(sub.priceIds, priceMap);
      report.subscription += 1;
      console.log(`  + ${user.plan} ${user.id} → ${sub.id} (${sub.status}, цена → ${pricePlan})`);
      if (pricePlan !== user.plan) {
        manual(`${user.id}: планът в базата е ${user.plan}, а цената на ${sub.id} дава ${pricePlan}`);
      }
      await write(`${user.plan} ${user.id}`, () =>
        prisma.user.updateMany({
          where: { id: user.id, planSubscriptionId: null },
          data: { planSubscriptionId: sub.id },
        }),
      );
    }

    // 3) Реферал → първото плащане по първата планова сесия на поканения.
    const referrals = await prisma.referral.findMany({
      where: { stripePaymentIntentId: null },
      select: { id: true, referredUserId: true },
    });
    for (const referral of referrals) {
      const referred = await prisma.user.findUnique({
        where: { id: referral.referredUserId },
        select: { stripeCustomerId: true },
      });
      const sessions = referred?.stripeCustomerId
        ? await planSessions(stripe, referred.stripeCustomerId, referral.referredUserId)
        : [];
      // B1: първата ПЛАТЕНА сесия с ненулев PI (пробен период/неплатена се пропускат).
      const pi = await firstPaidPaymentIntent(sessions, (s) => firstPaymentIntentOfSession(stripe, s));
      if (!pi) {
        report.skipped += 1;
        manual(`реферал ${referral.id}: няма платено планово плащане на поканения`);
        continue;
      }
      report.referral += 1;
      console.log(`  + реферал ${referral.id} → ${pi}`);
      await write(`реферал ${referral.id}`, () =>
        prisma.referral.updateMany({
          where: { id: referral.id, stripePaymentIntentId: null },
          data: { stripePaymentIntentId: pi },
        }),
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `готово: FOUNDER ${report.founder} · абонаменти ${report.subscription} · реферали ${report.referral} · пропуснати ${report.skipped} · конфликти ${report.conflicts} · РЪЧНО ${report.manual}${APPLY ? '' : ' (dry-run, нищо не е записано)'}`,
  );
  if (report.manual > 0) process.exitCode = 2; // има редове за разчистване
}

main().catch((error: unknown) => {
  console.error('backfill-plan-links се провали:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
