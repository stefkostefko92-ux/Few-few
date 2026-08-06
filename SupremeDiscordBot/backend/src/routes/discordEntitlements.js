// backend/src/routes/discordEntitlements.js
// Internal endpoints called BY the Discord bot for native monetization:
//   POST /entitlement               — single gateway event (CREATE/UPDATE/DELETE)
//   POST /entitlements/reconcile    — startup sweep against the full active set
//
// Discord does NOT redeliver entitlement gateway events after a disconnect, and
// a subscription's natural end arrives only as ENTITLEMENT_UPDATE with a past
// ends_at. If that single event is missed, nothing else would ever flip the
// server back — hence the reconcile endpoint: the bot fetches ALL active
// entitlements on ready (GET /applications/{id}/entitlements) and we converge:
// grant every active one, revoke every Discord-provisioned server whose
// entitlement is no longer in the active set.
//
// Discord subscription SKUs are per-guild → only `premium` and `whitelabel` are
// mappable here (env DISCORD_SKU_PREMIUM / DISCORD_SKU_WHITELABEL). Agency is
// multi-server and stays Stripe-only — planFromDiscordSku never returns it.
//
// Only the bot calls this (requireBotSecret). Grants are idempotent and never
// touch Stripe-provisioned servers (mutual exclusivity, both directions).

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { planFromDiscordSku, syncServerPaidFlag } from "../lib/premium.js";

const router = Router();

router.use(requireBotSecret);

// endsAt arrives as entitlement.endsTimestamp (ms number) or null; tolerate a
// string/ISO too. null/undefined ⇒ perpetual entitlement (no expiry).
const entitlementShape = z.object({
  id: z.string().min(1),
  skuId: z.string().min(1),
  guildId: z.string().min(1).nullish(),
  userId: z.string().min(1).nullish(),
  endsAt: z.union([z.number(), z.string()]).nullish(),
});

const eventSchema = z.object({
  type: z.enum(["create", "update", "delete"]),
  entitlement: entitlementShape,
});

const reconcileSchema = z.object({
  // The bot's full ACTIVE entitlement list (excludeEnded). Bounded generously —
  // one entry per subscribed guild.
  entitlements: z.array(entitlementShape).max(10000),
});

const DISCORD_GRANTABLE = new Set(["premium", "whitelabel"]);

function isExpired(ent, now = new Date()) {
  const endsAt = ent.endsAt != null ? new Date(ent.endsAt) : null;
  return !!(endsAt && !Number.isNaN(endsAt.getTime()) && endsAt <= now);
}

/**
 * Grant a plan for one active entitlement. Idempotent; never overwrites a
 * Stripe-provisioned server. Returns a small outcome object for logging.
 */
async function grantEntitlement(ent, via) {
  const plan = planFromDiscordSku(ent.skuId);
  // Hard-guard: only per-guild SKUs (premium/whitelabel) are Discord-grantable;
  // Agency stays Stripe-only even if an agency SKU env were mis-configured.
  if (!plan || !DISCORD_GRANTABLE.has(plan) || !ent.guildId) {
    return { ignored: !ent.guildId ? "no guildId" : "unmapped or non-guild sku" };
  }

  // Only provision servers that already exist (bot must have joined first).
  const server = await prisma.server.findUnique({
    where: { id: ent.guildId },
    select: { id: true, plan: true, planSource: true, stripeSubscriptionId: true, discordEntitlementId: true },
  });
  if (!server) return { ignored: "unknown server" };

  // Mutual exclusivity: never let a Discord grant overwrite a Stripe-provisioned
  // server — otherwise a later ENTITLEMENT_DELETE would (via the
  // planSource==="discord" guard) revoke a still-paying Stripe customer.
  if (server.planSource === "stripe" || server.stripeSubscriptionId) {
    return { ignored: "server already provisioned via Stripe" };
  }

  // Idempotent no-op: already granted this exact entitlement + plan (avoids
  // duplicate audit rows on redelivered gateway events / every reconcile).
  if (server.planSource === "discord" && server.discordEntitlementId === ent.id && server.plan === plan) {
    return { alreadyGranted: true };
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
    if (err?.code === "P2025") return { ignored: "server vanished" };
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorId: ent.userId || null,
      actorTag: ent.userId ? undefined : "SYSTEM",
      serverId: ent.guildId,
      action: "PREMIUM_GRANTED_DISCORD",
      targetId: ent.guildId,
      metadata: { entitlementId: ent.id, skuId: ent.skuId, plan, via },
    },
  });

  return { granted: true, plan };
}

/**
 * Revoke a server's Discord-provisioned plan — only when it is provisioned by
 * exactly `entitlementId`. Never downgrades a Stripe-backed server.
 */
async function revokeServer(serverId, entitlementId, reason) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, planSource: true, discordEntitlementId: true, discordSkuId: true },
  });
  if (!server) return { ignored: "unknown server" };
  if (server.planSource !== "discord" || server.discordEntitlementId !== entitlementId) {
    return { ignored: "not owned by this discord entitlement" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.server.update({
        where: { id: serverId },
        data: {
          plan: "free",
          planSource: null,
          discordEntitlementId: null,
          discordSkuId: null,
        },
      });
      // НЕ хардкодвай isPremium:false — сървърът може да е покрит от АКТИВНА
      // агенция (agency seat не зависи от Discord entitlement). Recompute-ни:
      // остава premium при agency покритие, иначе → free.
      await syncServerPaidFlag(serverId, tx);
    });
  } catch (err) {
    if (err?.code === "P2025") return { ignored: "server vanished" };
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorId: null,
      actorTag: "SYSTEM",
      serverId,
      action: "PREMIUM_REVOKED_DISCORD",
      targetId: serverId,
      metadata: { entitlementId, reason },
    },
  });

  return { revoked: true };
}

// ─── POST /api/discord/entitlement ───────────────────────────────────────────
// Single gateway event forwarded live by the bot.
router.post("/entitlement", async (req, res, next) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid entitlement payload", details: parsed.error.flatten() });
  }
  const { type, entitlement: ent } = parsed.data;

  try {
    // A delete event OR an entitlement that has already lapsed ⇒ revoke.
    if (type === "delete" || isExpired(ent)) {
      if (!ent.guildId) return res.json({ ok: true, ignored: "no guildId" });
      const outcome = await revokeServer(ent.guildId, ent.id, type === "delete" ? "delete" : "expired");
      return res.json({ ok: true, ...outcome });
    }

    const outcome = await grantEntitlement(ent, type);
    return res.json({ ok: true, ...outcome });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/discord/entitlements/reconcile ────────────────────────────────
// Startup convergence sweep: body carries the application's FULL active
// entitlement list. Grants anything active we missed; revokes any
// Discord-provisioned server whose entitlement is no longer active.
router.post("/entitlements/reconcile", async (req, res, next) => {
  const parsed = reconcileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid reconcile payload", details: parsed.error.flatten() });
  }

  try {
    const now = new Date();
    const active = parsed.data.entitlements.filter((e) => e.guildId && !isExpired(e, now));
    const activeIds = new Set(active.map((e) => e.id));

    const result = { granted: 0, revoked: 0, ignored: 0 };

    // 1) Grant every active entitlement (idempotent per server).
    for (const ent of active) {
      const outcome = await grantEntitlement(ent, "reconcile");
      if (outcome.granted) result.granted++;
      else result.ignored++;
    }

    // 2) Revoke Discord-provisioned servers whose entitlement disappeared
    //    (expired/refunded while the bot was offline — the one signal Discord
    //    never redelivers).
    const discordProvisioned = await prisma.server.findMany({
      where: { planSource: "discord", discordEntitlementId: { not: null } },
      select: { id: true, discordEntitlementId: true },
    });

    // Предпазител срещу масов погрешен revoke: празен активен списък при
    // налични Discord-обезпечени сървъри е по-вероятно fetch/pagination
    // проблем (или частичен Discord outage), отколкото „всички изтекоха
    // едновременно". Grant-овете по-горе са безвредни; revoke пропускаме.
    if (active.length === 0 && discordProvisioned.length > 0) {
      console.warn(
        `⚠️ Reconcile: active=0 но discordProvisioned=${discordProvisioned.length} — пропускам revoke (вероятен fetch проблем)`
      );
      return res.json({ ok: true, ...result, active: 0, skipped: "empty-active-guard" });
    }

    for (const server of discordProvisioned) {
      if (activeIds.has(server.discordEntitlementId)) continue;
      const outcome = await revokeServer(server.id, server.discordEntitlementId, "reconcile-missing");
      if (outcome.revoked) result.revoked++;
    }

    console.log(
      `🔄 Discord entitlement reconcile: active=${active.length} granted=${result.granted} revoked=${result.revoked}`
    );
    return res.json({ ok: true, ...result, active: active.length });
  } catch (err) {
    next(err);
  }
});

export default router;
