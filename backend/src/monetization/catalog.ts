import { z } from "zod";
import type { Currency } from "../domain/types.js";

/**
 * IAP product catalog (GDD §8.2). Maps a store product id to the currencies it
 * grants. Like the rest of the economy these amounts are LiveOps-tunable; the
 * server is the source of truth for what a purchase yields, never the client.
 */

export type ProductKind = "spins" | "coins" | "gems" | "bundle";

const grantSchema = z
  .object({
    spins: z.number().int().nonnegative().optional(),
    coins: z.number().int().nonnegative().optional(),
    spiritTokens: z.number().int().nonnegative().optional(),
    gems: z.number().int().nonnegative().optional(),
  })
  .strict();

export type Grant = Partial<Record<Currency, number>>;

export const productSchema = z
  .object({
    productId: z.string().min(1),
    kind: z.enum(["spins", "coins", "gems", "bundle"]),
    priceEUR: z.number().positive(),
    grants: grantSchema,
    oneTime: z.boolean().default(false),
  })
  .strict();

export type Product = z.infer<typeof productSchema>;

export const catalogSchema = z.array(productSchema);

/** Default catalog — amounts illustrative, price points from GDD §8.2. */
export const defaultCatalog: Product[] = catalogSchema.parse([
  { productId: "spin_s", kind: "spins", priceEUR: 1.99, grants: { spins: 60 } },
  { productId: "spin_m", kind: "spins", priceEUR: 4.99, grants: { spins: 180 } },
  { productId: "spin_l", kind: "spins", priceEUR: 19.99, grants: { spins: 900 } },
  { productId: "spin_xl", kind: "spins", priceEUR: 99.99, grants: { spins: 5200 } },
  { productId: "coin_s", kind: "coins", priceEUR: 2.99, grants: { coins: 40_000 } },
  { productId: "coin_l", kind: "coins", priceEUR: 49.99, grants: { coins: 900_000 } },
  { productId: "gem_s", kind: "gems", priceEUR: 0.99, grants: { gems: 80 } },
  { productId: "gem_l", kind: "gems", priceEUR: 99.99, grants: { gems: 12_000 } },
  {
    productId: "starter_bundle",
    kind: "bundle",
    priceEUR: 4.99,
    oneTime: true,
    grants: { spins: 120, coins: 25_000, gems: 200 },
  },
  {
    productId: "spirit_bundle",
    kind: "bundle",
    priceEUR: 19.99,
    grants: { spiritTokens: 110, gems: 100 },
  },
]);

export class Catalog {
  private readonly byId: Map<string, Product>;

  constructor(products: Product[] = defaultCatalog) {
    this.byId = new Map(products.map((p) => [p.productId, p]));
  }

  list(): Product[] {
    return [...this.byId.values()];
  }

  get(productId: string): Product | undefined {
    return this.byId.get(productId);
  }
}
