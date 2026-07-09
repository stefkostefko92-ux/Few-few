// bot/src/events/entitlementUpdate.js
// Native Discord monetization: an existing entitlement changed (e.g. renewal, or
// endsTimestamp set when a subscription is cancelled but still active until the
// period end). discord.js emits (oldEntitlement, newEntitlement) — we act on the
// new one; the backend decides grant vs. revoke based on endsAt.
import { Events } from "discord.js";
import { sendEntitlement } from "../utils/api.js";

export default {
  name: Events.EntitlementUpdate,
  once: false,
  async execute(_oldEntitlement, newEntitlement) {
    try {
      await sendEntitlement("update", newEntitlement);
      console.log(`💎 Entitlement updated: sku=${newEntitlement.skuId} guild=${newEntitlement.guildId} endsAt=${newEntitlement.endsTimestamp ?? "∞"}`);
    } catch (err) {
      console.error("Failed to forward entitlementUpdate:", err?.response?.data?.error || err.message);
    }
  },
};
