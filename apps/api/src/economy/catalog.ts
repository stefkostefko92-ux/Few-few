import type { ProductView } from "@aso/shared";

/**
 * Product catalog. Prices/SKUs mirror what exists in Stripe (§11.3); in real
 * deployment the authoritative amount comes from the Stripe price, this is the
 * display + grant mapping. Chips bought here are virtual and never cashed out.
 */
export const CATALOG: ProductView[] = [
  { sku: "gems_small", kind: "GEMS", title: "Шепа скъпоценни камъни", priceCents: 199, grantGems: 100 },
  { sku: "gems_medium", kind: "GEMS", title: "Кесия скъпоценни камъни", priceCents: 499, grantGems: 300 },
  { sku: "gems_large", kind: "GEMS", title: "Сандък скъпоценни камъни", priceCents: 999, grantGems: 700 },
  { sku: "chips_small", kind: "CHIP_PACK", title: "Купчина чипове", priceCents: 199, grantChips: 5000 },
  { sku: "chips_large", kind: "CHIP_PACK", title: "Камара чипове", priceCents: 699, grantChips: 25000 },
  { sku: "vip_bronze", kind: "VIP_SUB", title: "VIP Bronze", priceCents: 399, vipTier: "BRONZE" },
  { sku: "vip_silver", kind: "VIP_SUB", title: "VIP Silver", priceCents: 499, vipTier: "SILVER" },
  { sku: "vip_gold", kind: "VIP_SUB", title: "VIP Gold", priceCents: 999, vipTier: "GOLD" },
  { sku: "vip_platinum", kind: "VIP_SUB", title: "VIP Platinum", priceCents: 1999, vipTier: "PLATINUM" },
];

const BY_SKU = new Map(CATALOG.map((p) => [p.sku, p]));

export const productBySku = (sku: string): ProductView | undefined => BY_SKU.get(sku);
