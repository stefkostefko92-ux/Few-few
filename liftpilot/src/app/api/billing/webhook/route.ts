import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { billingConfig } from '@/lib/billing-config';
import { stripeClient, stripeErrorOf } from '@/lib/stripe';
import { syncSubscription } from '@/server/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const idOf = (x: string | { id: string }): string => (typeof x === 'string' ? x : x.id);

// Stripe's events of the subscription: the signature verified on the raw body with the endpoint's secret, each event
// acted on once (StripeEvent), the subscription always read back from Stripe (events can arrive late and out of order).
// 2xx tells Stripe it is handled; an error answers 500 and Stripe sends it again.
export async function POST(req: Request): Promise<Response> {
  const cfg = billingConfig(), s = stripeClient();
  if (!cfg || !s) return text(404, 'Not found');
  const sig = req.headers.get('stripe-signature'), body = await req.text();
  if (!sig || body.length > 512 * 1024) return text(400, 'Bad request');
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(body, sig, cfg.webhookSecret);
  } catch {
    log.warn('stripe webhook: signature refused');
    return text(400, 'Bad signature');
  }
  if (await prisma.stripeEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return text(200, 'Already handled');
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const ss = event.data.object;
        if (ss.mode === 'subscription' && ss.subscription) await syncSubscription(await s.subscriptions.retrieve(idOf(ss.subscription)));
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await syncSubscription(await s.subscriptions.retrieve(event.data.object.id));
        break;
      default:
        break;
    }
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } }).catch(() => undefined);
    return text(200, 'OK');
  } catch (err) {
    log.error({ err: stripeErrorOf(err), type: event.type }, 'stripe webhook failed');
    return text(500, 'Failed');
  }
}
