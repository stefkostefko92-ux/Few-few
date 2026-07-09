// bot/src/events/entitlementCreate.js
// Native Discord monetization: a guild bought a subscription SKU (Premium /
// White-label) straight from Discord. discord.js emits this automatically — no
// special gateway intent required. We forward it to the backend, which resolves
// the SKU → plan and provisions the server (parallel to the Stripe webhook path).
import { Events } from "discord.js";
import { sendEntitlement } from "../utils/api.js";

export default {
  name: Events.EntitlementCreate,
  once: false,
  async execute(entitlement) {
    try {
      await sendEntitlement("create", entitlement);
      console.log(`💎 Entitlement created: sku=${entitlement.skuId} guild=${entitlement.guildId}`);
    } catch (err) {
      console.error("Failed to forward entitlementCreate:", err?.response?.data?.error || err.message);
    }
  },
};
