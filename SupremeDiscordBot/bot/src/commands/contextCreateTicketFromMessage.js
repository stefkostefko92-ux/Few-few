// bot/src/commands/contextCreateTicketFromMessage.js
// v2.9 — Message → "Create ticket from message" context menu. Thin wrapper:
// all the actual logic (panel lookup, >1-panel picker, createTicketFromPanel
// reuse) lives in events/interactionCreate.js so it shares state with the
// select-menu follow-up (ctxticket_panel:) that same file routes.
import { ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";
import { handleCreateTicketFromMessageContextMenu } from "../events/interactionCreate.js";
import { CMD_NAME_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new ContextMenuCommandBuilder()
    .setName("Create ticket from message")
    .setNameLocalizations(CMD_NAME_L10N["Create ticket from message"])
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await handleCreateTicketFromMessageContextMenu(interaction);
  },
};
