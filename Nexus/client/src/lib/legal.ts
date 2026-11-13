/**
 * Canonical operator + game metadata for Privacy / Terms / Impressum
 * and JSON-LD. Single source of truth so changes (new VAT number, new
 * support address, new hosting region) ripple to every legal artefact.
 *
 * Фирмата е вписана в Търговския регистър и на латиница („Carbon Stealth VCC“), и на
 * кирилица („Карбон Стелт ЕДПК“) — еднолично дружество с променлив капитал (чл. 260а и сл.
 * ТЗ). Правните страници са на английски: там отделна форма за едноличното няма, затова е
 * VCC, а българското име стои до латинското (с lang="bg").
 */
export const OPERATOR = {
  legalName: 'Carbon Stealth VCC',
  legalNameBg: 'Карбон Стелт ЕДПК',
  legalForm: 'variable capital company (VCC) under Bulgarian law',
  tradingName: 'Nexus Dominion',
  address: {
    street: 'ul. Samuil 3',
    postal: '2670',
    city: 'Bobov Dol',
    country: 'Bulgaria',
  },
  eik: '208725180',
  vat: 'BG208725180',
  registry: 'Commercial Register and Register of Non-Profit Legal Entities (Registry Agency, Bulgaria)',
  representative: 'Stefan Kostadinov',
  hosting: {
    name: 'Hetzner Online GmbH',
    region: 'EU (Germany/Finland)',
  },
  // Само реално съществуващи пощи от фирмения запис (info/privacy/security) —
  // непотвърдени кутии (support@/dpo@/legal@) биха гълтали писма на играчи.
  email: {
    support: 'info@carbonstealth.eu',
    privacy: 'privacy@carbonstealth.eu',
    dpo: 'privacy@carbonstealth.eu',
    legal: 'info@carbonstealth.eu',
    abuse: 'security@carbonstealth.eu',
  },
  phone: '+359 877 414 874',
  companyUrl: 'https://carbonstealth.eu',
  publicBaseUrl: 'https://nexus.carbonstealth.eu',
} as const;

/**
 * Per-country age of digital consent (GDPR Art. 8 — each member state
 * picks a floor between 13 and 16). Bulgaria and Italy require 14.
 * Default 16 when we cannot read the country code.
 */
export const AGE_OF_DIGITAL_CONSENT: Record<string, number> = {
  BG: 14,
  IT: 14,
  DE: 16,
  FR: 15,
  default: 16,
};

export function minAgeForCountry(country: string | null | undefined): number {
  if (!country) return AGE_OF_DIGITAL_CONSENT.default;
  return AGE_OF_DIGITAL_CONSENT[country.toUpperCase()] ?? AGE_OF_DIGITAL_CONSENT.default;
}
