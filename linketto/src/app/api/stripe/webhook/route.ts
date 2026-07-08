import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { PLANS, type PlanId } from '@/lib/plans';
import { deliveryEmailHtml, sendEmail } from '@/lib/email';

// Доставка на купеното по имейл — от webhook-а, независимо от success_url
// redirect-а (затворен таб не бива да значи „платил без достъп“).
// Идемпотентно: праща само ако още не е доставено.
async function fulfilProduct(purchaseId: string): Promise<void> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { product: { include: { translations: true } } },
  });
  if (!purchase || purchase.deliveredAt || !purchase.buyerEmail) return;
  const title = purchase.product.translations[0]?.title ?? 'Product';
  const sent = await sendEmail({
    to: purchase.buyerEmail,
    subject: `Linketto — ${title}`,
    html: deliveryEmailHtml({
      productTitle: title,
      deliveryUrl: purchase.product.deliveryUrl,
      amountCents: purchase.amountCents,
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
      }
      // Продажба на дигитален продукт (магазина): записваме покупката
      // идемпотентно по stripeSessionId.
      const productId = session.metadata?.productId;
      const profileId = session.metadata?.profileId;
      if (productId && profileId) {
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
              amountCents: session.amount_total ?? 0,
              feeCents: Number(session.metadata?.feeCents ?? 0) || 0,
              buyerEmail: session.customer_details?.email ?? null,
            },
            update: {},
          })
          .catch(() => null);
        // Доставяме купеното по имейл (идемпотентно) — истинският
        // fulfilment, независим от success_url redirect-а.
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
      if (pi) {
        await prisma.purchase
          .updateMany({
            where: { stripePaymentIntentId: pi },
            data: { refundedAt: new Date() },
          })
          .catch(() => undefined);
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
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
