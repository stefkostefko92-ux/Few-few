// bot/src/events/messageReactionRemove.js
// v33 — Reaction Roles: махната реакция → махни ролята.
import { Events } from "discord.js";
import { consumeBotRemoval, findPair, getRrmForMessage, isRoleSafeToSelfAssign } from "../utils/reactionRoles.js";

export default {
  name: Events.MessageReactionRemove,
  once: false,
  async execute(reaction, user) {
    try {
      if (user.bot) return;

      // Същият ред като в messageReactionAdd: евтините проверки ПРЕДИ REST-а.
      // Иначе всяка махната реакция върху некеширано съобщение, в който и да е
      // наш guild, струва извикване към Discord. (Разбивача, 07.08.2026)
      const messageId = reaction.message?.id;
      if (!messageId) return;

      const rrm = await getRrmForMessage(messageId);
      if (!rrm) return;

      const pair = findPair(rrm, reaction.emoji);
      if (!pair) return;

      // Махане, направено от самия бот (отказана опасна роля, размяна в режим
      // „една роля“) — не пипаме ролята: човекът може да я има по друг начин (З4).
      if (consumeBotRemoval(messageId, user.id, pair.id)) return;

      if (reaction.partial) {
        reaction = await reaction.fetch().catch(() => null);
        if (!reaction) return;
      }
      const message = reaction.message;
      if (!message?.guildId) return;

      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      // Втори пояс: ботът не пипа роля, която не би дал през реакция (опасна,
      // managed, над бота) — махането на реакцията не е основание да я сваля.
      const role = message.guild.roles.cache.get(pair.roleId)
        || await message.guild.roles.fetch(pair.roleId).catch(() => null);
      if (!isRoleSafeToSelfAssign(role, message.guild.members.me)) return;

      await member.roles.remove(pair.roleId, "Reaction role removed").catch((err) => {
        console.warn(`[ReactionRoles] remove role ${pair.roleId} failed: ${err?.message}`);
      });
    } catch (err) {
      console.error("[ReactionRoles] remove handler error:", err?.message);
    }
  },
};
