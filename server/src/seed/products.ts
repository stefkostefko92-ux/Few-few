/**
 * Microtransaction catalog. Currency-of-record is USD cents.
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
    effects: { name_change: true },
  },
  {
    kind: 'gems_starter',
    name: 'Pouch of Gems',
    tagline: '250 gems',
    description: 'A small handful of gems for guild upgrades and convenience purchases.',
    price_cents: 199,
    effects: { gems: 250 },
  },
  {
    kind: 'gems_pouch',
    name: 'Velvet Pouch',
    tagline: '700 gems · +75 bonus',
    description: '700 gems including a 75-gem bonus for upgrading to this tier.',
    price_cents: 499,
    popular: true,
    effects: { gems: 775 },
  },
  {
    kind: 'gems_chest',
    name: 'Ironbound Chest',
    tagline: '1,500 gems · +250 bonus',
    description: 'A substantial chest. Enough to push a mid-tier guild over the wall to L4.',
    price_cents: 999,
    effects: { gems: 1750 },
  },
  {
    kind: 'gems_hoard',
    name: 'Sovereign Hoard',
    tagline: '3,500 gems · +800 bonus',
    description: 'The merchant blanches at the size of it. Enough to power any guild to its zenith.',
    price_cents: 1999,
    best_value: true,
    effects: { gems: 4300 },
  },
  {
    kind: 'gems_treasury',
    name: 'Imperial Treasury',
    tagline: '8,000 gems · +2,500 bonus',
    description: 'Reserved for the truly committed. For collectors and guild bankers.',
    price_cents: 3999,
    effects: { gems: 10500 },
  },
];

export function findProduct(kind: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.kind === kind);
}
