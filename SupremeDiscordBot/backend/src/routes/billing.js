// backend/src/routes/billing.js
// Доставчико-неутралният поглед към плащанията за таблото.
//
//   GET /api/billing/config        — публична конфигурация (провайдър, магазин,
//                                    тарифи + SKU) — без тайни, без автентикация
//                                    (същото стои и в URL-а на магазина).
//   GET /api/billing/:serverId     — състоянието на конкретен сървър: ефективен
//                                    план, източник на правата, Discord абонамент,
//                                    гратис, агенция, легаси Stripe.
//
// ЗАЩО отделен маршрут, а не `/api/stripe/status`: старият е зад `requireStripe`
// и връща 503, когато няма Stripe ключ. При Discord-only инсталация (решението на
// собственика, 12.09.2026) таблото оставаше без никакъв източник за „платен ли
// е сървърът и откъде“. Тук нищо не зависи от Stripe: четем нашата база, а
// правата идват от проверени Discord entitlement-и (виж discordEntitlements.js).

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { getServerTier } from "../lib/premium.js";
import { billingConfig, discordSkuUrl } from "../lib/billing.js";
import { discordSubscriptionLabel } from "../lib/discordSubscription.js";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(billingConfig());
});

router.get("/:serverId", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: {
        isPremium: true, plan: true, planSource: true, premiumSince: true,
        billingInterval: true,
        // Discord Premium Apps
        discordEntitlementId: true, discordSkuId: true,
        discordSubscriptionId: true, discordSubscriptionStatus: true,
        discordCurrentPeriodEnd: true,
        // Легаси Stripe (само заварени абонати)
        stripeSubscriptionId: true, stripeStatus: true, stripeCustomerId: true,
        // Гратис след отмяна (v40)
        accessUntil: true, gracePlan: true,
        // Агенция (легаси — вече не се продава)
        agencyId: true,
        agency: { select: { plan: true, active: true, ownerUserId: true } },
      },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });

    const now = new Date();
    const tier = await getServerTier(req.params.serverId);
    const graceActive = !!(server.accessUntil && server.accessUntil > now);
    const agencyCovered = !!(server.agencyId && server.agency?.active);
    const config = billingConfig();

    // Откъде идват правата ДНЕС. Един източник, една дума — таблото не гадае
    // по комбинация от колони (класът „едно правило, N определения“).
    let source = "none";
    if (server.planSource === "discord" && server.discordEntitlementId) source = "discord";
    else if (server.planSource === "stripe" || server.stripeSubscriptionId) source = "stripe";
    else if (server.planSource === "manual") source = "manual";
    else if (agencyCovered) source = "agency";
    else if (graceActive) source = "grace";

    res.json({
      provider: config.provider,
      isPremium: tier.isPremium,
      plan: tier.plan,
      planLabel: tier.planLabel,
      hasWhiteLabel: tier.hasWhiteLabel,
      source,
      premiumSince: server.premiumSince,
      graceActive,
      accessUntil: server.accessUntil,
      gracePlan: server.gracePlan,
      agencyCovered,
      agencyOwnedByMe: agencyCovered && server.agency.ownerUserId === req.user.id,
      discord: {
        entitlementId: server.discordEntitlementId,
        skuId: server.discordSkuId,
        subscriptionId: server.discordSubscriptionId,
        // Само етикет — правата НИКОГА не се извеждат от статуса на абонамента
        // (Discord: entitlement-ът е източникът на истината).
        status: server.discordSubscriptionStatus,
        statusLabel: discordSubscriptionLabel(server.discordSubscriptionStatus),
        currentPeriodEnd: server.discordCurrentPeriodEnd,
        storeUrl: config.discord.storeUrl,
        // Линк към точно този SKU при ъпгрейд/подновяване; при липса — магазина.
        manageUrl: discordSkuUrl(server.plan === "whitelabel" ? "whitelabel" : "premium") || config.discord.storeUrl,
      },
      stripe: {
        legacy: source === "stripe",
        status: server.stripeStatus,
        // Порталът за заварени абонати работи само при конфигуриран Stripe.
        portalAvailable: config.stripe.legacyManagement && Boolean(server.stripeCustomerId),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
