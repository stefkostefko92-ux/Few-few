import { prisma, type VipTier } from "@aso/db";
import { credit } from "@aso/db/ledger";
import { logger } from "../logger.js";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Какво точно е платено — снимка, взета от реда в `Product` при създаването
 * на Checkout сесията и записана в нейните metadata (задава ги само сървърът
 * със secret ключа; клиентът не може да ги промени). Така редакция в админа
 * между плащането и webhook-а не променя вече платената покупка.
 */
export interface GrantSnapshot {
  kind: string;
  gems: number;
  chips: number;
  cosmeticId: string | null;
}

/** Снимката от metadata на сесията или `null`, ако сесията е отпреди снимките. */
export function snapshotFromMetadata(md: Record<string, string> | null | undefined): GrantSnapshot | null {
  if (!md || md.snap !== "1" || !md.kind) return null;
  const n = (v: string | undefined) => {
    const x = Number(v ?? "0");
    return Number.isSafeInteger(x) && x > 0 ? x : 0;
  };
  return { kind: md.kind, gems: n(md.gems), chips: n(md.chips), cosmeticId: md.cosmeticId || null };
}

/**
 * Прилага платения продукт към играча. Вика се САМО от Stripe webhook-а (§11.3)
 * — никога от success redirect. Идемпотентността е на викащия (ProcessedEvent);
 * работи в същата транзакция, така че кредит + маркерът се записват атомарно.
 *
 * Източник: снимката от сесията, иначе редът в `Product` по SKU. НЕ зависи от
 * `active` — вече платена поръчка се начислява и ако продуктът е деактивиран.
 *
 * Връща реално начисленото (записва се в Purchase за бъдещ clawback) или `null`,
 * ако нищо не е дадено. Всеки кредит оставя ред PURCHASE в регистъра (`refId`).
 */
export async function grantProduct(
  tx: Tx,
  userId: string,
  sku: string,
  snapshot?: GrantSnapshot | null,
  refId?: string,
): Promise<{ gems: number; chips: number; cosmeticId: string | null } | null> {
  // Липсващ или изтрит (GDPR) акаунт: не хвърляме — иначе webhook-ът връща 500 и Stripe
  // повтаря безкрайно. Логваме за ръчно възстановяване на сумата.
  const owner = await tx.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
  if (!owner || owner.deletedAt) {
    logger.error({ sku, userId }, "grantProduct: user missing or erased — manual refund review");
    return null;
  }

  let spec = snapshot ?? null;
  if (!spec) {
    const row = await tx.product.findUnique({ where: { sku } });
    if (!row) {
      // Платено, но без продукт и без снимка — не измисляме награда; шумно в лога
      // за ръчна обработка (възстановяване/рефънд).
      logger.error({ sku, userId }, "grantProduct: unknown sku and no snapshot — manual review");
      return null;
    }
    spec = { kind: row.kind, gems: row.gems ?? 0, chips: row.chips ?? 0, cosmeticId: row.cosmeticId };
  }

  // VIP е абонамент: дава се от invoice.paid с РЕАЛНИЯ период от Stripe, не тук.
  if (spec.kind === "VIP_SUB") {
    logger.warn({ sku, userId }, "grantProduct: VIP sku in one-time path — ignored (granted via invoice.paid)");
    return null;
  }

  await credit(tx, userId, "GEMS", spec.gems, "PURCHASE", refId ?? null);
  await credit(tx, userId, "CHIPS", spec.chips, "PURCHASE", refId ?? null);
  if (spec.cosmeticId) {
    await tx.inventoryItem.upsert({
      where: { userId_cosmeticId: { userId, cosmeticId: spec.cosmeticId } },
      create: { userId, cosmeticId: spec.cosmeticId },
      update: {},
    });
  }
  return { gems: spec.gems, chips: spec.chips, cosmeticId: spec.cosmeticId };
}

/**
 * Credit the monthly VIP gem stipend (SILVER+). Called once per paid invoice
 * from the webhook, inside its dedup transaction, so renewals grant gems but
 * retries do not double-credit. Ред VIP_STIPEND в регистъра (refId = invoice).
 */
export async function grantVipStipend(
  tx: Tx,
  userId: string,
  gems: number,
  refId?: string,
): Promise<void> {
  await credit(tx, userId, "GEMS", gems, "VIP_STIPEND", refId ?? null);
}

/** Set / extend a VIP subscription (from subscription webhooks). */
export async function applyVip(
  tx: Tx,
  userId: string,
  tier: VipTier,
  until: Date,
): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { vipTier: tier, vipUntil: until } });
}

/** Clear VIP (subscription cancelled/expired). */
export async function clearVip(
  tx: Tx,
  userId: string,
): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { vipTier: "NONE", vipUntil: null } });
}
