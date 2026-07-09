// bot/src/utils/premiumRequired.js
// Native Discord monetization upsell. Instead of pointing users at the web
// dashboard, we reply to an interaction with Discord's built-in premium button
// (ButtonStyle.Premium + sku_id). Discord renders it as a purchase/upgrade CTA
// and, on click, opens the in-app checkout for that SKU — no external redirect.
//
// discord.js v14.26: a Premium button carries ONLY a style + SKU id (no label,
// no custom_id, no url — Discord fills the label from the SKU). Use it for the
// Premium or White-label subscription SKU depending on which feature was gated.
//
// The reply is ephemeral (only the invoking user sees the upsell).
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

/**
 * Reply to (or follow up) an interaction with a native premium upsell button.
 * @param {import("discord.js").RepliableInteraction} interaction
 * @param {string} skuId  Discord subscription SKU id (e.g. process.env.DISCORD_SKU_PREMIUM).
 * @param {string} [content] Optional short line above the button.
 */
export async function sendPremiumRequired(interaction, skuId, content) {
  if (!skuId) {
    // No SKU configured (monetization not enabled) → graceful text fallback so
    // the interaction never fails silently.
    const body = {
      content: content || "⭐ This feature requires Premium. Upgrade at " + (process.env.FRONTEND_URL || "the dashboard") + ".",
      flags: MessageFlags.Ephemeral,
    };
    return interaction.deferred || interaction.replied
      ? interaction.followUp(body)
      : interaction.reply(body);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(skuId),
  );

  const body = {
    content: content || "⭐ This is a Premium feature — upgrade to unlock it:",
    components: [row],
    flags: MessageFlags.Ephemeral,
  };

  // If we already deferred/replied, a Premium button must go out as a follow-up.
  return interaction.deferred || interaction.replied
    ? interaction.followUp(body)
    : interaction.reply(body);
}
