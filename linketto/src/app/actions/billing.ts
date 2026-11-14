'use server';

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/locales';
import { SITE_URL } from '@/lib/seo';
import { BILLING_INTERVALS, type BillingIntervalId, type PlanId } from '@/lib/plans';
import { checkPurchase, isPaidPlan, planOrderAmountCents } from '@/lib/plan-orders';
import { vatForPlanSale } from '@/lib/vat';
import { createRevolutOrder, revolutConfigured } from '@/lib/revolut';

// Плащане на план през Revolut (docs/revolut-migration-spec.md §7): предплатен
// период (1/3/6/12 мес.) или FOUNDER завинаги — еднократна поръчка, без
// абонамент. Сумата е само от plans.ts (P1); ДДС се решава тук (P11, fail
// closed над прага); правото идва САМО след платена поръчка (уебхук/cron, P4).

// Описанието на поръчката се вижда на страницата на Revolut и в банковото
// извлечение — на езика на интерфейса (bg/en; останалите → en).
const PERIOD_LABEL: Record<string, Record<string, string>> = {
  bg: { monthly: '1 месец', quarterly: '3 месеца', semiannual: '6 месеца', annual: '12 месеца', lifetime: 'завинаги' },
  en: { monthly: '1 month', quarterly: '3 months', semiannual: '6 months', annual: '12 months', lifetime: 'forever' },
};
const PLAN_LABEL: Record<string, string> = { PRO: 'Pro', BUSINESS: 'Business', FOUNDER: 'Founder' };

async function crossBorderCents(from: Date, to: Date): Promise<number> {
  // Трансгранични B2C продажби = платени поръчки с държава извън България
  // (адрес за таксуване, иначе картата) — за прага от €10 000 (чл. 20б ЗДДС).
  // Неизвестна държава се брои за трансгранична (fail closed, P11).
  const sum = await prisma.planOrder.aggregate({
    _sum: { amountCents: true },
    where: {
      // Получените пари — вкл. неприложени и чакащи връщане (връщането може да
      // се провали); само реално върнатите не се броят.
      state: { in: ['completed', 'conflict', 'refund_pending'] },
      completedAt: { gte: from, lt: to },
      OR: [
        { buyerCountry: { not: null, notIn: ['BG'] } },
        { buyerCountry: null, cardCountry: { not: null, notIn: ['BG'] } },
        { buyerCountry: null, cardCountry: null },
      ],
    },
  });
  return sum._sum.amountCents ?? 0;
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);

  const want = String(formData.get('plan') ?? '');
  if (!isPaidPlan(want)) redirect(`/${uiLocale}/dashboard?error=generic`);
  const rawInterval = String(formData.get('interval') ?? 'monthly');
  const interval: BillingIntervalId = BILLING_INTERVALS.some((i) => i.id === rawInterval)
    ? (rawInterval as BillingIntervalId)
    : 'monthly';

  const now = new Date();
  const allowed = checkPurchase({
    plan: user.plan as PlanId,
    expiresAt: user.planExpiresAt,
    want,
    now,
  });
  if (allowed !== 'ok') redirect(`/${uiLocale}/dashboard?error=plan`);
  if (!revolutConfigured()) redirect(`/${uiLocale}/dashboard?error=payments`);

  const amountCents = planOrderAmountCents(want, interval);
  if (!amountCents) redirect(`/${uiLocale}/dashboard?error=generic`);

  const year = now.getUTCFullYear();
  const vat = vatForPlanSale({
    grossCents: amountCents,
    crossBorderCents: await crossBorderCents(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))),
    prevYearCrossBorderCents: await crossBorderCents(new Date(Date.UTC(year - 1, 0, 1)), new Date(Date.UTC(year, 0, 1))),
  });
  if (!vat.ok) {
    // P11: над прага без проверени ставки — не продаваме (видимо за админа).
    console.error('[billing] ДДС: прагът €10 000 е надхвърлен — нужна е таблица на ставките (TAX.md)');
    redirect(`/${uiLocale}/dashboard?error=payments`);
  }

  // P2: първо нашият запис, после поръчката при Revolut (референция = id).
  const order = await prisma.planOrder.create({
    data: {
      userId: user.id,
      plan: want,
      interval: want === 'FOUNDER' ? 'lifetime' : interval,
      amountCents,
      vatRateBp: vat.rateBp,
      vatCents: vat.vatCents,
      netCents: vat.netCents,
      vatCountry: vat.country,
    },
  });
  let checkoutUrl: string;
  try {
    const created = await createRevolutOrder({
      amountCents,
      description: `Linketto ${PLAN_LABEL[want]} · ${(PERIOD_LABEL[uiLocale] ?? PERIOD_LABEL.en)[want === 'FOUNDER' ? 'lifetime' : interval]}`,
      email: user.email,
      reference: order.id,
      redirectUrl: `${SITE_URL}/${uiLocale}/dashboard?upgraded=1`,
    });
    await prisma.planOrder.update({
      where: { id: order.id },
      data: { revolutOrderId: created.id },
    });
    checkoutUrl = created.checkoutUrl;
  } catch (error) {
    console.error('[billing] revolut order failed:', error instanceof Error ? error.message : 'unknown error');
    await prisma.planOrder.updateMany({ where: { id: order.id, state: 'pending' }, data: { state: 'failed' } });
    redirect(`/${uiLocale}/dashboard?error=payments`);
  }
  redirect(checkoutUrl);
}
