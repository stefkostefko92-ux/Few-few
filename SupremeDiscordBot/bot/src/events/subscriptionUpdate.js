// bot/src/events/subscriptionUpdate.js
// Discord Premium Apps: SUBSCRIPTION_UPDATE. Само състояние за таблото и
// /premium status — ПРАВАТА се дават/отнемат единствено през entitlement
// събитията (Discord: entitlement-ът е източникът на истината).
import { Events } from "discord.js";
import { sendSubscription } from "../utils/api.js";

export default {
  name: Events.SubscriptionUpdate,
  once: false,
  async execute(_oldSubscription, subscription) {
    try {
      await sendSubscription("update", subscription);
      console.log(`💳 Subscription update: id=${subscription.id} status=${subscription.status} periodEnd=${subscription.currentPeriodEndTimestamp ?? "∅"}`);
    } catch (err) {
      console.error("Failed to forward subscriptionUpdate:", err?.response?.data?.error || err.message);
    }
  },
};
