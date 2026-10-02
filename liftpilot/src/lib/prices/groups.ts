// The price list's groups and units, and how a free line counts, apart from the articles (the screens import these
// without the catalogues).
export const PRICE_GROUPS = ['machines', 'bedplates', 'supports', 'ropes', 'rails', 'brackets', 'panev', 'doors', 'safety', 'car', 'electrical', 'labour'] as const;
export type PriceGroup = (typeof PRICE_GROUPS)[number];
/** a piece, a metre, a kilogram, a stop of the lift (labour by the stop), a lump sum (a corpo) */
export type PriceUnit = 'pz' | 'm' | 'kg' | 'stop' | 'lot';

/** A free line's quantity in a project: once (a corpo), by the stop, by the metre of travel. */
export const PRICE_BASES = ['LOT', 'STOP', 'TRAVEL'] as const;
export type PriceBasisName = (typeof PRICE_BASES)[number];
/** The projects a free line goes into: all, the whole projects, the machine replacements. */
export const PRICE_SCOPES = ['ALL', 'FULL', 'REPLACEMENT'] as const;
export type PriceScopeName = (typeof PRICE_SCOPES)[number];
/** The most free lines a company keeps. */
export const CUSTOM_MAX = 100;
