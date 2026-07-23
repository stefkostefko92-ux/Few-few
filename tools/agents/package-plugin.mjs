#!/usr/bin/env node
// package-plugin.mjs — пакетира флота като Claude Code PLUGIN (преносим, инсталируем).
// Схема проверена срещу живата док (code.claude.com/docs/en/plugins-reference + plugin-marketplaces,
// 2026-07-23): .claude-plugin/plugin.json (задължително само `name`), компонентните папки в plugin
// ROOT; marketplace.json {name, owner, plugins[{name, source}]}.
//
// ТВЪРДО ОГРАНИЧЕНИЕ (по сигурност, от самата платформа): plugin-агентите НЕ носят hooks/
// mcpServers/permissionMode → паметният цикъл (SubagentStart/Stop hooks) НЕ пътува с plugin-а.
// Пакетираме ДЕФИНИЦИИ + SKILLS; hook-слоят остава проектен (.claude/settings.json).
//
//   node tools/agents/package-plugin.mjs           # сглобява dist/carbon-stealth-fleet/
//   node tools/agents/package-plugin.mjs --check   # само валидира, без запис (за CI)
//
// dist/ е извън git (генерира се при нужда) — комитнат билд артефакт е дрейф-магнит.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(ROOT, "dist", "carbon-stealth-fleet");
const CHECK = process.argv.includes("--check");

// Какво влиза: агентски дефиниции (без _* и README — те са проектни) + нашите skills.
export function collectPluginAssets() {
  const agents = readdirSync(join(ROOT, ".claude", "agents"))
    .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md");
  const skills = readdirSync(join(ROOT, ".claude", "skills"))
    .filter((d) => { try { return statSync(join(ROOT, ".claude", "skills", d)).isDirectory(); } catch { return false; } });
  return { agents, skills };
}

export function manifest(counts) {
  return {
    name: "carbon-stealth-fleet",
    version: "1.0.0",
    description: `Агентският флот на Carbon Stealth VCC — ${counts.agents} специализирани агента (BG) + ${counts.skills} workflow skills. Паметният слой (hooks) е проектен и НЕ пътува с plugin-а — виж README.`,
    author: { name: "Carbon Stealth VCC" },
  };
}

function main() {
  const a = collectPluginAssets();
  if (!a.agents.length) { console.error("✗ нула агентски дефиниции — грешен корен?"); process.exit(1); }
  console.log(`plugin: ${a.agents.length} агента + ${a.skills.length} skills${CHECK ? " (само проверка)" : ""}`);
  if (CHECK) { console.log("✓ package-plugin --check: активите са налични, схемата е сглобяема."); process.exit(0); }

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(join(DIST, ".claude-plugin"), { recursive: true });
  writeFileSync(join(DIST, ".claude-plugin", "plugin.json"), JSON.stringify(manifest({ agents: a.agents.length, skills: a.skills.length }), null, 2) + "\n");
  mkdirSync(join(DIST, "agents"), { recursive: true });
  for (const f of a.agents) cpSync(join(ROOT, ".claude", "agents", f), join(DIST, "agents", f));
  mkdirSync(join(DIST, "skills"), { recursive: true });
  for (const d of a.skills) cpSync(join(ROOT, ".claude", "skills", d), join(DIST, "skills", d), { recursive: true });
  writeFileSync(join(DIST, "README.md"), [
    "# Carbon Stealth Fleet (plugin)",
    "",
    "Генериран от `tools/agents/package-plugin.mjs` — НЕ редактирай на ръка.",
    "⚠ Паметният цикъл (SubagentStart/Stop hooks) не пътува с plugin (платформено ограничение);",
    "инсталиращият проект си носи свой hook слой или ползва дефинициите без памет.",
  ].join("\n") + "\n");
  // Marketplace манифест — репото може да е собствен marketplace (source = локалният път на plugin-а).
  writeFileSync(join(ROOT, "dist", "marketplace.json"), JSON.stringify({
    name: "carbon-stealth",
    owner: { name: "Carbon Stealth VCC" },
    plugins: [{ name: "carbon-stealth-fleet", source: "./carbon-stealth-fleet", description: "27-агентният флот + skills (BG)" }],
  }, null, 2) + "\n");
  console.log(`✓ сглобен: dist/carbon-stealth-fleet (+ dist/marketplace.json). Инсталация: /plugin marketplace add <път-до-dist>`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
