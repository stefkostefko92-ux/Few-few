// bot/src/events/messageReactionAdd.js
// v33 — Reaction Roles: react → дай ролята. При exclusive (radio) режим маха
// другите роли от същото съобщение + другите реакции на потребителя.
// Изисква GuildMessageReactions intent + Partials.Message/Reaction (index.js).
import { Events } from "discord.js";
import { emojiKey, getRrmForMessage, isRoleSafeToSelfAssign } from "../utils/reactionRoles.js";

export default {
  name: Events.MessageReactionAdd,
  once: false,
  async execute(reaction, user) {
    try {
      if (user.bot) return;

      // РЕДЪТ Е СЪЩЕСТВЕН. Досега `reaction.fetch()` (REST заявка) се правеше
      // ПЪРВО, преди кешираната справка — тоест ВСЯКА реакция върху некеширано
      // съобщение, в ВСЕКИ наш guild, включително такива без нито един reaction
      // role, струваше извикване към Discord. Шумен сървър можеше сам да ни
      // изяде лимита и да засегне всички останали клиенти.
      //
      // И id-то на съобщението, и емоджито идват в gateway payload-а дори при
      // partial реакция, затова и двете евтини проверки минават ПРЕДИ fetch-а.
      // (Разбивача, 07.08.2026)
      const messageId = reaction.message?.id;
      if (!messageId) return;

      const rrm = await getRrmForMessage(messageId);
      if (!rrm) return;

      const key = emojiKey(reaction.emoji);
      const pair = rrm.pairs.find((p) => p.emoji === key);
      if (!pair) return;

      // Чак сега — има съвпадение, значи REST заявката е оправдана.
      if (reaction.partial) {
        reaction = await reaction.fetch().catch(() => null);
        if (!reaction) return;
      }
      const message = reaction.message;
      if (!message?.guildId) return;

      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      // Privilege-escalation гард: никога не раздавай роля с опасни права през
      // реакция (виж isRoleSafeToSelfAssign). Резолвваме ролята от guild-а.
      const role = message.guild.roles.cache.get(pair.roleId)
        || await message.guild.roles.fetch(pair.roleId).catch(() => null);
      const botMember = message.guild.members.me;
      if (!isRoleSafeToSelfAssign(role, botMember)) {
        console.warn(`[ReactionRoles] refused unsafe role ${pair.roleId} in guild ${message.guildId} (managed/privileged/above-bot)`);
        // Махни реакцията на потребителя — иначе стои като „работи“, а не дава роля.
        await reaction.users.remove(user.id).catch(() => {});
        return;
      }

      // Exclusive (radio): една роля от съобщението наведнъж.
      if (rrm.exclusive) {
        for (const other of rrm.pairs) {
          if (other.id !== pair.id && member.roles.cache.has(other.roleId)) {
            await member.roles.remove(other.roleId, "Reaction role (exclusive swap)").catch(() => {});
          }
        }
        // Махни другите реакции на този потребител върху същото съобщение —
        // това ще пусне messageReactionRemove, който е идемпотентен (ролята
        // вече е свалена по-горе).
        for (const r of message.reactions.cache.values()) {
          const k = emojiKey(r.emoji);
          if (k !== key && rrm.pairs.some((p) => p.emoji === k)) {
            await r.users.remove(user.id).catch(() => {});
          }
        }
      }

      await member.roles.add(pair.roleId, "Reaction role").catch((err) => {
        // Най-честата причина: ролята е над ролята на бота или липсва
        // ManageRoles — логваме еднократно разбираемо, без да крашим.
        console.warn(`[ReactionRoles] add role ${pair.roleId} failed: ${err?.message}`);
      });
    } catch (err) {
      console.error("[ReactionRoles] add handler error:", err?.message);
    }
  },
};
