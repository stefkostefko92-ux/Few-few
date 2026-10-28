#!/usr/bin/env node
// guard-readonly.mjs — PreToolUse/Bash: агент без Write/Edit не променя репото през Bash.
//
// Защо (2026-10-27): Кодаджията, Качествения и Разбивача са ревюъри — `tools:` им няма Write/Edit,
// но имат Bash, а с Bash `sed -i`, `>` към файл или `git commit` правят същото като Edit. „Не пипай
// кода“ беше молба в промпта. Документацията на Claude Code: правило без изключения е кука или deny
// правило, не ред в промпта (https://code.claude.com/docs/en/best-practices.md). Ревюър, който не може
// да редактира, е наложен от харнеса — не поискан.
//
// Кой е ревюър: агентът, в който се изпълнява инструментът (`agent_type` в payload-а — харнесът го подава
// за куки в субагенти), чиято дефиниция има Bash, но няма Write/Edit/MultiEdit/NotebookEdit. Не е списък
// на ръка — нов ревюър се покрива сам.
//
// Какво спира: git команди, които пишат (commit, push, reset, checkout …); `sed -i`/`perl -i`; `>`/`>>`/
// `tee` към файл извън /tmp, /dev/null и scratchpad-а; rm/mv/cp/touch/truncate/chmod/ln; `--write`/`--fix`;
// npm/pnpm/yarn, които сменят манифест или lockfile. Позволено: четене, тестове, билдове, `npm ci`.
// Граница: скрипт, който сам пише файл (`node -e "fs.writeFileSync…"`), не се вижда — куките съдят
// извикването, не намерението. Fail-open при собствена грешка (ролева кука, не защита на тайни).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitize } from "./guard-secrets.mjs";
import { codeView } from "./guard-dangerous.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WRITE_TOOLS = /\b(Write|Edit|MultiEdit|NotebookEdit)\b/;

/** Ревюър = дефиниция с Bash и без инструменти за писане. Няма дефиниция → не е наш ревюър. */
export function isReadOnlyAgent(agentType, root = ROOT) {
  if (!agentType || !/^[a-z0-9-]+$/.test(agentType)) return false;
  const f = join(root, ".claude", "agents", `${agentType}.md`);
  if (!existsSync(f)) return false;
  const tools = (readFileSync(f, "utf8").match(/^tools:\s*(.+)$/m) || [])[1] || "";
  return /\bBash\b/.test(tools) && !WRITE_TOOLS.test(tools);
}

// Начало на команда: начало на реда или след ; & | ( ` $( и празно място.
const CMD = String.raw`(?:^|[;&|(\x60]|\$\()\s*(?:sudo\s+)?`;
const RULES = [
  [new RegExp(CMD + String.raw`git\s+(?:-C\s+\S+\s+)?(commit|push|reset|checkout|switch|restore|rebase|merge|cherry-pick|revert|stash|clean|rm|mv|tag|am|add|init|pull|fetch\s+.*--update-head-ok|worktree\s+(?:add|remove|move)|branch\s+-[dDmMcC]|config\s+(?!--get|--list|-l\b))\b`), "git команда, която пише"],
  [new RegExp(CMD + String.raw`git\s+apply\b(?![^;&|]*--(?:check|stat))`), "git apply пише файлове"],
  [new RegExp(CMD + String.raw`(?:sed|perl)\s+(?:-[a-zA-Z]*\s+)*-[a-zA-Z]*i`), "редакция на място (-i)"],
  [new RegExp(CMD + String.raw`(rm|mv|cp|touch|truncate|chmod|chown|ln|install|rsync|unlink|shred)\s`), "команда, която пише/трие файлове"],
  [/--(?:write|fix)\b/, "форматер/линтер с --write/--fix пише файлове"],
  [new RegExp(CMD + String.raw`npm\s+(?:install|i|add|uninstall|remove|rm|un|update|up|upgrade|version|pkg\s+set|audit\s+fix|dedupe|prune|link)\b`), "npm, който сменя package.json/lockfile (за тестове ползвай npm ci)"],
  [new RegExp(CMD + String.raw`(?:pnpm|yarn)\s+(?:add|remove|rm|update|up|upgrade|install|i|link|dedupe)\b(?![^;&|]*--frozen-lockfile)`), "pnpm/yarn, който сменя манифест/lockfile (ползвай --frozen-lockfile)"],
];

/** Махни съдържанието на кавичките — „> файл“ в текстов аргумент не е пренасочване. */
const unquote = (s) => s.replace(/'[^']*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');

/** Пренасочване/tee към файл, който не е временен. */
function writesFile(cmd, scratch) {
  const okTarget = (t) => /^(?:&\d|\/dev\/(?:null|stdout|stderr)|\/tmp\/|\$TMPDIR|\$\{TMPDIR\}|\/proc\/self\/fd)/.test(t) || (scratch && t.startsWith(scratch));
  for (const m of cmd.matchAll(/(?:^|[^<>&\d])(?:\d)?>>?\s*([^\s;&|)]+)/g)) {
    const t = m[1];
    if (t.startsWith("(") || t.startsWith("&")) continue; // >(…) process substitution · >&2
    if (!okTarget(t)) return `пренасочване към файл (${t})`;
  }
  for (const m of cmd.matchAll(/\btee\s+(?:-a\s+)?([^\s;&|)]+)/g)) {
    if (!okTarget(m[1])) return `tee към файл (${m[1]})`;
  }
  return "";
}

/** Чиста логика: команда → причина за блок или "" . */
export function mutationReason(command, { scratch = "" } = {}) {
  // codeView: тялото на heredoc към python/node/cat е данни (знаците му стават `_`), към обвивка — код.
  // Хванато на 28.10.2026: `ord(ch) > 127` в python heredoc се четеше като пренасочване към файл.
  const cmd = unquote(codeView(sanitize(String(command || ""))));
  for (const [re, why] of RULES) if (re.test(cmd)) return why;
  return writesFile(cmd, scratch);
}

function main() {
  let p = {};
  try { p = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
  if (p.tool_name !== "Bash" || !isReadOnlyAgent(p.agent_type)) process.exit(0);
  const why = mutationReason(p.tool_input?.command, { scratch: p.scratchpad_dir || "" });
  if (!why) process.exit(0);
  process.stderr.write(
    `guard-readonly: „${p.agent_type}“ е ревюър без Write/Edit — тази команда променя репото (${why}). ` +
    `Работи само с четене; временни файлове пиши в /tmp или scratchpad-а. Поправката я прави собственикът: ` +
    `докладвай я с файл:ред и минимален diff в ПРЕДАВАНЕ.\n`,
  );
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { process.exit(0); } }
