// Stripe адаптер на PortalPorts (без server-only — тества се с mock клиент в
// __tests__/billing-portal.test.ts). Решенията са в billing-portal.ts.
import type Stripe from 'stripe';
import type { PortalConfigView, PortalPorts } from './billing-portal';

/** Минималната част от Stripe клиента, която ползваме (реалният я покрива). */
export interface PortalStripeClient {
  billingPortal: {
    configurations: {
      list(params: { active: true; limit: number }): AsyncIterable<PortalConfigView>;
      create(
        params: Stripe.BillingPortal.ConfigurationCreateParams,
        options: { idempotencyKey: string },
      ): PromiseLike<PortalConfigView>;
      retrieve(id: string): PromiseLike<PortalConfigView>;
    };
  };
  prices: {
    retrieve(id: string): PromiseLike<{ product: string | { id: string }; recurring: unknown }>;
  };
}

/** Само полетата, които проверяваме (active, маркер, customer_update). */
function toView(c: PortalConfigView): PortalConfigView {
  return {
    id: c.id,
    active: c.active,
    metadata: c.metadata,
    features: {
      customer_update: {
        enabled: c.features.customer_update.enabled,
        allowed_updates: [...c.features.customer_update.allowed_updates],
      },
    },
  };
}

export function createPortalStripePorts(stripe: PortalStripeClient): PortalPorts {
  return {
    async listActiveConfigurations() {
      const configs: PortalConfigView[] = [];
      for await (const c of stripe.billingPortal.configurations.list({ active: true, limit: 100 })) {
        configs.push(toView(c));
      }
      return configs;
    },
    async createConfiguration(params, idempotencyKey) {
      return toView(await stripe.billingPortal.configurations.create(params, { idempotencyKey }));
    },
    async retrieveConfiguration(id) {
      return toView(await stripe.billingPortal.configurations.retrieve(id));
    },
    async priceProduct(priceId) {
      const price = await stripe.prices.retrieve(priceId);
      const product = typeof price.product === 'string' ? price.product : price.product.id;
      return { product, recurring: price.recurring != null };
    },
  };
}
