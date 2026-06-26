/**
 * Canonical operator + game metadata for Privacy / Terms / Impressum
 * and JSON-LD. Single source of truth so changes (new VAT number, new
 * support address, new hosting region) ripple to every legal artefact.
 *
 * The values below are placeholders the operator MUST replace before
 * the platform handles a single live payment. Search this file for
 * `PLACEHOLDER` and fill each one in with the real company record.
 */
export const OPERATOR = {
  legalName: 'Carbon Stealth VCC',
  tradingName: 'Nexus Dominion',
  address: {
    street: 'PLACEHOLDER — registered office street',
    postal: '1000',
    city: 'Sofia',
    country: 'Bulgaria',
  },
  vat: 'PLACEHOLDER-VAT-NUMBER',
  registry: 'PLACEHOLDER-EIK / Companies House registration',
  representative: 'PLACEHOLDER — legal representative full name',
  hosting: {
    name: 'PLACEHOLDER-HOST',
    region: 'EU',
  },
  email: {
    support: 'support@carbonstealth.eu',
    privacy: 'privacy@carbonstealth.eu',
    dpo: 'dpo@carbonstealth.eu',
    legal: 'legal@carbonstealth.eu',
    abuse: 'abuse@carbonstealth.eu',
  },
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
