#!/usr/bin/env node
// sandbox-setup.mjs — включва sandbox-а на Claude Code на машината на собственика (потребителски настройки).
//
// Защо: куките ни (guard-exfil, guard-dangerous, guard-readonly) са наш слой над стандартните примитиви;
// Anthropic („How we contain Claude across products“, 2026-05) препоръчва първо стандартната изолация на
// ниво ОС — sandbox-ът на Bash (bubblewrap на Linux, Seatbelt на macOS) ограничава файловете и мрежата на
// всяка команда, каквото и да реши моделът. В проектните настройки не го слагаме: облачните сесии нямат
// bubblewrap и щяха да останат без Bash. Затова е потребителска настройка — само на машината, която я иска.
//
//   node tools/agents/sandbox-setup.mjs              # показва какво ще се промени (нищо не пише)
//   node tools/agents/sandbox-setup.mjs --strict     # + без „опитай извън sandbox-а“ и спиране, ако не тръгне
//   node tools/agents/sandbox-setup.mjs --apply      # записва ~/.claude/settings.json (с резервно копие)
//   … --settings-file <път>                          # друг файл (за проба)
//
// Сливането само стеснява: добавя забрани и разрешени домейни, никога не маха вече зададено от теб.
// Документация: https://code.claude.com/docs/en/sandboxing.md

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { execFileSync } from "node:child_process";

// Домейните, които нашата работа реално ползва от Bash (git, npm, документацията). Останалото се
// одобрява при нужда — първият опит към нов домейн пита, не минава тихо.
export const ALLOWED_DOMAINS = [
  "github.com", "*.github.com", "codeload.github.com", "*.githubusercontent.com",
  "registry.npmjs.org", "*.npmjs.org",
  "code.claude.com", "docs.anthropic.com", "www.anthropic.com",
];
// Тайните на машината: командите в sandbox-а не ги четат и не ги виждат в средата.
export const CREDENTIAL_FILES = ["~/.ssh", "~/.aws", "~/.config/gh", "~/.netrc", "~/.claude/.credentials.json", "~/.docker/config.json"];
export const CREDENTIAL_ENV = ["GITHUB_TOKEN", "GH_TOKEN", "NPM_TOKEN", "ANTHROPIC_API_KEY", "STRIPE_SECRET_KEY", "DISCORD_TOKEN", "AWS_SECRET_ACCESS_KEY"];

export function buildBlock({ strict = false } = {}) {
  return {
    enabled: true,
    ...(strict ? { allowUnsandboxedCommands: false, failIfUnavailable: true } : {}),
    network: { allowedDomains: [...ALLOWED_DOMAINS] },
    credentials: {
      files: CREDENTIAL_FILES.map((path) => ({ path, mode: "deny" })),
      envVars: CREDENTIAL_ENV.map((name) => ({ name, mode: "deny" })),
    },
  };
}

const union = (a = [], b = []) => [...new Set([...a, ...b])];
const unionBy = (a = [], b = [], key) => {
  const seen = new Set(a.map((x) => x[key]));
  return [...a, ...b.filter((x) => !seen.has(x[key]))];
};

/** Слива нашия блок в съществуващите настройки, без да разхлабва нищо вече зададено. */
export function mergeSandbox(existing = {}, block) {
  const cur = existing.sandbox || {};
  const next = { ...cur, enabled: true };
  // Строгите ключове само затягат: false/true от нас се записва; вече затегнато не се отпуска.
  if (block.allowUnsandboxedCommands === false) next.allowUnsandboxedCommands = false;
  if (block.failIfUnavailable === true) next.failIfUnavailable = true;
  next.network = { ...(cur.network || {}), allowedDomains: union(cur.network?.allowedDomains, block.network.allowedDomains) };
  next.credentials = {
    ...(cur.credentials || {}),
    files: unionBy(cur.credentials?.files, block.credentials.files, "path"),
    envVars: unionBy(cur.credentials?.envVars, block.credentials.envVars, "name"),
  };
  return { ...existing, sandbox: next };
}

/** Липсващите зависимости на Linux (bubblewrap + socat); macOS ползва вградения Seatbelt. */
export function missingDeps(os = platform(), has = (c) => { try { execFileSync("sh", ["-c", `command -v ${c}`], { stdio: "ignore" }); return true; } catch { return false; } }) {
  if (os !== "linux") return [];
  return ["bwrap", "socat"].filter((c) => !has(c));
}

function main(argv) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const file = val("--settings-file") || join(homedir(), ".claude", "settings.json");
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const merged = mergeSandbox(existing, buildBlock({ strict: argv.includes("--strict") }));

  const deps = missingDeps();
  if (deps.length)
    console.log(`⚠ липсват ${deps.join(", ")} — sandbox-ът няма да тръгне. Debian/Ubuntu: sudo apt-get install bubblewrap socat` +
      (argv.includes("--strict") ? "\n  С --strict Claude Code ще спре при старт, докато не ги инсталираш." : "\n  Без --strict командите ще вървят без sandbox, докато не ги инсталираш."));

  console.log(`Файл: ${file}\nНов блок „sandbox“:\n${JSON.stringify(merged.sandbox, null, 2)}`);
  if (!argv.includes("--apply")) { console.log("\n(проба — нищо не е записано; пусни с --apply)"); return; }

  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) {
    const bak = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(file, bak);
    console.log(`резервно копие: ${bak}`);
  }
  writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  console.log("✓ записано. Провери в нова сесия: /sandbox, после помоли Claude да пусне `touch ~/sandbox-probe` — трябва да откаже.");
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
