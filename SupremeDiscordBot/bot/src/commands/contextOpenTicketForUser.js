// bot/src/commands/contextOpenTicketForUser.js
// v2.9 — User → "Open ticket for user" context menu. Staff-only (checked in
// the handler, since Discord's static default-member-permissions can't
// express "ManageMessages OR this server's dynamic support role").
import { ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";
import { handleOpenTicketForUserContextMenu } from "../events/interactionCreate.js";
import { CMD_NAME_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new ContextMenuCommandBuilder()
    .setName("Open ticket for user")
    .setNameLocalizations(CMD_NAME_L10N["Open ticket for user"])
    .setType(ApplicationCommandType.User),

  async execute(interaction) {
    await handleOpenTicketForUserContextMenu(interaction);
  },
};
