// bot/src/events/messageReactionAdd.js
// v33 — Reaction Roles: react → дай ролята. При exclusive (radio) режим маха
// другите роли от същото съобщение + другите реакции на потребителя.
// Изисква GuildMessageReactions intent + Partials.Message/Reaction (index.js).
import { Events } from "discord.js";
import { emojiMatches, findPair, getRrmForMessage, isRoleSafeToSelfAssign, markBotRemoval } from "../utils/reactionRoles.js";

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

      // Собственото емоджи се разпознава по id (З5), не по „име:id“.
      const pair = findPair(rrm, reaction.emoji);
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
        // Белегът казва на messageReactionRemove, че махането е НАШЕ: то не бива
        // да свали роля, която човекът има по друг начин (З4).
        markBotRemoval(message.id, user.id, pair.id);
        await reaction.users.remove(user.id).catch(() => {});
        return;
      }

      // Първо добавяме новата роля; чак при успех маха старите (З4). Преди това
      // старата се сваляше първа и при провал на добавянето човекът оставаше
      // без нито една роля.
      let added = true;
      await member.roles.add(pair.roleId, "Reaction role").catch((err) => {
        // Най-честата причина: ролята е над ролята на бота или липсва
        // ManageRoles — логваме еднократно разбираемо, без да крашим.
        added = false;
        console.warn(`[ReactionRoles] add role ${pair.roleId} failed: ${err?.message}`);
      });
      if (!added) return;

      // Exclusive (radio): една роля от съобщението наведнъж. Роля, която ботът
      // не би дал (опасна/над бота), не се пипа и тук — ботът не пипа такива роли.
      if (rrm.exclusive) {
        for (const other of rrm.pairs) {
          if (other.id === pair.id || !member.roles.cache.has(other.roleId)) continue;
          const otherRole = message.guild.roles.cache.get(other.roleId) || null;
          if (!isRoleSafeToSelfAssign(otherRole, botMember)) continue;
          await member.roles.remove(other.roleId, "Reaction role (exclusive swap)").catch(() => {});
        }
        // Махни другите реакции на този потребител върху същото съобщение.
        // Белегът пази от второ, ненужно сваляне на роля при върнатото събитие.
        for (const r of message.reactions.cache.values()) {
          const other = findPair(rrm, r.emoji);
          if (other && other.id !== pair.id && !emojiMatches(pair.emoji, r.emoji)) {
            markBotRemoval(message.id, user.id, other.id);
            await r.users.remove(user.id).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error("[ReactionRoles] add handler error:", err?.message);
    }
  },
};
