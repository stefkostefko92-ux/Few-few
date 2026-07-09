// bot/src/deploy-commands.js
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];
const commandFiles = readdirSync(join(__dirname, "commands")).filter((f) => f.endsWith(".js"));

for (const file of commandFiles) {
  const cmd = await import(pathToFileURL(join(__dirname, "commands", file)).href);
  if (cmd.default?.data) {
    commands.push(cmd.default.data.toJSON());
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

console.log(`🔄 Deploying ${commands.length} slash commands...`);

try {
  // Global commands (takes up to 1 hour to propagate)
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
  console.log("✅ Slash commands deployed globally!");

  // For development, deploy to a specific guild instantly:
  // await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DEV_GUILD_ID), { body: commands });
} catch (err) {
  console.error("Failed to deploy commands:", err);
}
