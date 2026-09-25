// bot/src/utils/colors.js
// Единна цветова палитра + общ строител за ВСИЧКИ embed-и на бота.
//
// Защо съществува: цветовете бяха разпилени литерали из 26 файла (0x00e5ff,
// 0x5865f2, 0xffd700, 0x99aab5, две различни червени…) и ботът изглеждаше като
// шест различни бота. По-лошо — 0x00e5ff беше СТАРИЯТ ни циан, който след
// ребранда в зелено вече не съществува никъде другаде. Сега смяната на бранда
// е един файл, а `colors.test.js` гейтва връщането на сурови литерали.
import { EmbedBuilder } from "discord.js";

export const BRAND   = 0x8fe600; // Брандово неоново зелено — неутрални/инфо embed-и
export const SUCCESS = 0x57f287; // Одобрено / отворено / завършено успешно (мента — различима от лаймa)
export const DANGER  = 0xed4245; // Затворено / изтрито / грешка / отказ
export const WARNING = 0xfbbf24; // Потвърждение / внимание / чакащо действие
export const INFO    = 0x2588c5; // Вторична информация (същото синьо като графиките в dashboard-а)
export const MUTED   = 0x9a9a9a; // Неактивно / приключило (затворена анкета, изтеглена лотария)

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

/**
 * Общият строител. Всеки нов embed минава оттук, за да носи еднакъв цвят,
 * footer и timestamp без всеки повикващ да ги помни.
 *
 * @param {object} o
 * @param {string} [o.title]
 * @param {string} [o.description]
 * @param {number} [o.color=BRAND]        стойност ОТ ТОЗИ файл, не литерал
 * @param {Array}  [o.fields]
 * @param {object} [o.author]             { name, iconURL }
 * @param {string} [o.thumbnail]
 * @param {string} [o.image]
 * @param {string} [o.footer]             допълва се с „· Supreme Bot“
 * @param {boolean}[o.timestamp=true]
 * @param {import("discord.js").Client} [o.client] нужен за white-label проверката
 */
export function brandEmbed({
  title, description, color = BRAND, fields, author, thumbnail, image,
  footer, timestamp = true, client,
} = {}) {
  const embed = new EmbedBuilder().setColor(color);
  if (title) embed.setTitle(String(title).slice(0, 256));
  if (description) embed.setDescription(String(description).slice(0, 4096));
  if (Array.isArray(fields) && fields.length) embed.addFields(fields.slice(0, 25));
  if (author?.name) embed.setAuthor({ name: String(author.name).slice(0, 256), iconURL: author.iconURL || undefined });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (footer) embed.setFooter({ text: String(footer).slice(0, 2048) });
  if (timestamp) embed.setTimestamp();
  return withFooter(embed, client);
}

/**
 * Аватар на потребител за author/thumbnail редовете. Без него embed-ите са
 * гол текст в кутия — разликата между „бот“ и „продукт“ в Discord.
 */
export function avatarUrl(user) {
  if (!user) return undefined;
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  if (typeof user.displayAvatarURL === "function") return user.displayAvatarURL({ size: 128 });
  return undefined;
}

/** „name#1234“ за старите акаунти, „name“ за новите. */
export function userTag(user) {
  if (!user) return "Unknown";
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

/** Discord релативен времеви маркер — „преди 3 минути“ на езика на четящия. */
export function relTime(date = new Date()) {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;
}
