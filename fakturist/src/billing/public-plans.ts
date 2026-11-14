import { prisma } from '../db.js';
import { logger, errorMessage } from '../logger.js';
import { isFeatureCode, type FeatureCode } from '../features.js';
import { MINUTE } from '../time.js';
import type { Audience } from './plans.js';

/** Планът, както го вижда витрината (само публичните полета). */
export interface PublicPlan {
  code: string;
  audience: Audience;
  nameBg: string;
  nameEn: string;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  perClientCompanyCents: number | null;
  includedClientCompanies: number | null;
  maxUsers: number | null;
  maxCompanies: number | null;
  monthlyDocumentSoftLimit: number | null;
  features: FeatureCode[];
  highlighted: boolean;
}

let cache: { at: number; plans: PublicPlan[] } | null = null;

/** Сменените от мастър панела цени се виждат до минута; панелът изчиства кеша веднага при запис. */
export function invalidatePublicPlans(): void {
  cache = null;
}

/**
 * Публичните планове от базата. При грешка на базата връща null — витрината показва, че цените не могат
 * да се заредят, вместо стари числа (цена на витрината = оферта).
 */
export async function publicPlans(): Promise<PublicPlan[] | null> {
  if (cache && Date.now() - cache.at < MINUTE) return cache.plans;
  try {
    const rows = await prisma.plan.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const plans: PublicPlan[] = rows.map((row) => ({
      code: row.code,
      audience: row.audience === 'ACCOUNTANT' ? 'accountant' : 'company',
      nameBg: row.nameBg,
      nameEn: row.nameEn,
      priceMonthlyCents: row.priceMonthlyCents,
      priceYearlyCents: row.priceYearlyCents,
      perClientCompanyCents: row.perClientCompanyCents,
      includedClientCompanies: row.includedClientCompanies,
      maxUsers: row.maxUsers,
      maxCompanies: row.maxCompanies,
      monthlyDocumentSoftLimit: row.monthlyDocumentSoftLimit,
      features: row.features.filter(isFeatureCode),
      highlighted: row.highlighted,
    }));
    cache = { at: Date.now(), plans };
    return plans;
  } catch (error) {
    logger.error({ err: errorMessage(error) }, 'плановете не се заредиха');
    return null;
  }
}
