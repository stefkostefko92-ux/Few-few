import type { Prisma } from '@prisma/client';
import { DEFAULT_PLANS } from './plans.js';

/**
 * Създава плановете по подразбиране, които още ги няма. Съществуващ план НЕ се презаписва — цените,
 * сменени от мастър панела, остават.
 */
export async function seedPlans(db: Prisma.TransactionClient): Promise<number> {
  let created = 0;
  for (const plan of DEFAULT_PLANS) {
    const exists = await db.plan.findUnique({ where: { code: plan.code }, select: { id: true } });
    if (exists) continue;
    await db.plan.create({
      data: {
        code: plan.code,
        audience: plan.audience === 'accountant' ? 'ACCOUNTANT' : 'COMPANY',
        nameBg: plan.nameBg,
        nameEn: plan.nameEn,
        priceMonthlyCents: plan.priceMonthlyCents,
        priceYearlyCents: plan.priceYearlyCents,
        perClientCompanyCents: plan.perClientCompanyCents,
        includedClientCompanies: plan.includedClientCompanies,
        maxUsers: plan.maxUsers,
        maxCompanies: plan.maxCompanies,
        monthlyDocumentSoftLimit: plan.monthlyDocumentSoftLimit,
        features: plan.features,
        highlighted: plan.highlighted,
        isPublic: plan.isPublic,
        sortOrder: plan.sortOrder,
      },
    });
    created += 1;
  }
  return created;
}
