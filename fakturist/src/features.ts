/**
 * Регистърът на функциите — ЕДИНСТВЕНИЯТ списък. Плановете (src/billing/plans.ts) сочат кодовете оттук,
 * мастър панелът ги показва и включва/изключва глобално, витрината сравнява плановете по тях.
 * Нова функция = нов ред тук + преводите `features.<код>.name` / `.description` (tests/features.test.ts пази и двете).
 *
 * `status: 'planned'` — още не е налична; витрината я показва с датата, никога като готова
 * (заблуждаваща реклама — Директива 2005/29/ЕО).
 */
export const FEATURES = [
  { code: 'invoices', group: 'documents', status: 'live' },
  { code: 'credit-debit-notes', group: 'documents', status: 'live' },
  { code: 'en16931-xml', group: 'documents', status: 'live' },
  { code: 'eur-vat-bg', group: 'documents', status: 'live' },
  { code: 'tamper-evident-ledger', group: 'documents', status: 'live' },
  { code: 'unlimited-documents', group: 'documents', status: 'live' },
  { code: 'multi-series', group: 'documents', status: 'live' },
  { code: 'pdf', group: 'documents', status: 'live' },
  { code: 'inbox', group: 'documents', status: 'live' },
  { code: 'proforma', group: 'documents', status: 'live' },
  { code: 'recurring', group: 'automation', status: 'live' },
  { code: 'reminders', group: 'automation', status: 'live' },
  { code: 'bank-matching', group: 'automation', status: 'live' },
  { code: 'api', group: 'automation', status: 'live' },
  { code: 'roles', group: 'team', status: 'live' },
  { code: 'audit-log', group: 'team', status: 'live' },
  { code: 'two-factor', group: 'team', status: 'live' },
  { code: 'accountant-workspace', group: 'accountants', status: 'live' },
  { code: 'mandates', group: 'accountants', status: 'live' },
  { code: 'peppol', group: 'einvoicing', status: 'planned', target: '2027-Q3' },
  { code: 'nra-reporting', group: 'einvoicing', status: 'planned', target: '2028-Q1' },
  { code: 'saf-t', group: 'einvoicing', status: 'live' },
  { code: 'priority-support', group: 'support', status: 'live' },
] as const satisfies ReadonlyArray<{
  code: string;
  group: string;
  status: 'live' | 'planned';
  target?: string;
}>;

export type FeatureCode = (typeof FEATURES)[number]['code'];
export type Feature = (typeof FEATURES)[number];

export const FEATURE_GROUPS = [
  'documents',
  'automation',
  'team',
  'accountants',
  'einvoicing',
  'support',
] as const;

const BY_CODE = new Map<string, Feature>(FEATURES.map((feature) => [feature.code, feature]));

export function isFeatureCode(value: string): value is FeatureCode {
  return BY_CODE.has(value);
}

export function feature(code: FeatureCode): Feature {
  const found = BY_CODE.get(code);
  if (!found) throw new Error(`Непозната функция ${code}`);
  return found;
}
