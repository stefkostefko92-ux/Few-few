// bot/src/events/guildDelete.js
import api from "../utils/api.js";
import { shutdownCustomClient } from "../services/clientManager.js";

export default {
  name: "guildDelete",
  once: false,
  async execute(guild) {
    // Гардът беше ОБЪРНАТ наопаки. Коментарът твърдеше „прескачаме при срив на
    // Discord", но discord.js изобщо НЕ емитва guildDelete при срив: при
    // data.unavailable маркира guild.available = false, емитва guildUnavailable
    // и се връща (node_modules/discord.js/src/client/actions/GuildDelete.js:12-26).
    //
    // Значи проверката не пазеше от нищо, а внасяше тих пропуск: ако ботът бъде
    // премахнат ДОКАТО guild-ът е маркиран като недостъпен, реалното премахване
    // се прескачаше — botRemovedAt никога не се записваше, сървърът оставаше
    // „активен" в таблото завинаги и (след v38) никога не се изчистваше.
    // (Разбивача, 07.08.2026)

    console.log(`📤 Left guild: ${guild.name} (${guild.id})`);
    try {
      await api.delete(`/bot/server/${guild.id}`);
    } catch (err) {
      console.error("Failed to log bot removal:", err.message);
    }
    // Shut down white-label client even if the API call above failed —
    // otherwise a custom client keeps running for a guild the bot left.
    try {
      await shutdownCustomClient(guild.id);
    } catch (err) {
      console.error("Failed to shut down custom client:", err.message);
    }
  },
};
