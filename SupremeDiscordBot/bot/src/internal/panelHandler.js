// bot/src/internal/panelHandler.js
import { getPanel, markPanelSpawned } from "../utils/api.js";
import { buildPanelMessage } from "../utils/embed.js";

export async function handlePanelSpawn(client, { panelId, serverId, channelId }) {
  const panel = await getPanel(panelId);
  const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId);

  if (!channel) throw new Error(`Channel ${channelId} not found`);
  // Cross-tenant guard: channelId е потребителски вход от dashboard-а — админ
  // на сървър A не бива да може да пости панел в канал на сървър B.
  if (serverId && (channel.guildId || channel.guild?.id) !== serverId) {
    throw new Error("Channel belongs to a different server");
  }

  const { embeds, components } = buildPanelMessage(panel);
  const msg = await channel.send({ embeds, components });

  await markPanelSpawned(panelId, channelId, msg.id);

  return { channelId, messageId: msg.id };
}

export async function handlePanelUpdate(client, { panelId, serverId }) {
  const panel = await getPanel(panelId);
  if (!panel.channelId || !panel.messageId) return;

  const channel = client.channels.cache.get(panel.channelId)
    || await client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!msg) return;

  const { embeds, components } = buildPanelMessage(panel);
  await msg.edit({ embeds, components });
}
