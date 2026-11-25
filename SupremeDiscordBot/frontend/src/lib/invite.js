// frontend/src/lib/invite.js
// Връзката за добавяне на бота — ЕДНО място за числото на правата.
//
// До 12.11.2026 числото беше изписано в шест файла; гейтът
// (backend `discordCompliance.test.js`) сверяваше само един от тях. Същото число
// живее в `bot/src/utils/permissionCheck.js` (INVITE_PERMISSIONS_INT) и в
// `docs/DISCORD_VERIFICATION.md` — тестът пази трите да съвпадат.
//
// 13 права, без Administrator: View Channels, Send Messages, Manage Channels,
// Manage Roles, Manage Messages, Embed Links, Attach Files, Read Message
// History, Create Private Threads, Manage Threads, Send Messages in Threads,
// View Audit Log и Pin Messages (от 2026 закачането е отделно право).
export const INVITE_PERMISSIONS = "2252160859499664";

/** Адресът за добавяне на бота; с `guildId` Discord предлага направо този сървър. */
export function botInviteUrl(guildId = null) {
  const base = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=${INVITE_PERMISSIONS}&scope=bot+applications.commands`;
  return guildId ? `${base}&guild_id=${guildId}` : base;
}
