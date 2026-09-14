import { Router } from "express";
import { prisma } from "@aso/db";
import { checkoutSchema, VIP_PERKS, type VipTier } from "@aso/shared";
import { asyncHandler, badRequest, unauthorized, HttpError } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { CATALOG, productBySku } from "../economy/catalog.js";
import { getStripe, stripeEnabled } from "../economy/stripe.js";
import { env } from "../env.js";

export const shopRouter: Router = Router();

/**
 * Checkout consent copy shown on the hosted Stripe page (CRD art. 16), by the
 * buyer's locale. One-off digital goods → immediate supply + loss of the 14-day
 * withdrawal right (16(m)); VIP → a service that keeps the 14-day right with a
 * proportional deduction (16(a)). Kept ≤1200 chars (Stripe custom_text limit).
 */
const CONSENT_BG = {
  oneOff:
    "Съгласявам се съдържанието да бъде предоставено незабавно и потвърждавам, че губя правото си на 14-дневен отказ.",
  sub: "VIP е абонамент с месечно автоматично подновяване. Запазваш правото на 14-дневен отказ; при отказ след започване дължиш пропорционална част за ползвания период.",
};

const CONSENT_TEXT: Record<string, { oneOff: string; sub: string }> = {
  bg: CONSENT_BG,
  en: {
    oneOff:
      "I agree the content is supplied immediately and confirm that I lose my 14-day right of withdrawal.",
    sub: "VIP is a subscription that renews monthly. You keep the 14-day right of withdrawal; if you withdraw after it starts, you owe a proportionate amount for the period used.",
  },
  it: {
    oneOff:
      "Acconsento che il contenuto sia fornito immediatamente e confermo di perdere il diritto di recesso di 14 giorni.",
    sub: "Il VIP è un abbonamento con rinnovo mensile. Mantieni il diritto di recesso di 14 giorni; se recedi dopo l'inizio, devi un importo proporzionale al periodo utilizzato.",
  },
};

function consentText(locale: string | null | undefined, isSubscription: boolean): string {
  const l = CONSENT_TEXT[locale ?? ""] ?? CONSENT_BG;
  return isSubscription ? l.sub : l.oneOff;
}

/** GET /api/shop/catalog — public product list + VIP perk table.
 *  `billingEnabled:false` (Stripe not configured) tells the client to render
 *  the catalog as a "coming soon" preview instead of offering checkout. */
shopRouter.get("/catalog", (_req, res) => {
  res.json({ products: CATALOG, vipPerks: VIP_PERKS, billingEnabled: stripeEnabled() });
});

shopRouter.use(requireAuth);

const serviceUnavailable = () => new HttpError(503, "stripe_unavailable", "Billing not configured");

/**
 * POST /api/shop/checkout — create a Stripe Checkout Session for a SKU.
 * One-time SKUs use mode:payment; VIP uses mode:subscription. We never credit
 * here — credit happens only on the signed webhook (§11.3).
 */
shopRouter.post(
  "/checkout",
  asyncHandler(async (req, res) => {
    if (!stripeEnabled()) throw serviceUnavailable();
    const { sku } = checkoutSchema.parse(req.body);
    const product = productBySku(sku);
    if (!product) throw badRequest("unknown_sku", "Непознат продукт");

    const userId = req.user!.sub;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized();

    // Block a second active VIP subscription up front (one per user; the DB has a
    // unique userId on Subscription, so a 2nd would later 500 the webhook).
    if (product.kind === "VIP_SUB") {
      const existing = await prisma.subscription.findUnique({ where: { userId } });
      if (existing) throw badRequest("already_subscribed", "Вече имаш активен абонамент");
    }

    const stripe = getStripe();
    const isSubscription = product.kind === "VIP_SUB";
    const consent = consentText(user.locale, isSubscription);

    // Reuse one Stripe customer per user (no duplicate cus_… on guest checkout;
    // also lets the billing portal resolve the subscription reliably).
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { userId } },
        { idempotencyKey: `customer:${userId}` },
      );
      customerId = customer.id;
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: isSubscription ? "subscription" : "payment",
        customer: customerId,
        // Carry identity + sku so the webhook knows what to grant, to whom.
        client_reference_id: userId,
        metadata: { userId, sku },
        ...(isSubscription ? { subscription_data: { metadata: { userId, sku } } } : {}),
        // CRD art. 16: show the immediate-supply / withdrawal-right notice above
        // the pay button on every session (`submit`, no Dashboard config needed).
        // The stronger ToS *checkbox* (consent_collection + its acceptance text)
        // requires a Terms URL in the Stripe Dashboard, so it is layered on only
        // when STRIPE_TOS_CONFIGURED is set — otherwise Stripe would reject the
        // session. The in-app checkbox remains the primary, guaranteed gate.
        ...(env.STRIPE_TOS_CONFIGURED
          ? {
              consent_collection: { terms_of_service: "required" as const },
              custom_text: {
                terms_of_service_acceptance: { message: consent },
                submit: { message: consent },
              },
            }
          : { custom_text: { submit: { message: consent } } }),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: product.priceCents,
              product_data: { name: product.title },
              ...(isSubscription ? { recurring: { interval: "month" as const } } : {}),
            },
          },
        ],
        success_url: `${env.PUBLIC_WEB_URL}/shop?status=success`,
        cancel_url: `${env.PUBLIC_WEB_URL}/shop?status=cancel`,
      },
      // Idempotency: the SDK retries network failures by replaying the POST, and
      // a user can double-click. A short per-user/sku time bucket collapses both
      // into one Checkout Session instead of two charges.
      { idempotencyKey: `checkout:${userId}:${sku}:${Math.floor(Date.now() / 30_000)}` },
    );

    res.json({ url: session.url });
  }),
);

/** POST /api/shop/portal — open the Stripe Billing Portal for VIP management. */
shopRouter.post(
  "/portal",
  asyncHandler(async (req, res) => {
    if (!stripeEnabled()) throw serviceUnavailable();
    const userId = req.user!.sub;
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) throw badRequest("no_subscription", "Няма активен абонамент");

    const stripe = getStripe();
    // Resolve the customer from the stored subscription.
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubId);
    const customer = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;

    const portal = await stripe.billingPortal.sessions.create(
      { customer, return_url: `${env.PUBLIC_WEB_URL}/shop` },
      { idempotencyKey: `portal:${userId}:${Math.floor(Date.now() / 30_000)}` },
    );
    res.json({ url: portal.url });
  }),
);

/** GET /api/shop/vip — current VIP status + perks for the signed-in user. */
shopRouter.get(
  "/vip",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw unauthorized();
    const tier = user.vipTier as VipTier;
    res.json({ tier, vipUntil: user.vipUntil, perks: VIP_PERKS[tier] });
  }),
);
