// bot/src/internal/ticketHandler.js
import { ChannelType } from "discord.js";
import { buildStatusEmbed, buildTicketOpenEmbed } from "../utils/embed.js";

export async function handleTicketClose(client, { ticketId, serverId, channelId, archiveUrl, reason }) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  await channel.send({
    embeds: [buildStatusEmbed(
      "🔒 Ticket Closed",
      `**Reason:** ${reason || "No reason provided"}\n\n[📄 View Archive](${(process.env.ARCHIVE_BASE_URL || process.env.FRONTEND_URL)}${archiveUrl})`,
      0xed4245
    )],
  });

  // Give users 5 seconds to read the close message then delete
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

export async function handleTicketClaim(client, { ticketId, serverId, channelId, claimerId }) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  let claimer;
  try {
    claimer = await client.users.fetch(claimerId);
  } catch {}

  await channel.send({
    embeds: [buildStatusEmbed(
      "🛡️ Ticket Claimed",
      claimer ? `This ticket is now being handled by <@${claimer.id}>` : "This ticket has been claimed.",
      0x5865f2
    )],
  });
}
