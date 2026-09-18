// bot/src/events/guildCreate.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { registerServer } from "../utils/api.js";
import { checkBotPermissions, reinviteUrl } from "../utils/permissionCheck.js";
import { BRAND, WARNING } from "../utils/colors.js";
import { t, resolveLangForGuild } from "../i18n/index.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://supremebot.carbonstealth.eu";
const SUPPORT_URL = process.env.SUPPORT_URL || "https://supremebot.carbonstealth.eu/support";

export default {
  name: "guildCreate",
  once: false,
  async execute(guild) {
    console.log(`📥 Joined guild: ${guild.name} (${guild.id})`);
    try {
      await registerServer(guild);
    } catch (err) {
      console.error("Failed to register server:", err.message);
    }

    await sendWelcome(guild).catch((err) => {
      console.error(`[guildCreate] Failed to send welcome for ${guild.id}:`, err.message);
    });
  },
};

// Намира канал, в който ботът реално може да пише: system channel по избор,
// иначе първият текстов канал където има View + Send. Ако няма нито един —
// null, и се пада на DM до owner-а.
function findWelcomeChannel(guild) {
  const me = guild.members.me;
  const canPost = (channel) => {
    const perms = me.permissionsIn(channel);
    return perms?.has(["ViewChannel", "SendMessages"]);
  };

  if (guild.systemChannel && canPost(guild.systemChannel)) return guild.systemChannel;

  return guild.channels.cache
    .filter((c) => c.isTextBased?.() && !c.isThread() && canPost(c))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .first() || null;
}

async function sendWelcome(guild) {
  const { missing } = checkBotPermissions(guild);
  // Server just registered (registerServer above) — freshly created, so
  // language is still the DB default ("en") unless the owner pre-set it via
  // some other server on the same account; still worth resolving instead of
  // hardcoding, for consistency with every other localized surface.
  const lang = await resolveLangForGuild(guild.id);

  const embed = {
    title: t("welcome.title", lang),
    description: [
      t("welcome.intro", lang),
      "",
      t("welcome.quickStart", lang),
      t("welcome.step1", lang),
      t("welcome.step2", lang),
      t("welcome.step3", lang),
    ].join("\n"),
    color: missing.length ? WARNING : BRAND,
    timestamp: new Date().toISOString(),
  };

  if (missing.length) {
    embed.fields = [{
      name: t("welcome.missingPerms", lang, { count: missing.length }),
      value: `${missing.map((m) => m.name).join(", ")}\n[${t("welcome.reinvite", lang)}](${reinviteUrl(guild.client.user.id)})`,
    }];
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("welcome.dashboardButton", lang)).setURL(`${DASHBOARD_URL}/dashboard/${guild.id}`),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("welcome.supportButton", lang)).setURL(SUPPORT_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Primary).setCustomId("setup:start").setLabel(t("welcome.quickSetupButton", lang)).setEmoji("⚡"),
  );

  const payload = { embeds: [embed], components: [row] };

  const channel = findWelcomeChannel(guild);
  if (channel) {
    try {
      await channel.send(payload);
      return;
    } catch (err) {
      console.warn(`[guildCreate] Couldn't post welcome in #${channel.name} (${guild.id}):`, err.message);
      // fall through to DM
    }
  }

  // Fallback: DM the owner. DMs may be closed — never let that throw.
  const owner = await guild.client.users.fetch(guild.ownerId).catch(() => null);
  if (owner) {
    await owner.send(payload).catch((err) => {
      console.warn(`[guildCreate] Couldn't DM owner ${guild.ownerId} (${guild.id}):`, err.message);
    });
  }
}
