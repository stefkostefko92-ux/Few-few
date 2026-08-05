// bot/src/services/clientManager.js
// Manages multiple Discord.js Client instances for white-label bots.
// Each Premium server with a custom bot token gets its own dedicated client.
// The main client (BOT_TOKEN) handles all non-custom servers.
//
// v1.4 rewrite: drops the fragile `mainClient._events.interactionCreate` hack
// and directly loads event modules into white-label clients, the same way
// the main client does. This is robust across Discord.js internal changes.

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";
import { readdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import api from "../utils/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Map: serverId → Discord.js Client instance
const customClients = new Map();

// Lazily-loaded event module list (loaded once on first boot)
let cachedEvents = null;

const SHARED_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  // Привилегирован intent (1<<15): нужен за четене на съдържанието на съобщения
  // в тикет каналите (логване на диалога + AI auto-reply). Без него content идва
  // празен. Включва се в Dev Portal на всеки white-label бот; review при 10000+.
  GatewayIntentBits.MessageContent,
  // Привилегирован intent (1<<1): нужен за разрешаване на ролите на члена при
  // authz/verification и за GuildMember събития. Dev Portal + review при 10000+.
  GatewayIntentBits.GuildMembers,
  // Непривилегирован intent (1<<7): Server Event Logging на гласови действия
  // (voiceStateUpdate). Без него white-label ботът не вижда VOICE_STATE_UPDATE.
  GatewayIntentBits.GuildVoiceStates,
  // Непривилегирован intent (1<<2): Server Event Logging на модерация
  // (guildBanAdd/Remove). Без него white-label ботът не вижда GUILD_BAN_*.
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.DirectMessages,
  // Непривилегирован intent (1<<10): Reaction Roles (v33) — без него
  // white-label ботът не получава messageReactionAdd/Remove.
  GatewayIntentBits.GuildMessageReactions,
];

/**
 * Load and cache all event modules from /events. Each module exports
 * { name, once, execute }. We use the same set as the main client.
 */
async function loadEventModules() {
  if (cachedEvents) return cachedEvents;
  const eventsDir = join(__dirname, "..", "events");
  // Skip ready.js: it syncs global commands for the MAIN application and
  // writes a shared hash file — running it per white-label client redeploys
  // the main bot's commands once per custom client and races the hash file.
  // clientManager registers guild commands for custom clients itself.
  // Skip entitlement*.js: Discord monetization SKUs belong to the MAIN
  // application only — custom bot apps never receive entitlements for our
  // SKUs, so wiring these on white-label clients is dead (and noisy) coupling.
  const files = readdirSync(eventsDir).filter(
    (f) => f.endsWith(".js") && f !== "ready.js" && !f.startsWith("entitlement")
  );
  const events = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(eventsDir, file)).href);
    if (mod.default?.name && mod.default?.execute) events.push(mod.default);
  }
  cachedEvents = events;
  return events;
}

/**
 * Create a Client, attach all event modules, copy command collection,
 * and return the still-unlogged-in instance.
 */
async function createConfiguredClient(mainClient) {
  const client = new Client({
    intents: SHARED_INTENTS,
    // Message + Reaction + User partials: Reaction Roles (v33) върху некеширани
    // съобщения/потребители — виж същия коментар в bot/src/index.js
    // (Partials.User е нужен, за да се емитва messageReactionRemove).
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
  });

  // Share command collection (it's read-only after startup)
  client.commands = mainClient.commands;

  // Mark as a white-label client — a separate Discord application that does
  // NOT own the main bot's SKUs. Utils (e.g. sendPremiumRequired) check this
  // to avoid sending native premium buttons with a foreign sku_id.
  client.isWhiteLabel = true;

  // Attach every event handler the main client has
  const events = await loadEventModules();
  for (const ev of events) {
    const fn = (...args) => ev.execute(...args);
    if (ev.once) client.once(ev.name, fn);
    else         client.on(ev.name, fn);
  }

  // Low-level error protection — never crash the process over a white-label hiccup
  client.on("error", (err) => {
    console.error(`[ClientManager] client error:`, err?.message || err);
  });
  client.on("shardError", (err) => {
    console.error(`[ClientManager] shard error:`, err?.message || err);
  });

  return client;
}

/**
 * Boot a white-label client for a specific server.
 * Fetches the decrypted token from the backend, logs in, registers commands
 * under the white-label bot's own application ID.
 */
export async function bootCustomClient(serverId, mainClient) {
  // Already running — reuse
  const existing = customClients.get(serverId);
  if (existing?.isReady()) return existing;

  try {
    // Fetch decrypted token via the bot-secret-protected endpoint
    const { data } = await api.get(`/bot/server/${serverId}/token`);
    if (!data?.token) {
      console.log(`[ClientManager] No custom token for ${serverId} — skipping`);
      return null;
    }

    const client = await createConfiguredClient(mainClient);

    // Register slash commands once the client is ready
    client.once("ready", async () => {
      console.log(`🤖 White-label ready for ${serverId}: ${client.user.tag}`);

      const commands = [...mainClient.commands.values()].map((c) => c.data.toJSON());
      try {
        const rest = new REST().setToken(data.token);
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, serverId),
          { body: commands }
        );
        console.log(`   ↳ ${commands.length} slash commands registered for ${serverId}`);
      } catch (err) {
        console.error(`[ClientManager] Command registration failed for ${serverId}:`, err?.message);
      }
    });

    await client.login(data.token);
    customClients.set(serverId, client);
    return client;
  } catch (err) {
    // Common: Invalid token (revoked), Used token (bot already running elsewhere), DisallowedIntents
    console.error(`[ClientManager] boot failed for ${serverId}: ${err?.code || ""} ${err?.message}`);
    return null;
  }
}

/**
 * Shut down and remove the custom client for a server.
 * Called when a server downgrades from Premium or removes their custom token,
 * or when the bot is kicked from the guild.
 */
export async function shutdownCustomClient(serverId) {
  const client = customClients.get(serverId);
  if (!client) return;

  try {
    await client.destroy();
    console.log(`[ClientManager] shut down white-label for ${serverId}`);
  } catch (err) {
    console.error(`[ClientManager] shutdown error for ${serverId}:`, err?.message);
  }

  customClients.delete(serverId);
}

/**
 * Restart the client for a server — used when the admin updates the bot token.
 * Atomic: old client is destroyed only after the new one successfully logs in.
 */
export async function restartCustomClient(serverId, mainClient) {
  await shutdownCustomClient(serverId);
  return bootCustomClient(serverId, mainClient);
}

/**
 * Get the appropriate client for a given guild.
 * Returns the custom client if one is ready, otherwise the main client.
 */
export function getClientForGuild(guildId, mainClient) {
  const custom = customClients.get(guildId);
  return custom?.isReady() ? custom : mainClient;
}

/**
 * On startup, boot all white-label clients for Premium servers with a custom token.
 * Runs in batches to avoid hitting Discord's identify rate limit.
 */
export async function bootAllCustomClients(mainClient) {
  try {
    const { data: servers } = await api.get("/bot/servers/with-custom-tokens");
    if (!servers?.length) {
      console.log(`[ClientManager] no white-label servers to boot`);
      return;
    }

    console.log(`[ClientManager] booting ${servers.length} white-label client(s)...`);

    // Batch with a pause between batches (Discord allows ~1 identify/5s per token but
    // different tokens are independent — still be polite)
    const BATCH = 5;
    for (let i = 0; i < servers.length; i += BATCH) {
      const batch = servers.slice(i, i + BATCH);
      await Promise.allSettled(batch.map((s) => bootCustomClient(s.id, mainClient)));
      if (i + BATCH < servers.length) {
        await new Promise((r) => setTimeout(r, 2000)); // 2s pause between batches
      }
    }

    const ok = [...customClients.values()].filter((c) => c.isReady()).length;
    console.log(`[ClientManager] white-label clients online: ${ok}/${servers.length}`);
  } catch (err) {
    // Non-fatal: main bot still works even if white-label boot fails
    console.error("[ClientManager] bootAll failed:", err?.message);
  }
}

/**
 * Graceful shutdown of all white-label clients (called on SIGTERM/SIGINT).
 */
export async function shutdownAllCustomClients() {
  const ids = [...customClients.keys()];
  if (!ids.length) return;
  console.log(`[ClientManager] shutting down ${ids.length} white-label client(s)...`);
  await Promise.allSettled(ids.map((id) => shutdownCustomClient(id)));
}

export { customClients };
