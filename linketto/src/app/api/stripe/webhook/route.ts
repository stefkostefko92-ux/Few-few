import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { PLANS, type PlanId } from '@/lib/plans';

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
    case 'checkout.session.completed': {
      const session = event.data.object;
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
