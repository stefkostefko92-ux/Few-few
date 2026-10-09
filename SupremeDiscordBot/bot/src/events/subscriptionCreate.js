// bot/src/events/subscriptionCreate.js
// Discord Premium Apps: SUBSCRIPTION_CREATE. Само състояние за таблото и
// /premium status — ПРАВАТА се дават/отнемат единствено през entitlement
// събитията (Discord: entitlement-ът е източникът на истината).
import { Events } from "discord.js";
import { sendSubscription } from "../utils/api.js";

export default {
  name: Events.SubscriptionCreate,
  once: false,
  async execute(subscription) {
    try {
      await sendSubscription("create", subscription);
      console.log(`💳 Subscription create: id=${subscription.id} status=${subscription.status} periodEnd=${subscription.currentPeriodEndTimestamp ?? "∅"}`);
    } catch (err) {
      console.error("Failed to forward subscriptionCreate:", err?.response?.data?.error || err.message);
    }
  },
};
