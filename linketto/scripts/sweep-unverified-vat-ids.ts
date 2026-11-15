// Еднократно махане на непроверени ДДС номера (`eu_vat`, статус ≠ verified)
// от Stripe customer-ите на всички потребители (TAX.md „ДДС номер и VIES“).
// Без това заварен абонат с номер, събран по-рано през tax_id_collection,
// получава 0% ДДС при всяко подновяване (Stripe Tax гледа само формата).
// Решението е в src/lib/vat-taxid-sweep.ts (+ unverifiedVatTaxIds).
//
// Употреба (в linketto/, на сървъра, с env STRIPE_SECRET_KEY + DATABASE_URL):
//   npx tsx scripts/sweep-unverified-vat-ids.ts            # само отчет (dry-run, по подразбиране)
//   npx tsx scripts/sweep-unverified-vat-ids.ts --apply    # триене
//
// Кога: веднъж след деплоя на промяната, която махна tax_id_collection
// (DEPLOY.md §3). Идемпотентно — второ пускане не намира нищо. ВНИМАНИЕ:
// трие и `pending` номер, който админ току-що е добавил след ръчна VIES
// проверка (TAX.md, B2B) — пусни го ПРЕДИ такова добавяне или виж dry-run-а.
// Нужни права на ключа (restricted): Customers — запис (tax IDs).
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { createPlanStripePorts } from '../src/lib/plan-checkout-stripe';
import { STRIPE_API_VERSION } from '../src/lib/stripe-state';
import { sweepUnverifiedVatTaxIds } from '../src/lib/vat-taxid-sweep';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY липсва');
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { stripeCustomerId: { not: null } },
      select: { stripeCustomerId: true },
    });
    const customerIds = users.flatMap((u) => (u.stripeCustomerId ? [u.stripeCustomerId] : []));
    const results = await sweepUnverifiedVatTaxIds(customerIds, createPlanStripePorts(stripe), {
      apply: APPLY,
    });
    for (const r of results) {
      if (r.taxIds.length > 0 || r.error) {
        console.log(
          `${APPLY ? '' : '[dry-run] '}${r.customerId}: ${r.taxIds.join(', ') || '—'}${r.error ? ` (грешка: ${r.error})` : ''}`,
        );
      }
    }
    const found = results.reduce((n, r) => n + r.taxIds.length, 0);
    console.log(
      `${APPLY ? 'приложено' : 'dry-run'}: customers=${results.length} непроверени=${found} грешки=${results.filter((r) => r.error).length}`,
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
