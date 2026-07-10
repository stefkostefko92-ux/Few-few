import 'server-only';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

// Превежда дела на продавача (нето − комисиона) при separate charges &
// transfers — плащането е при платформата (ДДС-то остава при нас, TAX.md),
// а продавачът получава своя дял. source_transaction връзва наличността
// на превода към сетълмента на плащането. Retry-safe: гардове са самите
// парични условия (stripeTransferId + idempotencyKey), не еднократен
// флаг — вика се при ВСЯКА доставка на събитието. Връща false при провал:
// webhook-ът тогава отговаря 500 → Stripe ретрайва (до 3 дни), а
// payoutFailedAt прави провала видим в админа (и ретрайваем ръчно).
export async function payoutSeller(purchaseId: string): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return true;
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      product: {
        include: {
          profile: {
            include: { user: { select: { stripeAccountId: true } } },
          },
        },
      },
    },
  });
  // Няма какво да се прави: липсва/вече преведен/заварен destination модел.
  if (!purchase || purchase.stripeTransferId) return true;
  if (purchase.chargedOn !== 'platform') return true;
  const amountCents =
    (purchase.netAmountCents ?? purchase.amountCents) - purchase.feeCents;
  const accountId = purchase.product.profile.user.stripeAccountId;
  const pi = purchase.stripePaymentIntentId;
  if (amountCents <= 0 || !accountId || !pi) return true;
  try {
    const intent = await stripe.paymentIntents.retrieve(pi);
    const chargeId =
      typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : (intent.latest_charge?.id ?? null);
    if (!chargeId) throw new Error('no charge');
    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: 'eur',
        destination: accountId,
        source_transaction: chargeId,
      },
      { idempotencyKey: `transfer-${purchase.stripeSessionId}` },
    );
    await prisma.purchase
      .update({
        where: { id: purchaseId },
        data: { stripeTransferId: transfer.id, payoutFailedAt: null },
      })
      .catch(() => undefined);
    return true;
  } catch {
    // Преводът не мина (изтрит/ограничен акаунт, транзиент) — маркираме
    // за админа; купувачът НЕ е засегнат, продавачът се покрива при ретрай.
    await prisma.purchase
      .update({
        where: { id: purchaseId },
        data: { payoutFailedAt: new Date() },
      })
      .catch(() => undefined);
    return false;
  }
}
