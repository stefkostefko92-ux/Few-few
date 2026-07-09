// bot/src/events/entitlementDelete.js
// Native Discord monetization: an entitlement was deleted (refund / chargeback /
// Discord-side removal). The backend revokes Premium ONLY if the server is still
// provisioned by exactly this Discord entitlement — Stripe-backed servers are
// never touched.
import { Events } from "discord.js";
import { sendEntitlement } from "../utils/api.js";

export default {
  name: Events.EntitlementDelete,
  once: false,
  async execute(entitlement) {
    try {
      await sendEntitlement("delete", entitlement);
      console.log(`💎 Entitlement deleted: sku=${entitlement.skuId} guild=${entitlement.guildId}`);
    } catch (err) {
      console.error("Failed to forward entitlementDelete:", err?.response?.data?.error || err.message);
    }
  },
};
