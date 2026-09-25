// bot/src/internal/panelHandler.js
import { getPanel, markPanelSpawned } from "../utils/api.js";
import { buildPanelMessage, buildMultiPanelMessage } from "../utils/embed.js";

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
  const panel = await getPanel(panelId, { withSiblings: true });
  if (!panel.channelId || !panel.messageId) return;

  const channel = client.channels.cache.get(panel.channelId)
    || await client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!msg) return;

  // Съобщението може да е ГРУПОВО (няколко панела в едно). Тогава редакцията
  // трябва да го пресглоби ЦЯЛОТО — иначе запис на един панел би изтрил
  // останалите от съобщението. Групата се разпознава по споделен messageId;
  // backend-ът връща съседите (siblings) в payload-а.
  const group = Array.isArray(panel.siblings) && panel.siblings.length
    ? panel.siblings
    : null;

  if (group) {
    // Режимът на групата се пази на панелите (groupMode) — иначе редакция би
    // разпаднала слятото меню обратно на отделни блокове.
    const { embeds, components } = buildMultiPanelMessage(group, { mode: panel.groupMode || "STACK" });
    await msg.edit({ embeds, components });
    return;
  }

  const { embeds, components } = buildPanelMessage(panel);
  await msg.edit({ embeds, components });
}

/**
 * Публикува НЯКОЛКО панела като ЕДНО съобщение.
 * Всички панели получават един и същ channelId/messageId — така редакцията
 * после ги разпознава като група и пресглобява цялото съобщение.
 */
export async function handleMultiPanelSpawn(client, { panels, serverId, channelId, mode }) {
  if (!Array.isArray(panels) || !panels.length) throw new Error("panels required");

  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) throw new Error(`Channel ${channelId} not found`);
  // Cross-tenant guard — същият като при единичния spawn.
  if (serverId && (channel.guildId || channel.guild?.id) !== serverId) {
    throw new Error("Channel belongs to a different server");
  }

  const { embeds, components, skipped } = buildMultiPanelMessage(panels, { mode });
  if (!embeds.length) throw new Error("Nothing to post — all panels exceeded Discord limits");

  const msg = await channel.send({ embeds, components });

  // Маркирай КАЖДИЯ публикуван панел със същия messageId.
  const postedIds = panels.map((p) => p.id).filter((id) => !skipped.some((s) => s.id === id));
  for (const id of postedIds) {
    await markPanelSpawned(id, channelId, msg.id).catch(() => {});
  }

  return { channelId, messageId: msg.id, posted: postedIds, skipped };
}
