// bot/src/utils/colors.js
// Единна цветова палитра за всички embed-и на бота. Преди това цветовете
// бяха разпилени литерали (0x00e5ff, 0x57f287, 0x4ade80…) навсякъде — сменяш
// брандинга на едно място вместо да grep-ваш 70 файла.
export const BRAND   = 0x8fe600; // Supreme Bot brand — неоново зелено (2026 ребранд)
export const SUCCESS = 0x57f287; // Одобрено / отворено / завършено успешно
export const DANGER  = 0xed4245; // Затворено / изтрито / грешка / отказ
export const WARNING = 0xfbbf24; // Потвърждение / внимание / чакащо действие
export const INFO    = 0x5865f2; // Discord blurple — вторична информация
export const MUTED   = 0x9ca3af; // Неактивно / приключило (затворена анкета, изтеглена лотария)

/**
 * Слага брандиран footer на embed — "Supreme Bot", освен ако сървърът е на
 * white-label клиентски бот (client.isWhiteLabel), в който случай не бранди-
 * раме чуждия бот с нашето име.
 *
 * @param {import("discord.js").EmbedBuilder} embed
 * @param {import("discord.js").Client} client
 */
export function withFooter(embed, client) {
  if (client?.isWhiteLabel) return embed;
  const existing = embed.data?.footer?.text;
  embed.setFooter({ text: existing ? `${existing} · Supreme Bot` : "Supreme Bot" });
  return embed;
}
