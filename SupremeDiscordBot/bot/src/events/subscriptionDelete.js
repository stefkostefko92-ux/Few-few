// bot/src/events/subscriptionDelete.js
// Discord Premium Apps: SUBSCRIPTION_DELETE. Само състояние за таблото и
// /premium status — ПРАВАТА се дават/отнемат единствено през entitlement
// събитията (Discord: entitlement-ът е източникът на истината).
import { Events } from "discord.js";
import { sendSubscription } from "../utils/api.js";

export default {
  name: Events.SubscriptionDelete,
  once: false,
  async execute(subscription) {
    try {
      await sendSubscription("delete", subscription);
      console.log(`💳 Subscription delete: id=${subscription.id} status=${subscription.status} periodEnd=${subscription.currentPeriodEndTimestamp ?? "∅"}`);
    } catch (err) {
      console.error("Failed to forward subscriptionDelete:", err?.response?.data?.error || err.message);
    }
  },
};
