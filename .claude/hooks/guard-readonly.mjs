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
// `tee` към файл извън /tmp, /dev/null и scratchpad-а; rm/mv/cp/touch/truncate/chmod/ln извън тях; `--write`/`--fix`;
// npm/pnpm/yarn, които сменят манифест или lockfile. Позволено: четене, тестове, билдове, `npm ci`.
// Граница: скрипт, който сам пише файл (`node -e "fs.writeFileSync…"`), не се вижда — куките съдят
// извикването, не намерението. Собствена грешка в логиката → пропуска (ролева кука, не защита на тайни);
// срив или таймаут на процеса → блок (onFailure: block в settings, от 02.11.2026).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitize } from "./guard-secrets.mjs";
import { codeView, shellWords, commandOf, execStrings, base } from "./guard-dangerous.mjs";
import { isMain } from "../../tools/lib/is-main.mjs";

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

// Начало на команда: начало на реда или след ; & | ( ` $( и празно място, после по желание присвоявания
// (`LC_ALL=C`) и обвивки (env, timeout 30, nice -n 5, xargs, command …). Проба 08.11.2026: `LC_ALL=C sed -i`,
// `timeout 30 sed -i`, `xargs rm` минаваха (2.1.319 затвори същия клас байпас в правата, не в нашите куки).
const PREFIX = String.raw`(?:(?:[A-Za-z_]\w*=\S*|(?:sudo|env|command|exec|nice|nohup|time|stdbuf|timeout|xargs)(?:\s+(?:-u\s+\S+|-n\s+-?\d+|-\S+|\d\S*))*)\s+)*`;
const CMD = String.raw`(?:^|[;&|(\x60]|\$\()\s*` + PREFIX;
// Тяло на правило → [проверка на суровия ред, проверка на простата команда по думи (котва ^)].
const BODIES = [
  [String.raw`git\s+(?:-C\s+\S+\s+)?(commit|push|reset|checkout|switch|restore|rebase|merge|cherry-pick|revert|stash|clean|rm|mv|tag|am|add|init|pull|fetch\s+.*--update-head-ok|worktree\s+(?:add|remove|move)|branch\s+-[dDmMcC]|config\s+(?!--get|--list|-l\b))\b`, "git команда, която пише"],
  [String.raw`git\s+apply\b(?![^;&|]*--(?:check|stat))`, "git apply пише файлове"],
  [String.raw`(?:sed|perl)\s+(?:-[a-zA-Z]*\s+)*-[a-zA-Z]*i`, "редакция на място (-i)"],
  [String.raw`npm\s+(?:install|i|add|uninstall|remove|rm|un|update|up|upgrade|version|pkg\s+set|audit\s+fix|dedupe|prune|link)\b`, "npm, който сменя package.json/lockfile (за тестове ползвай npm ci)"],
  [String.raw`(?:pnpm|yarn)\s+(?:add|remove|rm|update|up|upgrade|install|i|link|dedupe)\b(?![^;&|]*--frozen-lockfile)`, "pnpm/yarn, който сменя манифест/lockfile (ползвай --frozen-lockfile)"],
];
const RULES = [
  ...BODIES.map(([b, why]) => [new RegExp(CMD + b), why]),
  [/--(?:write|fix)\b/, "форматер/линтер с --write/--fix пише файлове"],
];
const WORD_RULES = BODIES.map(([b, why]) => [new RegExp("^" + b), why]);

/** Махни съдържанието на кавичките — „> файл“ в текстов аргумент не е пренасочване. */
const unquote = (s) => s.replace(/'[^']*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');

/** Временна цел: /tmp, $TMPDIR, /dev/null…, scratchpad-ът (буквален път). „..“ никога — /tmp/../repo е репото. */
const tempTarget = (scratch) => (t) => !t.includes("..") &&
  (/^(?:&\d|\/dev\/(?:null|stdout|stderr)|\/tmp\/|\$TMPDIR|\$\{TMPDIR\}|\/proc\/self\/fd)/.test(t) || Boolean(scratch && t.startsWith(scratch.replace(/\/?$/, "/"))));

// Файлови команди (2026-11-02): досега се спираха ВИНАГИ, дори към /tmp и scratchpad-а, а съобщението казваше
// „временни файлове пиши в scratchpad-а“ — Разбивача не можеше да подготви PoC (пилот за усилие, live-run).
// cp/install/rsync само ЧЕТАТ източника → съди се целта (последният аргумент); всички останали (rm, mv, ln,
// touch, chmod …) — всеки аргумент трябва да е временен: mv от репото трие от репото, ln към репото отваря
// заобиколен път за запис.
const FILE_CMD = new RegExp(CMD + String.raw`(rm|mv|cp|touch|truncate|chmod|chown|ln|install|rsync|unlink|shred)(?=\s|$)([^;&|)\n]*)`, "g");
const DEST_ONLY = new Set(["cp", "install", "rsync"]);
function fileCmdReason(cmd, scratch) {
  const ok = tempTarget(scratch);
  for (const m of cmd.matchAll(FILE_CMD)) {
    const args = m[2].trim().split(/\s+/).filter((a) => a && !a.startsWith("-"));
    // chmod/chown: първият аргумент е режимът/собственикът, не път.
    const targets = DEST_ONLY.has(m[1]) ? args.slice(-1) : /^ch(?:mod|own)$/.test(m[1]) ? args.slice(1) : args;
    if (!targets.length || !targets.every(ok)) return "команда, която пише/трие файлове извън /tmp и scratchpad-а";
  }
  return "";
}

/** Пренасочване/tee към файл, който не е временен. */
function writesFile(cmd, scratch) {
  const okTarget = tempTarget(scratch);
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

// ── По думите на обвивката (08.11.2026, второ кръгче) ────────────────────────────────────────────────
// Регексът върху суровия ред не вижда `/usr/bin/git commit`, `\sed -i`, `"sed" -i`, `{ sed -i …; }`,
// `then sed -i`, `timeout -s KILL 30 …`, `ionice -c3 …`, `bash -c '…'` (кавичките се махат преди проверката).
// Затова всяка проста команда се съди и като думи: shellWords + commandOf от guard-dangerous (общият парсер на
// пазачите), базовото име на програмата и допълнителните обвивки по-долу; низовете за изпълнение (sh -c, eval,
// $(…), `…`) — рекурсивно. Пренасочванията остават на суровия ред (в думите „> x“ от кавички изглежда като такова).
const EXTRA_WRAP = new Set(["ionice", "chrt", "taskset", "busybox", "setsid", "unbuffer"]);
const FILE_NAMES = new Set(["rm", "mv", "cp", "touch", "truncate", "chmod", "chown", "ln", "install", "rsync", "unlink", "shred"]);

function unwrap(argv) {
  let a = commandOf(argv);
  for (let n = 0; a.length && EXTRA_WRAP.has(base(a[0])) && n < 10; n++) {
    a = a.slice(1);
    while (a.length && (a[0].startsWith("-") || /^[\d.,:x-]+$/i.test(a[0]))) a = a.slice(1);
    a = commandOf(a);
  }
  return a;
}

function fileArgvReason(name, args, scratch) {
  if (!FILE_NAMES.has(name)) return "";
  const ok = tempTarget(scratch);
  const plain = args.filter((x) => x && !x.startsWith("-"));
  const targets = DEST_ONLY.has(name) ? plain.slice(-1) : /^ch(?:mod|own)$/.test(name) ? plain.slice(1) : plain;
  return !targets.length || !targets.every(ok) ? "команда, която пише/трие файлове извън /tmp и scratchpad-а" : "";
}

function wordReason(src, scratch, depth) {
  let parsed;
  try { parsed = shellWords(src); } catch { return ""; }
  for (const argv of parsed.cmds) {
    const a = unwrap(argv);
    if (a.length) {
      const name = base(a[0]), args = a.slice(1);
      const line = [name, ...args].join(" ");
      for (const [re, why] of WORD_RULES) if (re.test(line)) return why;
      const f = fileArgvReason(name, args, scratch);
      if (f) return f;
      // find -delete / -exec rm … — find сам трие или пуска команда, която пише.
      if (name === "find") {
        if (args.includes("-delete")) return "find -delete трие файлове";
        const k = args.findIndex((x) => /^-(?:exec|execdir|ok|okdir)$/.test(x));
        if (k >= 0) { const why = mutationReasonAt(args.slice(k + 1).filter((x) => x !== ";" && x !== "+").join(" "), scratch, depth + 1); if (why) return why; }
      }
    }
    for (const inner of execStrings(argv)) { const why = mutationReasonAt(inner, scratch, depth + 1); if (why) return why; }
  }
  for (const inner of parsed.subs) { const why = mutationReasonAt(inner, scratch, depth + 1); if (why) return why; }
  return "";
}

function mutationReasonAt(command, scratch, depth) {
  if (depth > 3) return "";
  // codeView: тялото на heredoc към python/node/cat е данни (знаците му стават `_`), към обвивка — код.
  // Хванато на 28.10.2026: `ord(ch) > 127` в python heredoc се четеше като пренасочване към файл.
  const src = codeView(sanitize(String(command || "")));
  const cmd = unquote(src);
  for (const [re, why] of RULES) if (re.test(cmd)) return why;
  return fileCmdReason(cmd, scratch) || writesFile(cmd, scratch) || wordReason(src, scratch, depth);
}

/** Чиста логика: команда → причина за блок или "" . */
export function mutationReason(command, { scratch = "" } = {}) {
  return mutationReasonAt(command, scratch, 0);
}

function main() {
  let p = {};
  try { p = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
  // Monitor (2.1.314+) пуска shell команда като Bash — съди се по същото правило; без команда няма запис.
  if (!["Bash", "Monitor"].includes(p.tool_name) || !isReadOnlyAgent(p.agent_type)) process.exit(0);
  const why = mutationReason(p.tool_input?.command, { scratch: p.scratchpad_dir || "" });
  if (!why) process.exit(0);
  process.stderr.write(
    `guard-readonly: „${p.agent_type}“ е ревюър без Write/Edit — тази команда променя репото (${why}). ` +
    `Работи само с четене; временни файлове пиши в /tmp или scratchpad-а. Поправката я прави собственикът: ` +
    `докладвай я с файл:ред и минимален diff в ПРЕДАВАНЕ.\n`,
  );
  process.exit(2);
}

if (isMain(import.meta.url)) { try { main(); } catch { process.exit(0); } }
