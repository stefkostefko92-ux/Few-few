"use server";

import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { rateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { createCheckoutSession, createPortalSession } from "@/lib/billing-server";

export type BillingResult = { url?: string; error?: string };

// Стартира Checkout за премиум абонамент. Скоуп MANAGER. Връща URL към Stripe
// (клиентът пренасочва). Достъпът НЕ се дава тук — само през webhook.
export async function startCheckoutAction(slug: string): Promise<BillingResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  // Лимит: пази от спам създаване на сесии.
  if (!rateLimit(`checkout:${user.id}`, 10, 60_000)) {
    return { error: "Твърде много опити. Опитайте след минута." };
  }

  const site = found.site;
  if (site.premium) return { error: "Сайтът вече е премиум." };

  const res = await createCheckoutSession(
    {
      id: site.id,
      name: site.name,
      slug: site.slug,
      stripeCustomerId: site.stripeCustomerId,
    },
    user.email,
  );
  if ("error" in res) return { error: res.error };

  await logAudit(user, {
    action: "UPDATE",
    entity: "Site",
    entityId: site.id,
    summary: `Билинг: стартиран Checkout за премиум на „${site.name}"`,
  });
  return { url: res.url };
}

// Отваря Customer Portal (управление на абонамента). Скоуп MANAGER.
export async function openPortalAction(slug: string): Promise<BillingResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const site = found.site;
  if (!site.stripeCustomerId) {
    return { error: "Все още няма абонамент за управление." };
  }

  const res = await createPortalSession({
    slug: site.slug,
    stripeCustomerId: site.stripeCustomerId,
  });
  if ("error" in res) return { error: res.error };
  return { url: res.url };
}
