import type Stripe from "stripe";

/**
 * Defensive accessors for Stripe fields that move between API versions (the
 * 2025 versions relocated `invoice.subscription` and `subscription.
 * current_period_end`). We read through `unknown` and probe known paths so a
 * Stripe SDK bump doesn't break the build, while staying `any`-free (§7.3).
 */

function get(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

/** Subscription id referenced by an invoice, across API versions. */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const direct = get(invoice, "subscription");
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") {
    const id = get(direct, "id");
    if (typeof id === "string") return id;
  }
  // 2025+: invoice.parent.subscription_details.subscription
  const parent = get(invoice, "parent");
  const details = get(parent, "subscription_details");
  const sub = get(details, "subscription");
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object") {
    const id = get(sub, "id");
    if (typeof id === "string") return id;
  }
  return undefined;
}

/**
 * Current period end (epoch seconds) for a subscription, across API versions,
 * or null if it cannot be determined. Callers must fail closed rather than
 * fabricate a period — otherwise a Stripe shape drift would silently extend
 * every VIP entitlement.
 */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const direct = get(sub, "current_period_end");
  if (typeof direct === "number") return direct;
  // 2025+: moved onto each item.
  const items = get(sub, "items");
  const data = get(items, "data");
  if (Array.isArray(data) && data.length > 0) {
    const cpe = get(data[0], "current_period_end");
    if (typeof cpe === "number") return cpe;
  }
  return null;
}
