// Почистване на застояли резервации на промо кодове (HELD по-стари от 2 ч):
// срив между резервацията и Stripe create, провалено връщане или пропуснат
// webhook (`checkout.session.expired` не е абониран) иначе държат кода
// „изчерпан“ завинаги. Решението е в src/lib/coupon-reservation.ts
// (staleReservationAction): без сесия/expired → release; complete+paid →
// consume; иначе keep (отложено плащане — решава async_payment_* събитието).
//
// Употреба (в linketto/, на сървъра, с env STRIPE_SECRET_KEY + DATABASE_URL):
//   npx tsx scripts/sweep-coupon-reservations.ts            # само отчет (dry-run, по подразбиране)
//   npx tsx scripts/sweep-coupon-reservations.ts --apply    # запис
//
// Идемпотентно: преходите са CAS по статуса, повторното пускане не връща
// нищо втори път. Грешка от Stripe → keep (не освобождава без доказателство).
// Препоръчително restricted key само с четене на Checkout Sessions.
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { createCouponLedger } from '../src/lib/coupon-ledger';
import { sweepStaleReservations } from '../src/lib/coupon-reservation';
import { STRIPE_API_VERSION } from '../src/lib/stripe-state';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY липсва');
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  const prisma = new PrismaClient();
  try {
    const results = await sweepStaleReservations(
      createCouponLedger(prisma),
      async (sessionId) => {
        const s = await stripe.checkout.sessions.retrieve(sessionId);
        return { status: s.status, payment_status: s.payment_status };
      },
      { now: new Date(), apply: APPLY },
    );
    const count = (a: string) => results.filter((r) => r.action === a).length;
    for (const r of results) {
      if (r.action !== 'keep' || r.error) {
        console.log(`${APPLY ? '' : '[dry-run] '}${r.id}: ${r.action}${r.error ? ` (грешка: ${r.error})` : ''}`);
      }
    }
    console.log(
      `${APPLY ? 'приложено' : 'dry-run'}: release=${count('release')} consume=${count('consume')} keep=${count('keep')}`,
    );
    if (results.some((r) => r.error)) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
