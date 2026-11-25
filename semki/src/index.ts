// Един процес: Discord ботът, цикълът на известията и дашбордът.
import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.js';
import { registerGuildCommands } from './discord/commands.js';
import { createAlertSender, createGuildDirectory } from './discord/guild.js';
import { createInteractionHandler } from './discord/interactions.js';
import { createLogger } from './log.js';
import { createNotifier } from './services/notifier.js';
import { createWebApp } from './web/app.js';
import type { HealthStatus } from './web/context.js';
import { createDiscordOAuth } from './web/oauth.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL);
  const db = new PrismaClient();

  // Само Guilds: каналите и ролите за дашборда идват от кеша; членовете се питат поотделно по REST.
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const guild = createGuildDirectory(client, config.DISCORD_GUILD_ID);
  const sender = createAlertSender(client, config.DISCORD_GUILD_ID);
  const notifier = createNotifier({ db, sender, log });

  client.on(
    Events.InteractionCreate,
    createInteractionHandler({ db, log, guildId: config.DISCORD_GUILD_ID }),
  );
  client.on(Events.Error, (err) => log.error({ err }, 'грешка от Discord клиента'));
  let commands: 'pending' | 'ok' | 'failed' = 'pending';
  client.once(Events.ClientReady, async (ready) => {
    log.info({ bot: ready.user.tag }, 'ботът е свързан');
    if (!ready.guilds.cache.has(config.DISCORD_GUILD_ID)) {
      log.error(
        { guildId: config.DISCORD_GUILD_ID },
        'ботът не е в гилдията от DISCORD_GUILD_ID — покани го',
      );
    }
    try {
      const n = await registerGuildCommands(
        config.DISCORD_TOKEN,
        config.DISCORD_CLIENT_ID,
        config.DISCORD_GUILD_ID,
      );
      commands = 'ok';
      log.info({ commands: n }, 'slash командите са регистрирани');
    } catch (err) {
      commands = 'failed';
      log.error({ err }, 'slash командите не се регистрираха');
    }
    notifier.start(config.ALERT_TICK_SECONDS * 1000);
  });

  const app = createWebApp({
    db,
    guild,
    sender,
    log,
    oauth: createDiscordOAuth({
      clientId: config.DISCORD_CLIENT_ID,
      clientSecret: config.DISCORD_CLIENT_SECRET,
      redirectUri: `${config.PUBLIC_BASE_URL}/auth/callback`,
    }),
    publicBaseUrl: config.PUBLIC_BASE_URL,
    sessionSecret: config.SESSION_SECRET,
    trustProxy: config.TRUST_PROXY,
    async health() {
      let dbOk = false;
      try {
        await db.$queryRaw`SELECT 1`;
        dbOk = true;
      } catch (err) {
        log.warn({ err }, 'health: базата не отговаря');
      }
      let discord: HealthStatus['discord'] = 'connecting';
      if (client.isReady() && !guild.ready()) discord = 'no-guild';
      else if (commands === 'failed') discord = 'commands-failed';
      else if (client.isReady() && commands === 'ok') discord = 'ready';
      return { db: dbOk, discord };
    },
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(config.PORT, config.HOST, () => resolve(s));
  });
  log.info({ host: config.HOST, port: config.PORT }, 'дашбордът слуша');

  let stopping = false;
  async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'спиране');
    notifier.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await client.destroy();
    await db.$disconnect();
    process.exit(0);
  }
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      shutdown(signal).catch((err: unknown) => {
        log.error({ err }, 'спирането се провали');
        process.exit(1);
      });
    });
  }
  process.on('unhandledRejection', (err) => log.error({ err }, 'необработен Promise'));

  // Грешен токен е фатален: контейнерът пада и логът казва защо, вместо да виси без бот.
  await client.login(config.DISCORD_TOKEN);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`semki: стартът се провали — ${message}\n`);
  process.exit(1);
});
