/**
 * Microtransaction catalog. Currency-of-record is EUR cents.
 *
 * `effects` describes what the purchase grants when the payment completes.
 * The free-to-play game does not depend on these — every progression path
 * is also earnable through gameplay (gems trickle from level-ups, dungeon
 * clears, and daily rewards). These products simply accelerate things.
 */

export interface ProductDef {
  kind: string;
  name: string;
  tagline: string;
  description: string;
  price_cents: number;
  currency: string;
  popular?: boolean;
  best_value?: boolean;
  effects: {
    gems?: number;
    name_change?: boolean;
    rest?: boolean;
    energy_refill?: number;
  };
}

export const PRODUCTS: ProductDef[] = [
  {
    kind: 'name_change',
    name: 'Royal Decree of Renaming',
    tagline: 'Skip the gold cost and cooldown.',
    description:
      'Instantly rename your hero — bypass the 250-gold + 24h in-game cooldown system.',
    price_cents: 199,
    currency: 'eur',
    effects: { name_change: true },
  },
  {
    kind: 'gems_starter',
    name: 'Pouch of Gems',
    tagline: '250 gems',
    description: 'A small handful of gems for guild upgrades and convenience purchases.',
    price_cents: 199,
    currency: 'eur',
    effects: { gems: 250 },
  },
  {
    kind: 'gems_pouch',
    name: 'Velvet Pouch',
    tagline: '775 gems',
    description: '700 gems including a 75-gem bonus for upgrading to this tier.',
    price_cents: 499,
    currency: 'eur',
    popular: true,
    effects: { gems: 775 },
  },
  {
    kind: 'gems_chest',
    name: 'Ironbound Chest',
    tagline: '1,750 gems',
    description: 'A substantial chest. Enough to push a mid-tier guild over the wall to L4.',
    price_cents: 999,
    currency: 'eur',
    effects: { gems: 1750 },
  },
  {
    kind: 'gems_hoard',
    name: 'Sovereign Hoard',
    tagline: '4,300 gems',
    description: 'Enough to power any guild to its zenith.',
    price_cents: 1999,
    currency: 'eur',
    best_value: true,
    effects: { gems: 4300 },
  },
  {
    kind: 'gems_treasury',
    name: 'Imperial Treasury',
    tagline: '10,500 gems',
    description: 'Reserved for collectors and guild bankers.',
    price_cents: 3999,
    currency: 'eur',
    effects: { gems: 10500 },
  },
];

export function findProduct(kind: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.kind === kind);
}
