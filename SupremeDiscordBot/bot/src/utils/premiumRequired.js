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
  // A Premium button's sku_id must belong to the SAME Discord application as
  // the bot. White-label clients are separate applications and don't own the
  // main bot's SKUs — Discord rejects the button (400). Fall back to text there.
  const isWhiteLabelClient = interaction.client.isWhiteLabel === true;

  const send = (body) => {
    // followUp = webhook.send и НЕ наследява ephemeral от defer-а — без изричен
    // flags би излязъл ПУБЛИЧНО в канала (изтичане на upsell-а).
    if (interaction.replied) return interaction.followUp({ ...body, flags: MessageFlags.Ephemeral });
    // Deferred but not yet replied → editReply resolves the pending "thinking…"
    // placeholder instead of leaving it hanging next to a follow-up (запазва
    // ephemeral-ността, зададена при deferReply).
    if (interaction.deferred) return interaction.editReply(body);
    return interaction.reply({ ...body, flags: MessageFlags.Ephemeral });
  };

  if (!skuId || isWhiteLabelClient) {
    // No SKU configured (monetization not enabled) or a white-label client →
    // graceful text fallback so the interaction never fails silently.
    return send({
      content: content || "⭐ This feature requires Premium. Upgrade at " + (process.env.FRONTEND_URL || "the dashboard") + ".",
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(skuId),
  );

  return send({
    content: content || "⭐ This is a Premium feature — upgrade to unlock it:",
    components: [row],
  });
}
