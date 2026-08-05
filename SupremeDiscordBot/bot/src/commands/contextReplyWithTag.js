// bot/src/commands/contextReplyWithTag.js
// v2.9 — Message → "Reply with tag" context menu. Staff-only; shows a select
// of the top 25 canned responses by usage, posts the chosen one in the channel.
import { ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";
import { handleReplyWithTagContextMenu } from "../events/interactionCreate.js";

export default {
  data: new ContextMenuCommandBuilder()
    .setName("Reply with tag")
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await handleReplyWithTagContextMenu(interaction);
  },
};
