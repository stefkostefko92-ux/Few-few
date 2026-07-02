"use server";

import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { rateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { CONSENT_CLAUSE_16M } from "@/lib/billing";
import { createCheckoutSession, createPortalSession } from "@/lib/billing-server";

export type BillingResult = { url?: string; error?: string };

// Стартира Checkout за премиум абонамент. Скоуп MANAGER. Връща URL към Stripe
// (клиентът пренасочва). Достъпът НЕ се дава тук — само през webhook.
//
// `consent` е изричното съгласие по чл. 16, б. „м" (загуба на 14-дневното право
// на отказ). Проверява се ТУК на сървъра — disabled бутонът в UI е само UX и не
// бива да е единствената защита. Доказателството се записва в одит лога ПРЕДИ да
// създадем Checkout сесията.
export async function startCheckoutAction(
  slug: string,
  consent: boolean,
): Promise<BillingResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const site = found.site;
  if (site.premium) return { error: "Сайтът вече е премиум." };

  // чл. 16(м): без изрично съгласие НЕ стартираме доставка на дигиталната услуга.
  // Сървърна проверка — не разчитаме на disabled бутона от браузъра.
  if (consent !== true) {
    return {
      error:
        "За да продължите, трябва изрично да се съгласите (чл. 16, б. „м“) — " +
        "услугата започва веднага и 14-дневното право на отказ отпада.",
    };
  }

  // Лимит: пази от спам създаване на сесии.
  if (!rateLimit(`checkout:${user.id}`, 10, 60_000)) {
    return { error: "Твърде много опити. Опитайте след минута." };
  }

  // Доказателство за съгласието ПРЕДИ Checkout: дословен текст на клаузата +
  // кой + за кой сайт + кога. Пази се в тампер-евидентния AuditLog (без нови
  // колони в schema.prisma). Ако одитът падне, logAudit не хвърля — но записът
  // е задължителната следа, че съгласието е дадено информирано.
  await logAudit(user, {
    action: "CREATE",
    entity: "Consent",
    entityId: site.id,
    summary:
      `Съгласие по чл. 16, б. „м“ (загуба на право на отказ) | siteId=${site.id} ` +
      `(„${site.name}“) | потребител=${user.email} | момент=${new Date().toISOString()} ` +
      `| текст: „${CONSENT_CLAUSE_16M}“`,
  });

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
