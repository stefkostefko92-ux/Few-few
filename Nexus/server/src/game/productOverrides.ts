/**
 * Замени на продуктите в магазина (цена / включен-изключен) от админ панела.
 *
 * Каталогът остава в кода (seed/products.ts — ефектите и текстовете не са
 * данни за редакция); заменят се САМО цената и видимостта. Пазят се в общата
 * таблица `settings` под ключ `product:<kind>` (JSON), извън SETTINGS_CATALOG
 * — затова не се виждат на екрана „Настройки", а само в „Магазин".
 *
 * Паричен инвариант: цените са ЦЕЛИ евроцентове (без float); границите са
 * [PRODUCT_MIN_CENTS, PRODUCT_MAX_CENTS]. Промяната важи за НОВИ поръчки —
 * вече създадените пазят своя amount_cents.
 */
import { getDb } from '../db';
import { PRODUCTS, type ProductDef } from '../seed/products';

type Db = ReturnType<typeof getDb>;

/** Stripe не приема плащане под 0,50 €; таванът пази от грешно въведена сума. */
export const PRODUCT_MIN_CENTS = 50;
export const PRODUCT_MAX_CENTS = 100_000;

export interface ProductOverride {
  price_cents?: number;
  enabled?: boolean;
}

export interface EffectiveProduct extends ProductDef {
  enabled: boolean;
  base_price_cents: number;
  overridden: boolean;
}

const keyFor = (kind: string) => `product:${kind}`;

function parse(raw: string | undefined): ProductOverride {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as ProductOverride;
    const out: ProductOverride = {};
    if (Number.isInteger(o.price_cents) && (o.price_cents as number) >= PRODUCT_MIN_CENTS && (o.price_cents as number) <= PRODUCT_MAX_CENTS) out.price_cents = o.price_cents;
    if (typeof o.enabled === 'boolean') out.enabled = o.enabled;
    return out;
  } catch {
    return {}; // повредена замяна → каталогът по подразбиране (fail-safe)
  }
}

export function getProductOverride(kind: string, db: Db = getDb()): ProductOverride {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyFor(kind)) as { value: string } | undefined;
  return parse(row?.value);
}

/** Целият каталог с приложени замени (вкл. изключените — за админ панела). */
export function effectiveProducts(db: Db = getDb()): EffectiveProduct[] {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'product:%'").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, parse(r.value)]));
  return PRODUCTS.map((p) => {
    const o = map.get(keyFor(p.kind)) || {};
    return {
      ...p,
      price_cents: o.price_cents ?? p.price_cents,
      base_price_cents: p.price_cents,
      enabled: o.enabled ?? true,
      overridden: o.price_cents !== undefined || o.enabled !== undefined,
    };
  });
}

/** Продукт за покупка: само включен, с текущата цена. */
export function findPurchasableProduct(kind: string, db: Db = getDb()): EffectiveProduct | undefined {
  return effectiveProducts(db).find((p) => p.kind === kind && p.enabled);
}

/** Записва замяната (празна = изтрива реда → каталогът по подразбиране). */
export function setProductOverride(kind: string, o: ProductOverride, byUser: number | null, db: Db = getDb()): void {
  const clean: ProductOverride = {};
  if (o.price_cents !== undefined) clean.price_cents = o.price_cents;
  if (o.enabled !== undefined) clean.enabled = o.enabled;
  if (!Object.keys(clean).length) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(keyFor(kind));
    return;
  }
  db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(keyFor(kind), JSON.stringify(clean), Date.now(), byUser);
}
