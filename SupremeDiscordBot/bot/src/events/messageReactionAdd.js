// bot/src/events/messageReactionAdd.js
// v33 — Reaction Roles: react → дай ролята. При exclusive (radio) режим маха
// другите роли от същото съобщение + другите реакции на потребителя.
// Изисква GuildMessageReactions intent + Partials.Message/Reaction (index.js).
import { Events } from "discord.js";
import { emojiKey, getRrmForMessage } from "../utils/reactionRoles.js";

export default {
  name: Events.MessageReactionAdd,
  once: false,
  async execute(reaction, user) {
    try {
      if (user.bot) return;

      // Partials: съобщението може да не е в кеша (реакция върху стар пост).
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
