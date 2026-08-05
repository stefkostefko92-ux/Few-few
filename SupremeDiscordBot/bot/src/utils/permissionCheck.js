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
];

// Same bits, as an integer — used to build the re-invite URL (matches the
// permissions above; keep in sync if REQUIRED_PERMISSIONS changes).
export const INVITE_PERMISSIONS_INT = 361045814288;

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
