// bot/src/utils/permissionCheck.js
// Единна проверка на бот-правата — ползвана от /debug и от welcome embed-а
// (guildCreate), за да не се разминават двата списъка.
import { PermissionsBitField } from "discord.js";

// Права, нужни за тикет операциите (канали, роли, съобщения, thread-ове).
export const REQUIRED_PERMISSIONS = [
  { flag: PermissionsBitField.Flags.ViewChannel, name: "View Channels" },
  { flag: PermissionsBitField.Flags.SendMessages, name: "Send Messages" },
  { flag: PermissionsBitField.Flags.ManageChannels, name: "Manage Channels" },
  { flag: PermissionsBitField.Flags.ManageRoles, name: "Manage Roles" },
  { flag: PermissionsBitField.Flags.ManageMessages, name: "Manage Messages" },
  { flag: PermissionsBitField.Flags.EmbedLinks, name: "Embed Links" },
  { flag: PermissionsBitField.Flags.AttachFiles, name: "Attach Files" },
  { flag: PermissionsBitField.Flags.ReadMessageHistory, name: "Read Message History" },
  { flag: PermissionsBitField.Flags.CreatePrivateThreads, name: "Create Private Threads" },
  { flag: PermissionsBitField.Flags.ManageThreads, name: "Manage Threads" },
  // Беше в числото за поканата, но липсваше в списъка — тоест /debug и welcome
  // embed-ът обявяваха „всички права са налице“ на сървър, на който ботът не
  // може да пише в собствения си private-thread тикет. Дрейфът излезе, когато
  // тест започна да сверява сумата на списъка с числото.
  { flag: PermissionsBitField.Flags.SendMessagesInThreads, name: "Send Messages in Threads" },
  // Server Activity Logging: БЕЗ това право fetchAuditLogs хвърля „Missing
  // Permissions", нашите резолвъри го гълтат тихо (fail-safe) и полето „Actor“
  // НИКОГА не се появява — тоест „кой изрита / кой премести / кой смени
  // правата" мълчи по целия лог. Само четене на одитния дневник; не дава
  // никакво действие.
  { flag: PermissionsBitField.Flags.ViewAuditLog, name: "View Audit Log" },
];

// Same bits, as an integer — used to build the re-invite URL (matches the
// permissions above; keep in sync if REQUIRED_PERMISSIONS changes).
// 361045814288 (без одитния дневник) | 1<<7 = 361045814416.
export const INVITE_PERMISSIONS_INT = 361045814416;

/**
 * @param {import("discord.js").Guild} guild
 * @returns {{ me: import("discord.js").GuildMember, results: {name:string,has:boolean}[], missing: {name:string,has:boolean}[] }}
 */
export function checkBotPermissions(guild) {
  const me = guild.members.me;
  const perms = me.permissions;
  const results = REQUIRED_PERMISSIONS.map((r) => ({ name: r.name, has: perms.has(r.flag) }));
  const missing = results.filter((r) => !r.has);
  return { me, results, missing };
}

/**
 * Re-invite линк с пълния набор права — за welcome embed-а и /debug, когато
 * липсват права (не искаме потребителят да гадае кои permission checkbox-и).
 */
export function reinviteUrl(clientId) {
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${INVITE_PERMISSIONS_INT}`;
}
