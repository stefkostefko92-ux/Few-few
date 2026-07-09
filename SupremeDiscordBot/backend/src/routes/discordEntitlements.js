// backend/src/routes/discordEntitlements.js
// Internal endpoint called BY the Discord bot when the gateway emits
// ENTITLEMENT_CREATE / UPDATE / DELETE for a native Discord subscription SKU.
// This is the SECOND upgrade path, parallel to Stripe (routes/stripe.js): a
// guild owner buys Premium / White-label straight from Discord's monetization UI.
//
// Discord subscription SKUs are per-guild → only `premium` and `whitelabel` are
// mappable here (env DISCORD_SKU_PREMIUM / DISCORD_SKU_WHITELABEL). Agency is
// multi-server and stays Stripe-only — planFromDiscordSku never returns it.
//
// Only the bot calls this (requireBotSecret). Grants are idempotent and never
// touch Stripe-provisioned servers on revoke.

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { planFromDiscordSku } from "../lib/premium.js";

const router = Router();

router.use(requireBotSecret);

// endsAt arrives as entitlement.endsTimestamp (ms number) or null; tolerate a
// string/ISO too. null/undefined ⇒ perpetual entitlement (no expiry).
const entitlementSchema = z.object({
  type: z.enum(["create", "update", "delete"]),
  entitlement: z.object({
    id: z.string().min(1),
    skuId: z.string().min(1),
    guildId: z.string().min(1).nullish(),
    userId: z.string().min(1).nullish(),
    endsAt: z.union([z.number(), z.string()]).nullish(),
  }),
});

// ─── POST /api/discord/entitlement ───────────────────────────────────────────
router.post("/entitlement", async (req, res, next) => {
  const parsed = entitlementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid entitlement payload", details: parsed.error.flatten() });
  }
  const { type, entitlement: ent } = parsed.data;

  try {
    const now = new Date();
    const endsAt = ent.endsAt != null ? new Date(ent.endsAt) : null;
    const expired = !!(endsAt && !Number.isNaN(endsAt.getTime()) && endsAt <= now);

    // A delete event OR an entitlement that has already lapsed ⇒ revoke.
    const shouldRevoke = type === "delete" || expired;

    if (shouldRevoke) {
      // Revoke — but only if THIS server is currently Discord-provisioned by
      // exactly this entitlement. Never downgrade a Stripe-backed server.
      if (!ent.guildId) return res.json({ ok: true, ignored: "no guildId" });

      const server = await prisma.server.findUnique({
        where: { id: ent.guildId },
        select: { id: true, planSource: true, discordEntitlementId: true },
      });
      if (!server) return res.json({ ok: true, ignored: "unknown server" });
      if (server.planSource !== "discord" || server.discordEntitlementId !== ent.id) {
        return res.json({ ok: true, ignored: "not owned by this discord entitlement" });
      }

      try {
        await prisma.server.update({
          where: { id: ent.guildId },
          data: {
            isPremium: false,
            plan: "free",
            planSource: null,
            discordEntitlementId: null,
            discordSkuId: null,
          },
        });
      } catch (err) {
        if (err?.code === "P2025") return res.json({ ok: true, ignored: "server vanished" });
        throw err;
      }

      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorTag: "SYSTEM",
          serverId: ent.guildId,
          action: "PREMIUM_REVOKED_DISCORD",
          targetId: ent.guildId,
          metadata: { entitlementId: ent.id, skuId: ent.skuId, reason: type === "delete" ? "delete" : "expired" },
        },
      });

      return res.json({ ok: true, revoked: true });
    }

    // ── Grant (create / update, not expired) ──────────────────────────────────
    const plan = planFromDiscordSku(ent.skuId);
    // Discord subscription SKUs are per-guild → only premium/whitelabel are
    // grantable this way. Agency is multi-server and stays Stripe-only, so we
    // hard-guard against it even if an AGENCY SKU env were mis-configured.
    const DISCORD_GRANTABLE = new Set(["premium", "whitelabel"]);
    if (!plan || !DISCORD_GRANTABLE.has(plan) || !ent.guildId) {
      // Unknown/non-guild SKU (e.g. an Agency SKU that must never be
      // Discord-granted) or a user-scoped entitlement without a guild → no-op.
      return res.json({ ok: true, ignored: !ent.guildId ? "no guildId" : "unmapped or non-guild sku" });
    }

    // Only provision servers that already exist (bot must have joined first).
    const server = await prisma.server.findUnique({
      where: { id: ent.guildId },
      select: { id: true, plan: true, planSource: true, stripeSubscriptionId: true, discordEntitlementId: true },
    });
    if (!server) return res.json({ ok: true, ignored: "unknown server" });

    // Mutual exclusivity (docs: Stripe and Discord are two separate paths). Never
    // let a Discord grant overwrite a Stripe-provisioned server — otherwise a
    // later ENTITLEMENT_DELETE would (via the planSource==="discord" guard)
    // revoke a still-paying Stripe customer down to free.
    if (server.planSource === "stripe" || server.stripeSubscriptionId) {
      return res.json({ ok: true, ignored: "server already provisioned via Stripe" });
    }

    // Idempotent no-op: already granted this exact entitlement + plan (avoids
    // duplicate audit rows on redelivered gateway events).
    if (server.planSource === "discord" && server.discordEntitlementId === ent.id && server.plan === plan) {
      return res.json({ ok: true, alreadyGranted: true });
    }

    try {
      await prisma.server.update({
        where: { id: ent.guildId },
        data: {
          isPremium: true,
          plan,
          planSource: "discord",
          discordEntitlementId: ent.id,
          discordSkuId: ent.skuId,
        },
      });
    } catch (err) {
      if (err?.code === "P2025") return res.json({ ok: true, ignored: "server vanished" });
      throw err;
    }

    await prisma.auditLog.create({
      data: {
        actorId: ent.userId || null,
        actorTag: ent.userId ? undefined : "SYSTEM",
        serverId: ent.guildId,
        action: "PREMIUM_GRANTED_DISCORD",
        targetId: ent.guildId,
        metadata: { entitlementId: ent.id, skuId: ent.skuId, plan, via: type },
      },
    });

    return res.json({ ok: true, granted: true, plan });
  } catch (err) {
    next(err);
  }
});

export default router;
