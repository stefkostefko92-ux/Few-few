import type { FeatureCode } from '../features.js';

/**
 * Плановете по подразбиране — началните стойности в базата (таблица `Plan`). След първото пускане цените,
 * лимитите и функциите се сменят от мастър панела, не оттук. Всички суми са в евроцентове БЕЗ ДДС.
 *
 * Решение на собственика (12.11.2026): лимит по брой документи само в безплатния план и само МЕК —
 * документът винаги се издава (от 2028 г. фактурата е законово задължителна), над лимита идва покана
 * за план. Платените нива се различават по потребители, фирми и функции. Кантората плаща на фирма-клиент.
 */
export type Audience = 'company' | 'accountant';

export interface PlanDefinition {
  code: string;
  audience: Audience;
  nameBg: string;
  nameEn: string;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  /** Само за кантори: цената на всяка фирма-клиент над включените. */
  perClientCompanyCents: number | null;
  includedClientCompanies: number | null;
  maxUsers: number | null;
  maxCompanies: number | null;
  /** Мекият месечен лимит на издадени документи; null = без лимит. */
  monthlyDocumentSoftLimit: number | null;
  features: FeatureCode[];
  highlighted: boolean;
  isPublic: boolean;
  sortOrder: number;
}

const CORE: FeatureCode[] = [
  'invoices',
  'credit-debit-notes',
  'en16931-xml',
  'eur-vat-bg',
  'tamper-evident-ledger',
  'two-factor',
  'pdf',
  'inbox',
  'proforma',
];

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    code: 'free',
    audience: 'company',
    nameBg: 'Безплатен',
    nameEn: 'Free',
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    perClientCompanyCents: null,
    includedClientCompanies: null,
    maxUsers: 1,
    maxCompanies: 1,
    monthlyDocumentSoftLimit: 20,
    features: [...CORE],
    highlighted: false,
    isPublic: true,
    sortOrder: 10,
  },
  {
    code: 'pro',
    audience: 'company',
    nameBg: 'Професионален',
    nameEn: 'Professional',
    priceMonthlyCents: 900,
    priceYearlyCents: 9000,
    perClientCompanyCents: null,
    includedClientCompanies: null,
    maxUsers: 5,
    maxCompanies: 1,
    monthlyDocumentSoftLimit: null,
    features: [...CORE, 'unlimited-documents', 'multi-series', 'recurring', 'reminders'],
    highlighted: true,
    isPublic: true,
    sortOrder: 20,
  },
  {
    code: 'business',
    audience: 'company',
    nameBg: 'Бизнес',
    nameEn: 'Business',
    priceMonthlyCents: 2900,
    priceYearlyCents: 29000,
    perClientCompanyCents: null,
    includedClientCompanies: null,
    maxUsers: 25,
    maxCompanies: 3,
    monthlyDocumentSoftLimit: null,
    features: [
      ...CORE,
      'unlimited-documents',
      'multi-series',
      'recurring',
      'reminders',
      'roles',
      'audit-log',
      'api',
      'bank-matching',
      'peppol',
      'nra-reporting',
      'saf-t',
      'priority-support',
    ],
    highlighted: false,
    isPublic: true,
    sortOrder: 30,
  },
  {
    code: 'firm',
    audience: 'accountant',
    nameBg: 'Кантора',
    nameEn: 'Accounting firm',
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    perClientCompanyCents: 400,
    includedClientCompanies: 3,
    maxUsers: 10,
    maxCompanies: null,
    monthlyDocumentSoftLimit: null,
    features: [
      ...CORE,
      'unlimited-documents',
      'multi-series',
      'recurring',
      'reminders',
      'roles',
      'audit-log',
      'accountant-workspace',
      'mandates',
      'peppol',
      'nra-reporting',
      'saf-t',
    ],
    highlighted: false,
    isPublic: true,
    sortOrder: 40,
  },
  {
    code: 'enterprise',
    audience: 'company',
    nameBg: 'Корпоративен',
    nameEn: 'Enterprise',
    priceMonthlyCents: null,
    priceYearlyCents: null,
    perClientCompanyCents: null,
    includedClientCompanies: null,
    maxUsers: null,
    maxCompanies: null,
    monthlyDocumentSoftLimit: null,
    features: [
      ...CORE,
      'unlimited-documents',
      'multi-series',
      'recurring',
      'reminders',
      'roles',
      'audit-log',
      'api',
      'bank-matching',
      'peppol',
      'nra-reporting',
      'saf-t',
      'priority-support',
    ],
    highlighted: false,
    isPublic: true,
    sortOrder: 50,
  },
];

/**
 * Месечната цена на кантора за даден брой фирми-клиенти: включените са безплатни, всяка следваща струва
 * `perClientCompanyCents`. Цели центове; отрицателен или дробен брой е грешка на извикващия.
 */
export function firmMonthlyCents(plan: PlanDefinition, clientCompanies: number): number {
  if (!Number.isInteger(clientCompanies) || clientCompanies < 0) {
    throw new Error('Броят фирми-клиенти трябва да е цяло неотрицателно число');
  }
  const base = plan.priceMonthlyCents ?? 0;
  const per = plan.perClientCompanyCents ?? 0;
  const included = plan.includedClientCompanies ?? 0;
  return base + Math.max(0, clientCompanies - included) * per;
}

/** Мекият лимит: документът се издава винаги; резултатът казва само дали да се покаже поканата за план. */
export function softLimitState(
  limit: number | null,
  issuedThisMonth: number,
): { overLimit: boolean; remaining: number | null } {
  if (limit === null) return { overLimit: false, remaining: null };
  return { overLimit: issuedThisMonth >= limit, remaining: Math.max(0, limit - issuedThisMonth) };
}
