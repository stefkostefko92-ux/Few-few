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
  Events,
  Guild,
} from "discord.js";
import { readdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import api from "../utils/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Ключалки срещу едновременни boot-ове за един и същ сървър.
const bootLocks = new Map(); // serverId → Promise<Client|null>

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
// ─── Обвързване с наетия guild (H1, решение на собственика 07.08.2026) ───────
// White-label клиентът се вдига ЗА ЕДИН сървър — този, за който е платено. Но
// event handler-ите се закачаха глобално и действаха по guild-а от самото
// събитие. Значи собственикът на custom бота можеше да го покани навсякъде и
// нашата инфраструктура обслужваше неограничено сървъри срещу един абонамент
// (а guildCreate дори ги регистрираше като нови безплатни сървъри).
//
// Избраното поведение: клиентът работи САМО в обвързания guild; събития от
// другаде се пропускат с еднократно предупреждение на guild.
function guildIdFromArgs(args) {
  for (const a of args) {
    if (!a) continue;
    if (a instanceof Guild) return a.id;
    if (typeof a.guildId === "string") return a.guildId;
    if (a.guild?.id) return a.guild.id;
    if (a.message?.guild?.id) return a.message.guild.id;   // MessageReaction
    if (typeof a.first === "function") {                   // Collection (bulk delete)
      const f = a.first();
      if (f?.guild?.id) return f.guild.id;
      if (typeof f?.guildId === "string") return f.guildId;
    }
  }
  return null; // DM / не може да се определи → не блокираме (form сесиите живеят в DM)
}

const warnedForeign = new Set(); // `${serverId}:${guildId}` — по едно предупреждение

async function createConfiguredClient(mainClient, boundServerId) {
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
    const fn = (...args) => {
      const gid = guildIdFromArgs(args);
      if (boundServerId && gid && gid !== boundServerId) {
        const key = `${boundServerId}:${gid}`;
        if (!warnedForeign.has(key)) {
          warnedForeign.add(key);
          console.warn(
            `[white-label] клиентът на ${boundServerId} получи събитие от НЕОБВЪРЗАН guild ${gid} — пропускам (лицензът покрива един сървър)`,
          );
        }
        return undefined;
      }
      return ev.execute(...args);
    };
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
export async function bootCustomClient(serverId, mainClient, { force = false } = {}) {
  // Already running — reuse. ОСВЕН при force: рестартът след смяна на токена
  // минаваше точно оттук и връщаше СТАРИЯ жив клиент, тоест новият токен
  // никога не влизаше в сила, а таблото рапортуваше успех.
  // (Качествения, 07.08.2026)
  const existing = customClients.get(serverId);
  if (!force && existing?.isReady()) return existing;

  // Ключалка срещу check-then-act: два едновременни boot-а (напр. ready
  // реконсилиация + ръчен рестарт) създаваха ДВА клиента за един сървър —
  // единият оставаше завинаги без референция и течеше gateway сесия.
  const inFlight = bootLocks.get(serverId);
  if (inFlight) return inFlight;

  const promise = (async () => {
  try {
    // Fetch decrypted token via the bot-secret-protected endpoint
    const { data } = await api.get(`/bot/server/${serverId}/token`);
    if (!data?.token) {
      // Няма токен — планът е спрян или админът го е изтрил. Работещият клиент
      // трябва да СЛЕЗЕ, иначе white-label ботът продължава да обслужва сървър,
      // за който вече не се плаща.
      if (customClients.has(serverId)) {
        console.log(`[ClientManager] токенът за ${serverId} вече го няма — свалям работещия клиент`);
        await shutdownCustomClient(serverId);
      } else {
        console.log(`[ClientManager] No custom token for ${serverId} — skipping`);
      }
      return null;
    }

    const client = await createConfiguredClient(mainClient, serverId);

    // Register slash commands once the client is ready
    client.once(Events.ClientReady, async () => {
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
  })();

  bootLocks.set(serverId, promise);
  try {
    return await promise;
  } finally {
    bootLocks.delete(serverId);
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
 * НАИСТИНА атомарно: вдигаме НОВИЯ клиент пръв и сваляме стария ЕДВА след
 * успешен login. Ако новият токен е невалиден (boot връща null), пазим стария
 * работещ клиент — иначе грешен токен сваляше напълно работещ white-label бот
 * офлайн (одит HIGH). bootCustomClient презаписва customClients при успех, а
 * при провал картата остава на стария клиент.
 */
export async function restartCustomClient(serverId, mainClient) {
  const old = customClients.get(serverId);
  // force: без него boot-ът вижда живия клиент и връща него — новият токен
  // никога не влизаше в сила.
  const fresh = await bootCustomClient(serverId, mainClient, { force: true });
  if (fresh) {
    // Новият е онлайн → чак сега махаме стария (ако е различна инстанция).
    if (old && old !== fresh) {
      try { await old.destroy(); } catch (err) { console.error(`[ClientManager] old client destroy for ${serverId}:`, err?.message); }
    }
    return fresh;
  }
  // Новият токен не тръгна → НЕ оставяй сървъра без бот; старият продължава.
  console.warn(`[ClientManager] restart за ${serverId}: новият токен не тръгна — пазя работещия стар клиент`);
  return old || null;
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
 * Реконсилиация: приведи РАБОТЕЩИТЕ white-label клиенти в съответствие с това
 * КОИ сървъри имат право на white-label бот СЕГА.
 *
 * ЗАЩО СЪЩЕСТВУВА (одит 07.08.2026): white-label клиентът се вдигаше при старт
 * (`bootAllCustomClients`) и се сваляше само когато токенът се смени
 * (`WHITELABEL_UPDATE` от servers.js). Но tier може да падне по НАПЪЛНО ДРУГИ
 * пътища, които не пипат токена: махане на сървър от agency seat, отмяна/refund/
 * chargeback на агенцията, дунинг деактивация, изтичане на grace. По всички тях
 * `customBotToken` си остава в базата — сменя се само ЕФЕКТИВНИЯТ план. Резултат:
 * бранд ботът продължаваше да обслужва сървър, който вече не плаща за него, до
 * следващ рестарт на процеса (при стабилен контейнер — месеци).
 *
 * `/bot/servers/with-custom-tokens` е единственият източник на истина за „кой
 * трябва да върви“ (гейтва на ефективния tier, не на суровата колона). Тук само
 * караме работещото множество да съвпадне с него: вдигаме липсващите, сваляме
 * излишните. Идемпотентно — безопасно е да се вика колкото често искаш.
 *
 * Огледало на `runEntitlementReconcile` за Discord монетизацията: Discord/Stripe
 * не преизпращат всяко събитие, затова периодичната метла е това, което лови
 * пропуснатото.
 */
export async function reconcileCustomClients(mainClient) {
  let eligible;
  try {
    const { data } = await api.get("/bot/servers/with-custom-tokens");
    eligible = new Set((data || []).map((s) => s.id));
  } catch (err) {
    // Fail-closed срещу ГРЕШНО сваляне: ако backend-ът е недостъпен, НЕ приемаме
    // „нула права“ и не сваляме живи клиенти. По-добре временно надживял клиент,
    // отколкото да свалим всички бранд ботове заради мрежов трепет.
    console.error("[ClientManager] reconcile: backend недостъпен — пропускам:", err?.message);
    return { booted: 0, shutDown: 0, skipped: true };
  }

  let shutDown = 0;
  // 1) Свали работещи клиенти, които вече НЯМАТ право.
  for (const serverId of [...customClients.keys()]) {
    if (!eligible.has(serverId)) {
      console.log(`[ClientManager] reconcile: ${serverId} вече няма white-label tier — свалям`);
      await shutdownCustomClient(serverId);
      shutDown++;
    }
  }

  // 2) Вдигни имащи право, които не вървят (напр. seat закачен без смяна на токен).
  let booted = 0;
  const toBoot = [...eligible].filter((id) => !customClients.get(id)?.isReady());
  const BATCH = 5;
  for (let i = 0; i < toBoot.length; i += BATCH) {
    const batch = toBoot.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((id) => bootCustomClient(id, mainClient)));
    booted += results.filter((r) => r.status === "fulfilled" && r.value).length;
    if (i + BATCH < toBoot.length) await new Promise((r) => setTimeout(r, 2000));
  }

  if (shutDown || booted) {
    console.log(`[ClientManager] reconcile: вдигнати ${booted}, свалени ${shutDown}`);
  }
  return { booted, shutDown, skipped: false };
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
