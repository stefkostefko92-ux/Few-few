// Carbon Stealth VCC, who provides LiftPilot: the values the footer, the structured data and the legal texts state
// (the words around them are in messages/<locale>.json; src/lib/__tests__/legal.test.ts checks that they agree). The
// company is entered in the Bulgarian Commercial Register in Cyrillic and in Latin letters; ЕДПК is a sole-owner
// variable capital company (Commerce Act, art. 260a ff.), which English and Italian call VCC.
export const PROVIDER = {
  name: 'Carbon Stealth VCC',
  nameBg: 'Карбон Стелт ЕДПК',
  eik: '208725180',
  vat: 'BG208725180',
  representative: 'Stefan Kostadinov',
  email: 'info@carbonstealth.eu',
  /** Bulgaria first (the seat), then Italy (the customers) */
  phones: ['+359 877 414 874', '+39 379 296 9699'],
  url: 'https://carbonstealth.eu',
  address: { street: 'ul. Samuil 3', postalCode: '2670', locality: 'Bobov Dol', region: 'Kyustendil', country: 'BG' },
} as const;

/** The servers: Hetzner Online GmbH, data centre of Nuremberg (NBG1), Germany — the jurisdiction the Data Act page names. */
export const HOSTING = { provider: 'Hetzner Online GmbH', site: 'Nürnberg (NBG1)', country: 'DE' } as const;
