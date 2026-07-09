/**
 * Canonical operator + game metadata for Privacy / Terms / Impressum
 * and JSON-LD. Single source of truth so changes (new VAT number, new
 * support address, new hosting region) ripple to every legal artefact.
 *
 * Данните са от публичния импресум на Carbon Stealth VCC (same operator
 * record as medqr/zabobovdol; ЕИК/ДДС от Търговския регистър).
 */
export const OPERATOR = {
  legalName: 'Carbon Stealth VCC',
  legalForm: 'дружество с променлив капитал (VCC)',
  tradingName: 'Nexus Dominion',
  address: {
    street: 'ул. „Самуил“ 3',
    postal: '2670',
    city: 'Бобов дол',
    country: 'България',
  },
  vat: 'BG208725180',
  registry: 'ЕИК 208725180',
  representative: 'Стефан Костадинов',
  hosting: {
    name: 'Hetzner Online GmbH',
    region: 'EU (Германия/Финландия)',
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
