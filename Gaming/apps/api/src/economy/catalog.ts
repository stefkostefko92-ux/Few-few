import { prisma, type Product } from "@aso/db";
import type { ProductView, VipTier } from "@aso/shared";

/**
 * НАЧАЛЕН каталог (seed). Източникът на истината е таблицата `Product` —
 * админ редакторът я управлява (цена, награда, активност, нови SKU). Този
 * списък само създава липсващите редове при първо пускане (`seedProducts`) и
 * дава показваното заглавие за познатите SKU. Никога не се ползва за цена
 * или начисляване. Чиповете са виртуални и никога не се обменят в пари.
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

const SEED_BY_SKU = new Map(CATALOG.map((p) => [p.sku, p]));

/** Seed запис по SKU (само за заглавие/seed — НЕ за цена или награда). */
export const productBySku = (sku: string): ProductView | undefined => SEED_BY_SKU.get(sku);

/**
 * VIP нивото на абонаментен SKU: `vip_gold`, `vip_gold_promo` → GOLD. Нов VIP
 * SKU от админа трябва да започва с `vip_<ниво>`, иначе checkout го отказва
 * (fail closed — без ниво webhook-ът не знае какво да даде).
 */
export function vipTierForSku(sku: string): Exclude<VipTier, "NONE"> | undefined {
  const m = /^vip_(bronze|silver|gold|platinum)(?:_|$)/i.exec(sku);
  return m ? (m[1]!.toUpperCase() as Exclude<VipTier, "NONE">) : undefined;
}

/** Ред от `Product` → изгледът, който клиентът вижда. */
export function toProductView(row: Pick<Product, "sku" | "kind" | "priceCents" | "gems" | "chips" | "cosmeticId">): ProductView {
  const seed = SEED_BY_SKU.get(row.sku);
  const view: ProductView = {
    sku: row.sku,
    kind: row.kind,
    title: seed?.title ?? row.sku,
    priceCents: row.priceCents,
  };
  if (row.gems) view.grantGems = row.gems;
  if (row.chips) view.grantChips = row.chips;
  if (row.cosmeticId) view.cosmeticId = row.cosmeticId;
  if (row.kind === "VIP_SUB") {
    const tier = vipTierForSku(row.sku);
    if (tier) view.vipTier = tier;
  }
  return view;
}

/** Публичният каталог: само активните продукти от таблицата `Product`. */
export async function listActiveProducts(): Promise<ProductView[]> {
  const rows = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ kind: "asc" }, { priceCents: "asc" }],
  });
  return rows.map(toProductView);
}
