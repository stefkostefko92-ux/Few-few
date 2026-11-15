// Customer Portal с конфигурация от кода (ядро: пари/ДДС). Без `configuration`
// sessions.create ползва Dashboard настройката: ако там е разрешен `tax_id`,
// клиентът добавя номер, който е `pending` при подновяване, а Stripe Tax
// прилага обратно начисляване по ФОРМАТА (docs.stripe.com/billing/customer/tax-ids)
// → 0% ДДС без VIES. Затова конфигурацията е наша: customer_update БЕЗ tax_id.
// Създава се веднъж: metadata маркер (по текущите Price ID-та) + idempotency
// key + кеш в процеса. Всеки id — от кеша, от list или от create (Stripe пази
// idempotent отговора 24 ч и може да върне вече пипнат обект) — минава една и
// съща проверка преди употреба. Адаптерът към Stripe: billing-portal-stripe.ts.
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';

export const PORTAL_METADATA_KEY = 'linketto_portal';

/** Клиентът може да сменя тези данни в портала — tax_id НИКОГА. */
export const PORTAL_ALLOWED_CUSTOMER_UPDATES = ['address', 'email', 'name', 'phone'] as const;

export interface PortalConfigView {
  id: string;
  active: boolean;
  metadata: Readonly<Record<string, string>> | null;
  features: { customer_update: { enabled: boolean; allowed_updates: readonly string[] } };
}

export interface PortalProduct {
  product: string;
  prices: string[];
}

export interface PortalPorts {
  listActiveConfigurations(): Promise<PortalConfigView[]>;
  createConfiguration(
    params: Stripe.BillingPortal.ConfigurationCreateParams,
    idempotencyKey: string,
  ): Promise<PortalConfigView>;
  retrieveConfiguration(id: string): Promise<PortalConfigView>;
  priceProduct(priceId: string): Promise<{ product: string; recurring: boolean }>;
}

/** Кеш в процеса: маркерът и id-то на конфигурацията за него. */
export interface PortalConfigCache {
  marker: string | null;
  id: string | null;
}

export function portalAllowsTaxId(cfg: PortalConfigView): boolean {
  return cfg.features.customer_update.enabled && cfg.features.customer_update.allowed_updates.includes('tax_id');
}

/** Годна за портала: активна, с нашия маркер и без редакция на tax_id. */
export function isUsablePortalConfig(cfg: PortalConfigView, marker: string): boolean {
  return cfg.active && cfg.metadata?.[PORTAL_METADATA_KEY] === marker && !portalAllowsTaxId(cfg);
}

/** Детерминиран маркер: версия + хеш на сортираните уникални Price ID-та. */
export function portalConfigMarker(priceIds: readonly string[]): string {
  const sorted = [...new Set(priceIds)].sort();
  return `v1-${createHash('sha256').update(sorted.join(',')).digest('hex').slice(0, 16)}`;
}

export function portalConfigurationParams(
  products: readonly PortalProduct[],
  marker: string,
): Stripe.BillingPortal.ConfigurationCreateParams {
  return {
    features: {
      customer_update: { enabled: true, allowed_updates: [...PORTAL_ALLOWED_CUSTOMER_UPDATES] },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      // Лесен отказ от авто-подновяване (Дир. 2011/83): до края на периода.
      subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
      subscription_update:
        products.length > 0
          ? {
              enabled: true,
              default_allowed_updates: ['price'],
              products: products.map((p) => ({ product: p.product, prices: [...p.prices] })),
              proration_behavior: 'create_prorations',
            }
          : { enabled: false },
    },
    metadata: { [PORTAL_METADATA_KEY]: marker },
  };
}

/** Абонаментните цени, групирани по продукт (еднократните се прескачат). */
async function portalProducts(priceIds: readonly string[], ports: PortalPorts): Promise<PortalProduct[]> {
  const byProduct = new Map<string, string[]>();
  for (const priceId of [...new Set(priceIds)].sort()) {
    const { product, recurring } = await ports.priceProduct(priceId);
    if (!recurring) continue;
    byProduct.set(product, [...(byProduct.get(product) ?? []), priceId]);
  }
  return [...byProduct.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([product, prices]) => ({ product, prices }));
}

/**
 * Id на нашата конфигурация: кеш (преизпитан срещу Stripe) → активна с текущия
 * маркер и без tax_id → нова (idempotency key по маркера — паралелни първи
 * отваряния дават една). И новата минава проверката: idempotent отговор отпреди
 * пипане в Dashboard → грешка. Грешка от Stripe се пропагира (fail-closed —
 * без портал с Dashboard настройка).
 */
export async function ensurePortalConfiguration(
  ports: PortalPorts,
  subscriptionPriceIds: readonly string[],
  cache: PortalConfigCache,
): Promise<string> {
  const marker = portalConfigMarker(subscriptionPriceIds);
  const cachedId = cache.marker === marker ? cache.id : null;
  cache.marker = null;
  cache.id = null;
  if (cachedId && isUsablePortalConfig(await ports.retrieveConfiguration(cachedId), marker)) {
    cache.marker = marker;
    cache.id = cachedId;
    return cachedId;
  }
  const config =
    (await ports.listActiveConfigurations()).find((c) => isUsablePortalConfig(c, marker)) ??
    (await ports.createConfiguration(
      portalConfigurationParams(await portalProducts(subscriptionPriceIds, ports), marker),
      `linketto-portal-config-${marker}`,
    ));
  if (!isUsablePortalConfig(config, marker)) {
    throw new Error(`Customer Portal: конфигурацията ${config.id} не е активна наша без tax_id — порталът не се отваря`);
  }
  cache.marker = marker;
  cache.id = config.id;
  return config.id;
}

export function portalSessionParams(input: {
  customerId: string;
  configurationId: string;
  returnUrl: string;
}): Stripe.BillingPortal.SessionCreateParams {
  return {
    customer: input.customerId,
    configuration: input.configurationId,
    return_url: input.returnUrl,
  };
}
