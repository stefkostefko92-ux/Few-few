// bot/src/events/guildCreate.js
import { registerServer } from "../utils/api.js";

export default {
  name: "guildCreate",
  once: false,
  async execute(guild) {
    console.log(`📥 Joined guild: ${guild.name} (${guild.id})`);
    try {
      await registerServer(guild);
    } catch (err) {
      console.error("Failed to register server:", err.message);
    }
  },
};
