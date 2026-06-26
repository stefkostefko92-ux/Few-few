// bot/src/internal/applicationHandler.js
import { buildStatusEmbed } from "../utils/embed.js";

export async function handleApplicationReviewed(client, {
  serverId, applicationId, action, reviewMessageId, reviewChannelId, reviewerTag, note
}) {
  if (!reviewChannelId || !reviewMessageId) return;

  const channel = client.channels.cache.get(reviewChannelId);
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
    approve: { title: "✅ Application Approved", color: 0x57f287 },
    deny: { title: "❌ Application Denied", color: 0xed4245 },
  };

  const config = actionConfig[action] || { title: "Updated", color: 0x99aab5 };

  await msg.reply({
    embeds: [buildStatusEmbed(
      config.title,
      `Reviewed by **${reviewerTag}**${note ? `\n**Note:** ${note}` : ""}`,
      config.color
    )],
  });
}
