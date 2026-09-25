// bot/src/internal/applicationHandler.js
import { buildStatusEmbed } from "../utils/embed.js";
import { SUCCESS, DANGER, MUTED } from "../utils/colors.js";

export async function handleApplicationReviewed(client, {
  serverId, applicationId, action, reviewMessageId, reviewChannelId, reviewerTag, note
}) {
  if (!reviewChannelId || !reviewMessageId) return;

  // Fallback към REST fetch — кешът може да е студен след рестарт/sharding.
  const channel = client.channels.cache.get(reviewChannelId)
    || await client.channels.fetch(reviewChannelId).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(reviewMessageId).catch(() => null);
  if (!msg) return;

  // Disable all buttons on the review embed
  const disabledComponents = msg.components.map((row) => ({
    ...row.toJSON(),
    components: row.components.map((btn) => ({ ...btn.toJSON(), disabled: true })),
  }));

  await msg.edit({ components: disabledComponents }).catch(() => {});

  const actionConfig = {
    approve: { title: "✅ Application Approved", color: SUCCESS },
    deny: { title: "❌ Application Denied", color: DANGER },
  };

  const config = actionConfig[action] || { title: "Updated", color: MUTED };

  await msg.reply({
    embeds: [buildStatusEmbed(
      config.title,
      `Reviewed by **${reviewerTag}**${note ? `\n**Note:** ${note}` : ""}`,
      config.color,
      { client }
    )],
  });
}
