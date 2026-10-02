// The price list's groups and units, apart from the articles (the screens import these without the catalogues).
export const PRICE_GROUPS = ['machines', 'bedplates', 'supports', 'ropes', 'rails', 'brackets', 'panev', 'doors', 'safety', 'car'] as const;
export type PriceGroup = (typeof PRICE_GROUPS)[number];
export type PriceUnit = 'pz' | 'm' | 'kg';
