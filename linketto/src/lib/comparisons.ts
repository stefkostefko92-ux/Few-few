// Сравнителни страници (/[locale]/vs/<конкурент>). Сравнителна реклама по
// Дир. 2006/114/ЕО чл. 4 и ЗЗП: само СЪЩЕСТВЕНИ, ПРОВЕРИМИ и ПРЕДСТАВИТЕЛНИ
// характеристики, с източник и дата; без омаловажаване. Всеки ред за
// конкурента е проверен срещу първоизточник на CHECKED_AT — при промяна там
// първо се обновява тук (и датата). Твърдения без първоизточник НЕ влизат.
// Наши стойности идват от plans.ts — не се хардкодват отделно. Таксата за
// обработка НЕ се сравнява: тяхната е на Stripe в САЩ, нашата — за ЕС
// (непредставително по правния преглед 2026-10-23).

import { PLANS } from '@/lib/plans';

export const COMPARISONS_CHECKED_AT = '2026-10-23';

export const COMPETITOR_IDS = ['linktree', 'beacons'] as const;
export type CompetitorId = (typeof COMPETITOR_IDS)[number];

export type Cell =
  | { t: 'price'; amount: string; plan: string }
  | { t: 'percent'; value: number; plan: string }
  | { t: 'days'; value: number; plan: string }
  | { t: 'yesFrom'; amount: string; plan: string }
  | { t: 'no' }
  | { t: 'freeOnly' };

export type RowId =
  | 'entryPaid'
  | 'zeroFeeFrom'
  | 'freeSelling'
  | 'feeFree'
  | 'feeEntryPaid'
  | 'customDomain'
  | 'removeBranding'
  | 'analyticsFree';

export interface ComparisonRow {
  id: RowId;
  us: Cell;
  them: Cell;
  /** Индекс в sources на конкурента. */
  source: number;
}

export interface Competitor {
  id: CompetitorId;
  name: string;
  /** Валута на цените на конкурента, както са показани на страницата му. */
  currency: 'USD';
  sources: { label: string; url: string }[];
  rows: ComparisonRow[];
}

const eur = (cents: number) =>
  `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

const PRO = PLANS.PRO;
const BUSINESS = PLANS.BUSINESS;
const FREE = PLANS.FREE;

export const COMPETITORS: Record<CompetitorId, Competitor> = {
  linktree: {
    id: 'linktree',
    name: 'Linktree',
    currency: 'USD',
    sources: [
      { label: 'linktr.ee/s/pricing', url: 'https://linktr.ee/s/pricing' },
      {
        label: 'Linktree Help · custom domains (6571689)',
        url: 'https://linktr.ee/help/en/articles/6571689',
      },
    ],
    rows: [
      {
        id: 'entryPaid',
        us: { t: 'price', amount: eur(PRO.priceCents), plan: 'Pro' },
        them: { t: 'price', amount: '$9', plan: 'Starter' },
        source: 0,
      },
      {
        id: 'zeroFeeFrom',
        us: { t: 'price', amount: eur(BUSINESS.priceCents), plan: 'Business' },
        them: { t: 'price', amount: '$17', plan: 'Pro' },
        source: 0,
      },
      {
        id: 'freeSelling',
        us: { t: 'percent', value: FREE.feePercent, plan: 'Free' },
        them: { t: 'freeOnly' },
        source: 0,
      },
      {
        id: 'customDomain',
        us: { t: 'yesFrom', amount: eur(PRO.priceCents), plan: 'Pro' },
        them: { t: 'no' },
        source: 1,
      },
      {
        id: 'removeBranding',
        us: { t: 'yesFrom', amount: eur(PRO.priceCents), plan: 'Pro' },
        them: { t: 'yesFrom', amount: '$17', plan: 'Pro' },
        source: 0,
      },
      {
        id: 'analyticsFree',
        us: { t: 'days', value: FREE.analyticsDays ?? 0, plan: 'Free' },
        them: { t: 'days', value: 28, plan: 'Free' },
        source: 0,
      },
    ],
  },
  beacons: {
    id: 'beacons',
    name: 'Beacons',
    currency: 'USD',
    sources: [
      { label: 'beacons.ai/i/pricing', url: 'https://beacons.ai/i/pricing' },
    ],
    rows: [
      {
        id: 'entryPaid',
        us: { t: 'price', amount: eur(PRO.priceCents), plan: 'Pro' },
        them: { t: 'price', amount: '$10', plan: 'Creator' },
        source: 0,
      },
      {
        id: 'feeFree',
        us: { t: 'percent', value: FREE.feePercent, plan: 'Free' },
        them: { t: 'percent', value: 9, plan: 'Free' },
        source: 0,
      },
      {
        id: 'feeEntryPaid',
        us: { t: 'percent', value: PRO.feePercent, plan: 'Pro' },
        them: { t: 'percent', value: 9, plan: 'Creator' },
        source: 0,
      },
      {
        id: 'zeroFeeFrom',
        us: { t: 'price', amount: eur(BUSINESS.priceCents), plan: 'Business' },
        them: { t: 'price', amount: '$30', plan: 'Creator Plus' },
        source: 0,
      },
      {
        id: 'customDomain',
        us: { t: 'yesFrom', amount: eur(PRO.priceCents), plan: 'Pro' },
        them: { t: 'yesFrom', amount: '$10', plan: 'Creator' },
        source: 0,
      },
    ],
  },
};

export function isCompetitorId(value: string): value is CompetitorId {
  return (COMPETITOR_IDS as readonly string[]).includes(value);
}
