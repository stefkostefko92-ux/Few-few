import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, premiumPriceId } from "@/lib/stripe";
import { mapStripeStatus, isPremiumStatus, type StripeSubStatus } from "@/lib/billing";
import { logAudit } from "@/lib/audit";

// Базов URL на панела (за success/cancel/return адреси). Без наклонена черта.
function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

// Осигурява Stripe Customer за сайта (пази cus_… в Site, за да не дублираме
// клиенти при всяко плащане). Ползва Idempotency-Key при създаване.
async function ensureCustomer(
  stripe: Stripe,
  site: { id: string; name: string; slug: string; stripeCustomerId: string | null },
  contactEmail: string,
): Promise<string> {
  if (site.stripeCustomerId) return site.stripeCustomerId;
  const customer = await stripe.customers.create(
    {
      email: contactEmail,
      name: site.name,
      // metadata.siteId е нашата връзка обратно към сайта във webhook-а.
      metadata: { siteId: site.id, siteSlug: site.slug },
    },
    { idempotencyKey: `customer:${site.id}` },
  );
  await prisma.site.update({
    where: { id: site.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

// Създава Checkout Session за месечния премиум абонамент. Цената идва от
// STRIPE_PRICE_ID (Stripe), НИКОГА от клиента. Достъпът НЕ се дава тук — само
// през webhook-а. success_url е чист UX.
export async function createCheckoutSession(
  site: { id: string; name: string; slug: string; stripeCustomerId: string | null },
  contactEmail: string,
): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe();
  if (!stripe) return { error: "Билингът не е настроен (липсва STRIPE_SECRET_KEY)." };
  const price = premiumPriceId();
  if (!price) return { error: "Липсва STRIPE_PRICE_ID (премиум план)." };

  try {
    const customerId = await ensureCustomer(stripe, site, contactEmail);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        // ДДС по местоназначение (изисква включен Stripe Tax в акаунта).
        automatic_tax: { enabled: true },
        customer_update: { address: "auto" },
        billing_address_collection: "required",
        // Право на отказ при дигитални услуги — съгласието се събира с отделна
        // отметка в UI преди този бутон (виж billing страницата).
        subscription_data: {
          metadata: { siteId: site.id, siteSlug: site.slug },
        },
        // Връзка обратно към сайта (webhook-ът чете client_reference_id/metadata).
        client_reference_id: site.id,
        metadata: { siteId: site.id, siteSlug: site.slug },
        success_url: `${baseUrl()}/dashboard/sites/${site.slug}/billing?checkout=success`,
        cancel_url: `${baseUrl()}/dashboard/sites/${site.slug}/billing?checkout=cancel`,
      },
      // Idempotency-Key: детерминистичен в 60-секунден прозорец. Пази от дубли
      // при мрежов ретрай/двоен клик (една сесия на сайт в прозореца), но пуска
      // нова сесия след прозореца (напр. след отказ и повторен опит по-късно).
      { idempotencyKey: `checkout:${site.id}:${Math.floor(Date.now() / 60_000)}` },
    );
    if (!session.url) return { error: "Stripe не върна адрес за плащане." };
    return { url: session.url };
  } catch (err) {
    console.error("Stripe checkout: грешка", err);
    return { error: "Неуспешно създаване на плащане. Опитайте пак." };
  }
}

// Създава сесия за Customer Portal (смяна на карта, отказ, фактури).
export async function createPortalSession(
  site: { slug: string; stripeCustomerId: string | null },
): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe();
  if (!stripe) return { error: "Билингът не е настроен (липсва STRIPE_SECRET_KEY)." };
  if (!site.stripeCustomerId) return { error: "Няма Stripe клиент за този сайт." };
  try {
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: site.stripeCustomerId,
        return_url: `${baseUrl()}/dashboard/sites/${site.slug}/billing`,
      },
      // Idempotency-Key: детерминистичен в 60-секунден прозорец — дедуп при
      // ретрай/двоен клик, но не блокира последващи легитимни отваряния.
      { idempotencyKey: `portal:${site.stripeCustomerId}:${Math.floor(Date.now() / 60_000)}` },
    );
    return { url: session.url };
  } catch (err) {
    console.error("Stripe portal: грешка", err);
    return { error: "Неуспешно отваряне на управлението. Опитайте пак." };
  }
}

// -------- Прилагане на webhook събитие (идемпотентно) --------

// Извлича полетата от subscription, нужни за огледалото в базата.
function subFields(sub: Stripe.Subscription) {
  const status = mapStripeStatus(sub.status as StripeSubStatus);
  // current_period_end е UNIX секунди; при по-новите версии полето може да е на
  // ниво item — четем и от двете места, за да сме стабилни.
  const periodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end ??
    null;
  return {
    stripeSubscriptionId: sub.id,
    billingStatus: status,
    premium: isPremiumStatus(status),
    planRenewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
  };
}

// Записва обработката на event.id И бизнес-ефекта в ЕДНА транзакция. Ако
// event.id вече е обработен → връща false (дубликат, пропусни). Търси сайта по
// customerId; иначе по metadata.siteId (fallback).
async function applyOnce(
  eventId: string,
  eventType: string,
  customerId: string | null,
  siteIdHint: string | null,
  data: {
    stripeSubscriptionId?: string | null;
    billingStatus: import("@/lib/billing").BillingStatus;
    premium: boolean;
    planRenewsAt?: Date | null;
  },
): Promise<{ applied: boolean; siteId: string | null }> {
  return prisma.$transaction(async (tx) => {
    // Идемпотентност: ако вече е записано това събитие, спираме.
    const seen = await tx.webhookEvent.findUnique({ where: { id: eventId } });
    if (seen) return { applied: false, siteId: null };

    // Намери сайта: първо по Stripe customer, после по metadata hint.
    let site =
      customerId != null
        ? await tx.site.findUnique({ where: { stripeCustomerId: customerId } })
        : null;
    if (!site && siteIdHint) {
      site = await tx.site.findUnique({ where: { id: siteIdHint } });
    }

    // Записът за обработка се прави ВИНАГИ (дори без сайт), за да не ретраим вечно.
    await tx.webhookEvent.create({ data: { id: eventId, type: eventType } });
    if (!site) return { applied: true, siteId: null };

    await tx.site.update({
      where: { id: site.id },
      data: {
        billingStatus: data.billingStatus,
        premium: data.premium,
        ...(data.stripeSubscriptionId !== undefined
          ? { stripeSubscriptionId: data.stripeSubscriptionId }
          : {}),
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...(data.planRenewsAt !== undefined ? { planRenewsAt: data.planRenewsAt } : {}),
      },
    });
    return { applied: true, siteId: site.id };
  });
}

// Обработва едно проверено Stripe събитие. Достъпът (Site.premium) се дава ТУК,
// не в success_url. Идемпотентно по event.id.
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const stripe = getStripe();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const siteIdHint =
        (session.metadata?.siteId as string | undefined) ?? session.client_reference_id ?? null;
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      // Изтегли абонамента за реалния статус/период (не се доверяваме на нищо
      // от клиента). Ако Stripe клиентът липсва (тест), падаме на ACTIVE.
      if (subId && stripe) {
        const sub = await stripe.subscriptions.retrieve(subId);
        const f = subFields(sub);
        const res = await applyOnce(event.id, event.type, customerId, siteIdHint, f);
        if (res.applied && res.siteId) {
          await logAudit(null, {
            action: "UPDATE",
            entity: "Site",
            entityId: res.siteId,
            summary: `Билинг: активиран премиум (checkout.session.completed)`,
          });
        }
      } else {
        await applyOnce(event.id, event.type, customerId, siteIdHint, {
          stripeSubscriptionId: subId,
          billingStatus: "ACTIVE",
          premium: true,
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const siteIdHint = (sub.metadata?.siteId as string | undefined) ?? null;
      const res = await applyOnce(
        event.id,
        event.type,
        customerId,
        siteIdHint,
        subFields(sub),
      );
      if (res.applied && res.siteId) {
        await logAudit(null, {
          action: "UPDATE",
          entity: "Site",
          entityId: res.siteId,
          summary: `Билинг: статус „${sub.status}" (${event.type})`,
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const siteIdHint = (sub.metadata?.siteId as string | undefined) ?? null;
      // Отнеми достъпа.
      const res = await applyOnce(event.id, event.type, customerId, siteIdHint, {
        stripeSubscriptionId: null,
        billingStatus: "CANCELED",
        premium: false,
        planRenewsAt: null,
      });
      if (res.applied && res.siteId) {
        await logAudit(null, {
          action: "UPDATE",
          entity: "Site",
          entityId: res.siteId,
          summary: `Билинг: абонаментът е прекратен — премиум изключен`,
        });
      }
      break;
    }

    case "invoice.paid": {
      // Defense-in-depth при подновяване: успешно платена фактура потвърждава,
      // че абонаментът върви. Дублира customer.subscription.updated (active), но
      // ако то се забави/пропусне, тук премахваме евентуален PAST_DUE и
      // придвижваме planRenewsAt напред. Идемпотентно по event.id.
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
      // В тази API версия абонаментът е под parent.subscription_details.
      const subRef = invoice.parent?.subscription_details?.subscription ?? null;
      const subId = typeof subRef === "string" ? subRef : subRef?.id ?? null;

      if (subId && stripe) {
        // Изтегли реалния статус/период от Stripe — не се доверяваме на нищо
        // от клиента; premium се решава от isPremiumStatus през subFields.
        const sub = await stripe.subscriptions.retrieve(subId);
        const f = subFields(sub);
        const res = await applyOnce(event.id, event.type, customerId, null, f);
        if (res.applied && res.siteId) {
          await logAudit(null, {
            action: "UPDATE",
            entity: "Site",
            entityId: res.siteId,
            summary: `Билинг: платена фактура (invoice.paid) — статус „${sub.status}"`,
          });
        }
      } else {
        // Без subscription (напр. еднократна фактура) — само маркирай event-а
        // като обработен, без да пипаме достъпа.
        await prisma.webhookEvent
          .create({ data: { id: event.id, type: event.type } })
          .catch(() => {
            /* дубликат при ретрай — ок */
          });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
      // M1 — dunning политиката е в ЕДНА точка: isPremiumStatus(). Тук НЕ
      // зашиваме `premium: true`, защото Stripe не гарантира реда на доставка и
      // това би се борило с мапинга при customer.subscription.updated
      // (past_due). Отбелязваме PAST_DUE и оставяме isPremiumStatus да реши
      // достъпа (по подразбиране PAST_DUE → без премиум). Ако решим да даваме
      // гратис по време на dunning, се сменя САМО isPremiumStatus в billing.ts.
      const res = await applyOnce(event.id, event.type, customerId, null, {
        billingStatus: "PAST_DUE",
        premium: isPremiumStatus("PAST_DUE"),
      });
      if (res.applied && res.siteId) {
        await logAudit(null, {
          action: "UPDATE",
          entity: "Site",
          entityId: res.siteId,
          summary: `Билинг: неуспешно плащане (invoice.payment_failed) — просрочено`,
        });
      }
      break;
    }

    default:
      // Другите събития просто ги маркираме като обработени (2xx), за да не
      // ретраи Stripe безкрайно.
      await prisma.webhookEvent
        .create({ data: { id: event.id, type: event.type } })
        .catch(() => {
          /* дубликат при ретрай — ок */
        });
  }
}
