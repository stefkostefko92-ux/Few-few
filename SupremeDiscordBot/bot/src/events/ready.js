// bot/src/events/ready.js
import { REST, Routes, Events } from "discord.js";
import crypto from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";

const COMMAND_HASH_FILE = "/tmp/supreme-bot-commands.hash";

export default {
  // Events.ClientReady (v15 преименува "ready" → "clientReady"); използваме
  // енума за forward-compatibility. В v14 стойността му е "ready".
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity("Managing Tickets & Applications", { type: 3 });

    // ─── Auto-deploy slash commands if they changed since last startup ─────
    try {
      const commands = [...client.commands.values()]
        .map((c) => c.data.toJSON())
        .sort((a, b) => a.name.localeCompare(b.name));

      const currentHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(commands))
        .digest("hex");

      const lastHash = existsSync(COMMAND_HASH_FILE)
        ? readFileSync(COMMAND_HASH_FILE, "utf8").trim()
        : "";

      if (currentHash === lastHash) {
        console.log(`[CommandSync] ${commands.length} commands unchanged, skipping re-deploy`);
        return;
      }

      console.log(`[CommandSync] Deploying ${commands.length} slash commands to Discord…`);
      const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands }
      );
      writeFileSync(COMMAND_HASH_FILE, currentHash);
      console.log(`[CommandSync] ✅ ${commands.length} commands deployed globally`);
      console.log("[CommandSync] Note: global commands can take up to 1 hour to appear in Discord UI");
    } catch (err) {
      console.error("[CommandSync] Failed to deploy commands:", err.message);
    }
  },
};
