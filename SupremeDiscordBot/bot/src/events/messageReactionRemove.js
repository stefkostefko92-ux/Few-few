// bot/src/events/messageReactionRemove.js
// v33 — Reaction Roles: махната реакция → махни ролята.
import { Events } from "discord.js";
import { emojiKey, getRrmForMessage } from "../utils/reactionRoles.js";

export default {
  name: Events.MessageReactionRemove,
  once: false,
  async execute(reaction, user) {
    try {
      if (user.bot) return;

      if (reaction.partial) {
        reaction = await reaction.fetch().catch(() => null);
        if (!reaction) return;
      }
      const message = reaction.message;
      if (!message?.guildId) return;

      const rrm = await getRrmForMessage(message.id);
      if (!rrm) return;

      const key = emojiKey(reaction.emoji);
      const pair = rrm.pairs.find((p) => p.emoji === key);
      if (!pair) return;

      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      await member.roles.remove(pair.roleId, "Reaction role removed").catch((err) => {
        console.warn(`[ReactionRoles] remove role ${pair.roleId} failed: ${err?.message}`);
      });
    } catch (err) {
      console.error("[ReactionRoles] remove handler error:", err?.message);
    }
  },
};
