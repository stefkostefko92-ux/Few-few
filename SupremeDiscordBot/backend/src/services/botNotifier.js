// backend/src/services/botNotifier.js
import axios from "axios";

/**
 * Send an event notification to the Discord bot's internal HTTP server.
 * The bot listens on its own port for these webhook-style events.
 * Env vars are read lazily inside the function to ensure dotenv has loaded.
 */
export async function notifyBot(event, data) {
  const BOT_API_URL = process.env.BOT_API_URL || "http://bot:3001"; // docker service name
  const API_SECRET = process.env.API_SECRET;

  if (!API_SECRET) {
    console.error("notifyBot: API_SECRET not set — cannot communicate with bot");
    return null;
  }

  try {
    const res = await axios.post(
      `${BOT_API_URL}/internal/${event.toLowerCase().replace(/_/g, "-")}`,
      data,
      {
        headers: { "x-bot-secret": API_SECRET },
        timeout: 10000,
      }
    );
    return res.data;
  } catch (err) {
    // Log but don't crash — bot might be temporarily offline
    console.error(`Failed to notify bot of event [${event}]:`, err?.response?.data || err.message);
    return null;
  }
}
