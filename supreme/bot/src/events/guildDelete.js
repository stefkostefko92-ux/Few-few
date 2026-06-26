// bot/src/events/guildDelete.js
import api from "../utils/api.js";
import { shutdownCustomClient } from "../services/clientManager.js";

export default {
  name: "guildDelete",
  once: false,
  async execute(guild) {
    // guild.available is false when Discord outage — skip logging
    if (!guild.available) return;

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
