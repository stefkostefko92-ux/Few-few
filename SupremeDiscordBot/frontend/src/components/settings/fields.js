// frontend/src/components/settings/fields.js
// Настройките на сървъра, разделени на части. Едно `PUT /servers/:id` приема
// частично тяло (бекендът пипа само полетата, които присъстват), затова всяка
// страница праща САМО своите части: „Запазване на роли“ не може да презапише
// езика на бота, отворен в друг раздел преди час.
//
// Платените полета се пращат само при план, който ги носи: бекендът отказва с
// 403, щом полето ПРИСЪСТВА в тялото, а `null` е присъствие (одит 07.08.2026).
const fromList = (a) => (a || []).join(",");
const toList = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);

export const LOG_CATEGORIES = ["voice", "members", "moderation", "messages", "server"];

export const SECTIONS = {
  general: {
    toForm: (s) => ({ logChannelId: s.logChannelId || "", archiveChannelId: s.archiveChannelId || "" }),
    toPayload: (f) => ({ logChannelId: f.logChannelId || null, archiveChannelId: f.archiveChannelId || null }),
  },

  // Език на бота за сървъра (резервен за членове с неподдържан език в Discord).
  language: {
    toForm: (s) => ({ language: s.language || "en" }),
    toPayload: (f) => ({ language: f.language }),
  },

  roundRobin: {
    toForm: (s) => ({ roundRobinEnabled: s.roundRobinEnabled || false, roundRobinRoleId: s.roundRobinRoleId || "" }),
    toPayload: (f, s) => (s.isPremium
      ? { roundRobinEnabled: f.roundRobinEnabled, roundRobinRoleId: f.roundRobinRoleId || null }
      : {}),
  },

  aiReplies: {
    toForm: (s) => ({ aiRepliesEnabled: s.aiRepliesEnabled || false, aiRepliesPrompt: s.aiRepliesPrompt || "" }),
    toPayload: (f, s) => (s.isPremium
      ? { aiRepliesEnabled: f.aiRepliesEnabled, aiRepliesPrompt: f.aiRepliesPrompt || null }
      : {}),
  },

  whiteLabel: {
    // Токенът никога не се зарежда във формата и се праща само когато е въведен нов.
    toForm: (s) => ({ customBotName: s.customBotName || "", customBotAvatar: s.customBotAvatar || "", customBotToken: "" }),
    toPayload: (f, s) => (s.hasWhiteLabel
      ? {
          customBotName: f.customBotName || null,
          customBotAvatar: f.customBotAvatar || null,
          ...(f.customBotToken && { customBotToken: f.customBotToken }),
        }
      : {}),
  },

  welcome: {
    toForm: (s) => ({
      welcomerEnabled: s.welcomerEnabled || false,
      welcomerChannelId: s.welcomerChannelId || "",
      welcomerMessage: s.welcomerMessage || "",
      welcomerEmbedColor: s.welcomerEmbedColor || "#8fe600",
      welcomerDmEnabled: s.welcomerDmEnabled || false,
      welcomerDmMessage: s.welcomerDmMessage || "",
    }),
    toPayload: (f) => ({
      welcomerEnabled: f.welcomerEnabled,
      welcomerChannelId: f.welcomerChannelId || null,
      welcomerMessage: f.welcomerMessage || null,
      welcomerEmbedColor: f.welcomerEmbedColor,
      welcomerDmEnabled: f.welcomerDmEnabled,
      welcomerDmMessage: f.welcomerDmMessage || null,
    }),
  },

  autoroles: {
    toForm: (s) => ({ autoroleIds: fromList(s.autoroleIds), autoroleBotIds: fromList(s.autoroleBotIds) }),
    toPayload: (f) => ({ autoroleIds: toList(f.autoroleIds), autoroleBotIds: toList(f.autoroleBotIds) }),
  },

  // „Запазване на роли“ (в базата: stickyRolesEnabled, миграция v45).
  roleSaver: {
    toForm: (s) => ({ stickyRolesEnabled: s.stickyRolesEnabled || false }),
    toPayload: (f) => ({ stickyRolesEnabled: f.stickyRolesEnabled }),
  },

  activityLog: {
    toForm: (s) => ({
      eventLogEnabled: s.eventLogEnabled || false,
      eventLogChannelId: s.eventLogChannelId || "",
      ...Object.fromEntries(LOG_CATEGORIES.flatMap((cat) => [
        [`eventLogCat_${cat}`, (s.eventLogCategories || []).includes(cat)],
        // v37 — по избор СВОЙ канал за всяка категория (празно = общият канал).
        [`eventLogCh_${cat}`, s.eventLogChannels?.[cat] || ""],
      ])),
    }),
    toPayload: (f) => ({
      eventLogEnabled: f.eventLogEnabled,
      eventLogChannelId: f.eventLogChannelId || null,
      eventLogCategories: LOG_CATEGORIES.filter((cat) => f[`eventLogCat_${cat}`]),
      // Канал само за ВКЛЮЧЕНИ категории с попълнена стойност — иначе изключена
      // категория би оставила висящ канал в базата.
      eventLogChannels: Object.fromEntries(
        LOG_CATEGORIES
          .filter((cat) => f[`eventLogCat_${cat}`] && (f[`eventLogCh_${cat}`] || "").trim())
          .map((cat) => [cat, f[`eventLogCh_${cat}`].trim()]),
      ),
    }),
  },
};

/** Формата за частите `keys`, попълнена от сървъра. */
export function buildForm(server, keys) {
  return Object.assign({}, ...keys.map((k) => SECTIONS[k].toForm(server)));
}

/** Тялото за `PUT /servers/:id` — само полетата на частите `keys`. */
export function buildPayload(form, server, keys) {
  return Object.assign({}, ...keys.map((k) => SECTIONS[k].toPayload(form, server)));
}
