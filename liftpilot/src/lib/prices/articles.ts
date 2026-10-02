// The articles a company prices: every one the software can put in a project — the machines of the catalogues, SICOR's
// bedplates with the diverting pulley, the supports of the machine, the ropes and the rails by size, the brackets, Panev's
// 48 articles, the doors, the governors and the tension pulley, the buffers, the car, its sling and the counterweight.
// Each company keeps its own prices (PriceItem); Panev's start from the 2026 list price (p. 65, VAT excluded), the
// others from none. The names are the makers' and the catalogues'; what an article is, the screens say in their
// language (messages `prices.items`). Pure.
import { BEDPLATE_CODES } from '@/lib/catalog/bedplates';
import { MACHINES } from '@/lib/catalog/machines';
import { PANEV_ARTICLES, PANEV_LISTINO } from '@/lib/catalog/panev';
import { PANEV_LIST_PRICE } from '@/lib/catalog/panev-prices';
import { GOVERNORS } from '@/shaft/governor';
import { RAIL_TYPES, railLabel } from '@/shaft/rails';
import { SUPPORT_KINDS } from '@/shaft/support';
import type { BufferType } from '@/shaft/vertical';
import type { DoorKind } from '@/shaft/types';
import type { PriceGroup, PriceUnit } from './groups';

export { PRICE_GROUPS, type PriceGroup, type PriceUnit } from './groups';

/** What the article is (the key of its words in `prices.items`) and its maker's name, code or size. */
export interface ArticleLabel {
  item: string;
  name?: string;
}

export interface PriceArticle {
  key: string;
  group: PriceGroup;
  label: ArticleLabel;
  unit: PriceUnit;
  /** the price it starts from [cents, VAT excluded] and where it comes from; none: the company enters it */
  start?: { cents: number; src: string };
}

/** Rope diameters of the lifts' ropes the list offers [mm] (EN 12385-5 sizes; the calculator takes any). */
export const ROPE_SIZES: readonly number[] = [6, 6.5, 8, 9, 10, 11, 12, 13, 16];
export const DOOR_KINDS: readonly DoorKind[] = ['T2', 'C2'];
export const BUFFER_KINDS: readonly BufferType[] = ['spring', 'pu', 'oil'];

export const machineKey = (brand: string, model: string): string => `machine:${brand}:${model}`;
export const bedplateKey = (code: string): string => `bedplate:${code}`;
export const ropeKey = (d: number): string => `rope:${d}`;
export const governorKey = (brand: string, model: string): string => `governor:${brand}:${model}`;

const PANEV_SRC = `Panev ${PANEV_LISTINO.year}, p. ${PANEV_LISTINO.page}`;

export const PRICE_ARTICLES: readonly PriceArticle[] = [
  ...MACHINES.map((m): PriceArticle => ({ key: machineKey(m.brand, m.model), group: 'machines', label: { item: 'machine', name: `${m.brand} ${m.model}` }, unit: 'pz' })),
  ...BEDPLATE_CODES.map((b): PriceArticle => ({ key: bedplateKey(b.code), group: 'bedplates', label: { item: 'bedplate', name: `SICOR ${b.code} (${b.models.join(', ')})` }, unit: 'pz' })),
  ...SUPPORT_KINDS.map((k): PriceArticle => ({ key: `support:${k}`, group: 'supports', label: { item: `support_${k}` }, unit: 'pz' })),
  { key: 'support:stand', group: 'supports', label: { item: 'support_stand' }, unit: 'pz' },
  ...ROPE_SIZES.map((d): PriceArticle => ({ key: ropeKey(d), group: 'ropes', label: { item: 'rope', name: String(d).replace('.', ',') }, unit: 'm' })),
  ...RAIL_TYPES.map((t): PriceArticle => ({ key: `rail:${t}`, group: 'rails', label: { item: 'rail', name: railLabel(t) }, unit: 'm' })),
  ...RAIL_TYPES.map((t): PriceArticle => ({ key: `fishplate:${t}`, group: 'rails', label: { item: 'fishplate', name: railLabel(t) }, unit: 'pz' })),
  { key: 'bracket:car', group: 'brackets', label: { item: 'bracket_car' }, unit: 'pz' },
  { key: 'bracket:cw', group: 'brackets', label: { item: 'bracket_cw' }, unit: 'pz' },
  ...PANEV_ARTICLES.map((a): PriceArticle => {
    const list = PANEV_LIST_PRICE[a.code];
    return {
      key: `panev:${a.code}`, group: 'panev', label: { item: `panev_${a.kind}`, name: `${a.code} (${a.size})` }, unit: 'pz',
      ...(list !== undefined ? { start: { cents: Math.round(list * 100), src: PANEV_SRC } } : {}),
    };
  }),
  ...DOOR_KINDS.map((k): PriceArticle => ({ key: `door:landing:${k}`, group: 'doors', label: { item: `door_landing_${k}` }, unit: 'pz' })),
  ...DOOR_KINDS.map((k): PriceArticle => ({ key: `door:car:${k}`, group: 'doors', label: { item: `door_car_${k}` }, unit: 'pz' })),
  ...GOVERNORS.map((g): PriceArticle => ({ key: governorKey(g.brand, g.model), group: 'safety', label: { item: 'governor', name: `${g.brand} ${g.model}` }, unit: 'pz' })),
  { key: 'tension', group: 'safety', label: { item: 'tension' }, unit: 'pz' },
  ...BUFFER_KINDS.map((k): PriceArticle => ({ key: `buffer:${k}`, group: 'safety', label: { item: `buffer_${k}` }, unit: 'pz' })),
  { key: 'car', group: 'car', label: { item: 'car' }, unit: 'pz' },
  { key: 'sling', group: 'car', label: { item: 'sling' }, unit: 'pz' },
  { key: 'cw', group: 'car', label: { item: 'cw' }, unit: 'kg' },
];

const BY_KEY = new Map(PRICE_ARTICLES.map((a) => [a.key, a]));
export const priceArticle = (key: string): PriceArticle | undefined => BY_KEY.get(key);
export const isPriceKey = (key: string): boolean => BY_KEY.has(key);
