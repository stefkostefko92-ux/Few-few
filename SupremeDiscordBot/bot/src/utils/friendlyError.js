// bot/src/utils/friendlyError.js
// Единно, потребителски-четимо форматиране на грешки от axios/backend извиквания.
// Разграничава мрежов/backend-недостъпен проблем (ECONNREFUSED, ETIMEDOUT, 5xx)
// от нормален приложен отказ (404/403/валидация), и винаги слага correlation ID
// (interaction.id), за да може потребител да го даде на support при нужда.
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { t, resolveLangSync } from "../i18n/index.js";

const STATUS_URL = process.env.STATUS_URL || "https://supremebot.carbonstealth.eu/status";

const NETWORK_CODES = new Set(["ECONNREFUSED", "ETIMEDOUT", "ECONNABORTED", "ENOTFOUND", "ECONNRESET"]);

/**
 * @param {Error} err - грешка, обикновено от axios (err.response, err.code)
 * @param {import("discord.js").Interaction} interaction - за correlation ID
 * @param {string} [fallbackMessage] - текст при "нормална" грешка (404/403/валидация)
 * @returns {{ content?: string, embeds?: object[], components?: object[] }}
 *          готов payload за editReply/reply/followUp
 */
export function friendlyError(err, interaction, fallbackMessage) {
  const correlationId = interaction?.id || "unknown";
  const status = err?.response?.status;
  const isNetworkIssue = NETWORK_CODES.has(err?.code) || (status && status >= 500) || (!status && !err?.response && err?.code);
  // Sync-only locale guess (interaction.locale, no DB hop) — this is an
  // already-degraded error path, not worth the extra Server.language lookup
  // resolveLang() would otherwise do.
  const lang = resolveLangSync(interaction);

  if (isNetworkIssue) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("error.serviceUnavailable.button", lang)).setURL(STATUS_URL)
    );
    return {
      embeds: [{
        title: t("error.serviceUnavailable.title", lang),
        description: t("error.serviceUnavailable.body", lang, { id: correlationId }),
        color: 0xfbbf24,
      }],
      components: [row],
    };
  }

  // 404/403/валидация — нормален приложен отказ, не мрежов проблем.
  const msg = err?.response?.data?.error || fallbackMessage || err?.message || "Unknown error";
  return { content: `❌ ${msg}`, components: [] };
}
