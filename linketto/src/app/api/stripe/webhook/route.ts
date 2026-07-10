import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { PLANS, totalFeeCents, type PlanId } from '@/lib/plans';
import { payoutSeller } from '@/lib/payout';
import { deliveryEmailHtml, deliverySubject, sendEmail } from '@/lib/email';
import { referralRewardCents } from '@/lib/referral';

// Начислява бонус на реферера, когато поканеният си купи платен план.
// Идемпотентно: Referral е уникален по referredUserId (един бонус на поканен).
async function rewardReferrer(
  referredUserId: string,
  planId: PlanId,
  paidCents: number,
): Promise<void> {
  // Бонусът е процент от реалната сума, платена от поканения (по-дълъг
  // период → по-голямо плащане → по-голям бонус за реферера).
  const rewardCents = referralRewardCents(paidCents);
  if (rewardCents <= 0) return;
  const user = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { referredById: true },
  });
  if (!user?.referredById) return;
  const existing = await prisma.referral.findUnique({
    where: { referredUserId },
    select: { id: true },
  });
  if (existing) return; // вече наградено
  await prisma.$transaction([
    prisma.referral.create({
      data: {
        referrerId: user.referredById,
        referredUserId,
        plan: planId,
        rewardCents,
      },
    }),
    prisma.user.update({
      where: { id: user.referredById },
      data: { referralCreditCents: { increment: rewardCents } },
    }),
  ]);
}

// Дава/подновява право на достъп на купувача (курс/членство). Идемпотентно
// по (productId, email). Членство → пази stripeSubscriptionId за отнемане.
async function grantEntitlement(
  productId: string,
  profileId: string,
  email: string,
  subscriptionId: string | null,
): Promise<void> {
  await prisma.entitlement
    .upsert({
      where: { productId_email: { productId, email } },
      create: {
        productId,
        profileId,
        email,
        active: true,
        stripeSubscriptionId: subscriptionId,
      },
      update: {
        active: true,
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      },
    })
    .catch(() => undefined);
}

// Отнема еднократните (COURSE) права по покупките на даден PaymentIntent —
// при refund/chargeback купувачът връща парите и губи достъпа. Членствата
// (stripeSubscriptionId) се управляват от subscription.* събитията.
async function revokeOneOffEntitlements(paymentIntentId: string): Promise<void> {
  const purchases = await prisma.purchase.findMany({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { productId: true, buyerEmail: true },
  });
  for (const purchase of purchases) {
    if (!purchase.buyerEmail) continue;
    await prisma.entitlement
      .updateMany({
        where: {
          productId: purchase.productId,
          email: purchase.buyerEmail,
          stripeSubscriptionId: null,
        },
        data: { active: false },
      })
      .catch(() => undefined);
  }
}

// Доставка на купеното по имейл — от webhook-а, независимо от success_url
// redirect-а (затворен таб не бива да значи „платил без достъп“).
// Идемпотентно: праща само ако още не е доставено.
async function fulfilProduct(purchaseId: string): Promise<void> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      product: {
        include: { translations: true, profile: { select: { slug: true } } },
      },
    },
  });
  // Само DIGITAL продукти получават имейл с таен линк; COURSE/MEMBERSHIP
  // дават достъп през /learn (Entitlement), не през линк по имейл.
  if (
    !purchase ||
    purchase.deliveredAt ||
    !purchase.buyerEmail ||
    !purchase.product.deliveryUrl
  ) {
    return;
  }
  const deliveryUrl = purchase.product.deliveryUrl;
  const locale = purchase.locale ?? undefined;
  // Заглавие на езика на купувача (fallback към първия наличен превод).
  const title =
    (locale &&
      purchase.product.translations.find((t) => t.locale === locale)?.title) ||
    purchase.product.translations[0]?.title ||
    'Product';
  // Линк към печатната разписка (ако имаме публичен адрес).
  const base = process.env.PUBLIC_BASE_URL;
  const receiptUrl = base
    ? `${base}/u/${purchase.product.profile.slug}/receipt?session=${encodeURIComponent(purchase.stripeSessionId)}`
    : undefined;
  const sent = await sendEmail({
    to: purchase.buyerEmail,
    subject: deliverySubject(title, locale),
    html: deliveryEmailHtml({
      productTitle: title,
      deliveryUrl,
      amountCents: purchase.amountCents,
      locale,
      receiptUrl,
    }),
  });
  if (sent) {
    await prisma.purchase
      .update({ where: { id: purchaseId }, data: { deliveredAt: new Date() } })
      .catch(() => undefined);
  }
}

// Правата се дават САМО тук, след проверка на подписа — никога през
// success_url redirect-а, на който не може да се вярва.
export async function POST(request: Request): Promise<NextResponse> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  // false → отговаряме 500 и Stripe ретрайва събитието (обработчиците са
  // идемпотентни) — така транзиентно провален превод към продавача се лекува.
  let payoutOk = true;

  switch (event.type) {
    // И двете събития: completed се излъчва и при delayed-notification методи
    // (SEPA/iDEAL…) с payment_status !== 'paid'; правата и записът се дават
    // само след потвърдено плащане, а забавените плащания идват през
    // async_payment_succeeded.
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (session.payment_status !== 'paid') break;
      const userId = session.metadata?.userId;
      const planId = session.metadata?.plan as PlanId | undefined;
      if (userId && planId && PLANS[planId]) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: planId,
            stripeCustomerId:
              typeof session.customer === 'string'
                ? session.customer
                : undefined,
          },
        });
        // Реферална награда: ако този потребител е поканен, реферерът
        // получава бонус — веднъж на поканен (unique referredUserId).
        await rewardReferrer(
          userId,
          planId,
          session.amount_total ?? 0,
        ).catch(() => undefined);
      }
      // Продажба на дигитален продукт (магазина).
      const productId = session.metadata?.productId;
      const profileId = session.metadata?.profileId;
      const buyerEmail = session.customer_details?.email ?? null;
      if (productId && profileId && session.mode === 'subscription') {
        // Членство: право на достъп, докато Stripe абонаментът е активен.
        const subId =
          typeof session.subscription === 'string' ? session.subscription : null;
        if (buyerEmail) {
          await grantEntitlement(productId, profileId, buyerEmail, subId);
        }
      } else if (productId && profileId) {
        // Еднократно (DIGITAL/COURSE): записваме покупката идемпотентно.
        // ДДС слой (TAX.md): Stripe Tax е сметнал ДДС по държавата на
        // купувача (0 без данъчния слой); комисионата се смята върху
        // НЕТОТО — ДДС частта е задължение на платформата, не приход.
        const amountTotal = session.amount_total ?? 0;
        const vatCents = session.total_details?.amount_tax ?? 0;
        const netCents = Math.max(amountTotal - vatCents, 0);
        const metaPlan = (session.metadata?.plan ?? '') as PlanId;
        const feePlan: PlanId = PLANS[metaPlan] ? metaPlan : 'FREE';
        const feeCents = Math.max(
          Math.min(totalFeeCents(netCents, feePlan), netCents - 1),
          0,
        );
        const existing = await prisma.purchase.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        const purchase = await prisma.purchase
          .upsert({
            where: { stripeSessionId: session.id },
            create: {
              productId,
              profileId,
              stripeSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : null,
              amountCents: amountTotal,
              feeCents,
              vatAmountCents: vatCents,
              netAmountCents: netCents,
              buyerCountry: session.customer_details?.address?.country ?? null,
              buyerEmail,
              locale: session.metadata?.locale ?? null,
              couponCode: session.metadata?.couponCode || null,
            },
            update: {},
          })
          .catch(() => null);
        // Делът на продавача — при ВСЯКА доставка (не само първата):
        // вътрешните гардове пазят от двоен превод, а извикването на всеки
        // ретрай лекува транзиентните провали (виж payoutSeller).
        if (purchase) {
          payoutOk = (await payoutSeller(purchase.id)) && payoutOk;
        }
        // Промо код: увеличаваме броя ползвания веднъж (само при първи запис),
        // атомарно и само ако е под лимита (пази брояча от преразходване).
        const couponId = session.metadata?.couponId;
        if (!existing && purchase && couponId) {
          await prisma
            .$executeRaw`UPDATE "Coupon" SET "timesRedeemed" = "timesRedeemed" + 1 WHERE "id" = ${couponId} AND ("maxRedemptions" IS NULL OR "timesRedeemed" < "maxRedemptions")`
            .catch(() => undefined);
        }
        // Курс → доживотно право на достъп до уроците.
        if (session.metadata?.type === 'COURSE' && buyerEmail) {
          await grantEntitlement(productId, profileId, buyerEmail, null);
        }
        // Доставяме купеното по имейл (идемпотентно) — само DIGITAL.
        if (purchase) await fulfilProduct(purchase.id);
      }
      break;
    }
    case 'charge.refunded': {
      // Върнати пари → маркираме покупката (за отчетите и повторния достъп).
      const charge = event.data.object;
      const pi =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      // Действаме само при ПЪЛЕН refund — частичен (напр. жест от
      // Dashboard) не бива да отнема целия достъп, да маркира покупката
      // като върната, нито да прибира дела на продавача.
      if (pi && charge.amount_refunded === charge.amount) {
        await prisma.purchase
          .updateMany({
            where: { stripePaymentIntentId: pi },
            data: { refundedAt: new Date() },
          })
          .catch(() => undefined);
        // Върнати пари → връща се и достъпът до курса.
        await revokeOneOffEntitlements(pi).catch(() => undefined);
        // Separate charges & transfers: връщаме и дела на продавача
        // (пълен reversal — идемпотентен: повторният опит върху върнат
        // превод се проваля тихо).
        const refundedPurchases = await prisma.purchase.findMany({
          where: { stripePaymentIntentId: pi },
          select: { id: true, stripeTransferId: true },
        });
        for (const p of refundedPurchases) {
          if (!p.stripeTransferId) continue;
          await stripe.transfers
            .createReversal(
              p.stripeTransferId,
              {},
              { idempotencyKey: `reversal-${p.id}` },
            )
            .catch(() => undefined);
        }
      }
      break;
    }
    case 'charge.dispute.created': {
      // Спор/chargeback: маркираме за преглед (при destination charges
      // платформата носи отговорността — възстановяването е ръчно решение).
      const dispute = event.data.object;
      const pi =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id;
      if (pi) {
        await prisma.purchase
          .updateMany({
            where: { stripePaymentIntentId: pi },
            data: { disputedAt: new Date() },
          })
          .catch(() => undefined);
        // Chargeback → спираме достъпа веднага (при спечелен спор може да
        // се възстанови ръчно; загубата иначе е за продавача/платформата).
        await revokeOneOffEntitlements(pi).catch(() => undefined);
      }
      break;
    }
    case 'account.application.deauthorized': {
      // Продавач разкачи Stripe акаунта → спираме магазина му.
      const application = event.data.object;
      const accountId =
        typeof event.account === 'string' ? event.account : null;
      void application;
      if (accountId) {
        await prisma.user
          .updateMany({
            where: { stripeAccountId: accountId },
            data: { stripeChargesEnabled: false },
          })
          .catch(() => undefined);
      }
      break;
    }
    case 'account.updated': {
      // Connect onboarding: отключваме магазина чак когато Stripe
      // потвърди, че акаунтът може да приема плащания.
      const account = event.data.object;
      await prisma.user.updateMany({
        where: { stripeAccountId: account.id },
        data: { stripeChargesEnabled: account.charges_enabled === true },
      });
      break;
    }
    case 'customer.subscription.updated': {
      // Членство (магазина): синхронизираме достъпа със статуса на абонамента.
      // Покрива ВСИЧКИ изходи на dunning (past_due/unpaid/paused/canceled),
      // независимо от Dashboard настройката — затваря тихия теч на достъп.
      const sub = event.data.object;
      const active = sub.status === 'active' || sub.status === 'trialing';
      const periodEnd = (sub as { current_period_end?: number })
        .current_period_end;
      await prisma.entitlement
        .updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            active,
            expiresAt:
              active && periodEnd ? new Date(periodEnd * 1000) : undefined,
          },
        })
        .catch(() => undefined);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;
      // Founder е еднократен и не се губи при спрян абонамент.
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId, plan: { not: 'FOUNDER' } },
        data: { plan: 'FREE' },
      });
      // Членство към създател (магазина): отнемаме достъпа по абонамента.
      await prisma.entitlement
        .updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { active: false },
        })
        .catch(() => undefined);
      break;
    }
    default:
      break;
  }

  return NextResponse.json(
    { received: true },
    { status: payoutOk ? 200 : 500 },
  );
}
