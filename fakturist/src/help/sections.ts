import type { Capability } from '../auth/roles.js';
import type { FeatureCode } from '../features.js';

/**
 * Помощта — ЕДИНСТВЕНИЯТ списък на разделите (SPEC 89–91). Текстът е в `locales/{bg,en}/help.json`
 * (`help.sections.<id>.title`, `.intro`, `.steps.<n>`, `.tips.<n>` — поредни от 1). Публичната страница
 * „Как работи“ показва всичко; „Помощ“ в приложението и PDF наръчникът — само това, което човекът
 * вижда и може: вида на организацията (фирма/кантора), правото по роля и функцията по план.
 */
export type HelpAudience = 'company' | 'firm' | 'both';

export interface HelpSection {
  id: string;
  /** За кого е разделът: фирма, счетоводна кантора или и двете. */
  audience: HelpAudience;
  /** Правото, без което разделът не е за човека (null — за всеки член). */
  capability: Capability | null;
  /**
   * Функцията по план (src/features.ts): разделът се показва, а без плана — с бележка „не е включено във
   * Вашия план“ (не се крие — менюто също го показва). `planned` никога не се показва като налична.
   */
  feature: FeatureCode | null;
  /** Само прекият собственик (предаване на собственост, план, прекратяване). */
  ownerOnly?: boolean;
}

export const HELP_SECTIONS: readonly HelpSection[] = [
  { id: 'start', audience: 'both', capability: null, feature: null },
  { id: 'company-data', audience: 'both', capability: 'org.settings', feature: null },
  { id: 'issue', audience: 'both', capability: 'documents.issue', feature: 'invoices' },
  { id: 'notes', audience: 'both', capability: 'documents.issue', feature: 'credit-debit-notes' },
  { id: 'annul', audience: 'both', capability: 'documents.cancel', feature: 'invoices' },
  { id: 'advance', audience: 'both', capability: 'documents.issue', feature: 'invoices' },
  { id: 'proforma', audience: 'both', capability: 'documents.issue', feature: 'proforma' },
  { id: 'catalog', audience: 'both', capability: 'parties.manage', feature: null },
  { id: 'payments', audience: 'both', capability: 'documents.read', feature: null },
  { id: 'recurring', audience: 'both', capability: 'documents.issue', feature: 'recurring' },
  { id: 'inbox', audience: 'both', capability: 'documents.read', feature: 'inbox' },
  { id: 'journals', audience: 'both', capability: 'documents.read', feature: 'vat-ledgers' },
  { id: 'team', audience: 'both', capability: 'members.manage', feature: null },
  { id: 'mandates', audience: 'company', capability: 'mandates.manage', feature: null },
  {
    id: 'firm-clients',
    audience: 'firm',
    capability: 'members.manage',
    feature: 'accountant-workspace',
  },
  { id: 'ownership', audience: 'both', capability: null, feature: null, ownerOnly: true },
  { id: 'plan', audience: 'both', capability: 'billing.manage', feature: null, ownerOnly: true },
  { id: 'api', audience: 'both', capability: 'org.settings', feature: 'api' },
  { id: 'security', audience: 'both', capability: null, feature: 'two-factor' },
  { id: 'export', audience: 'both', capability: 'org.settings', feature: null },
  { id: 'upcoming', audience: 'both', capability: null, feature: null },
];

/** Публичните въпроси и отговори на страницата „Как работи“ (`help.faq.<n>.q/.a`). */
export const HELP_FAQ_COUNT = 8;
