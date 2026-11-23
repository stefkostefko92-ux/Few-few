#!/usr/bin/env node
// guard-self.mjs — PreToolUse(Write|Edit|MultiEdit|NotebookEdit|Bash|Monitor): пазачите не се пренаписват от агент.
//
// Защо (19.11.2026, Разбивача, проба p1/p4): агент с право на запис презаписваше `.claude/hooks/guard-exfil.mjs`
// през Bash, а записът на „мод“ в `~/.claude/dev-mods/` също минаваше — guard-dangerous, guard-readonly и
// guard-exfil връщаха 0/0/0. Документацията на Claude Code:
//   • ConfigChange се задейства за settings файловете и уменията, НЕ за скриптовете на куките — редакция на
//     скрипт влиза в сила веднага (https://code.claude.com/docs/en/hooks.md#configchange);
//   • без managed settings мод може да одобри извикване, блокирано от PreToolUse кука, а `$.fs`/`$.process`
//     на мод прескачат deny правилата и куките (https://code.claude.com/docs/en/plugins/mods/admin.md);
//   • за предотвратяване се ползва PreToolUse, не PostToolUse (https://code.claude.com/docs/en/hooks.md).
//
// Какво пази (ниво A — пазачите):
//   `.claude/hooks/**` · `.claude/settings.json` и `settings.local.json` (проектни и `~/.claude/`) ·
//   managed settings (`/etc/claude-code/`, macOS, Windows — най-висок приоритет) · `.mcp.json`, `~/.claude.json`
//   (MCP сървър = нов инструмент) · `.claude/skills/*/.claude-plugin/**` · `~/.claude/dev-mods/**` и
//   `~/.claude/plugins/**` · `.githooks/**`, `.git/hooks/**` и `core.hooksPath` · `tools/security/secret-scan.mjs`
//   (твърдият гейт в CI) · всеки файл, който пазачите импортират (изчислява се в движение от `import`-ите на
//   guard-*.mjs, agent-cap.mjs и тази кука — нов импорт се покрива сам) · извличане на архив / кръпка / `find -exec`
//   „по данни“ в папка, която съдържа пазачите (съдържанието не се вижда в командата → съди се местоназначението).
//   Червен екип 19.11.2026 (вътрешен, 79 проби): 14 пропуска на първата версия затворени, 0 фалшиви блока.
//   Конфигурацията на git (`.git/config`, `~/.gitconfig`, `git config`/`-c` с ключ, който пуска код).
// Ниво B — паметта: `.claude/agents/_memory/**` (поуките влизат само през memory-capture с проверка); импортите
//   на останалите куки (memory-capture, memory-preload, dod-check… → `tools/lib/memory-*`, `handoff.mjs`…);
//   git, който пренаписва работното дърво от ref (`reset --hard`, `checkout <ref>`, `stash pop`, `merge`, `pull`…).
// Пайп: пазен път в едно звено, а в следващо — изпълнител на входа си (`sh`, `node`, `xargs <пишеща>`,
//   `while read`, `sed …e`, `awk system()`) → съди се като запис (отворения spec на Кодаджията, 21.11.2026).
//
// Решение:
//   • субагент (има `agent_id`/`agent_type` в payload-а) → отказ (exit 2), ниво A и B. Пазач се сменя само
//     от главната сесия с човек: агентът предава diff-а в ПРЕДАВАНЕ.
//   • главната сесия → ниво A: „ask“ — човекът потвърждава всяка смяна на пазач, независимо от режима и от
//     одобренията „за цялата сесия“; ниво B: без решение (харнесът и без това пита за `.claude/`).
//   • четене, пускане на кука (`node .claude/hooks/x.mjs`), `git add/commit/diff` — свободно.
// Bash се съди по думите на обвивката (общият парсер на пазачите), с проследяване на `cd`, глобове,
// пренасочвания, `sh -c`, `$(…)` и heredoc към интерпретатор. Граница (честно): път, сглобен по време на
// изпълнение (`D=.cla; rm "${D}ude/…"` без буквалния път, base64, мрежа), не се вижда — куките съдят
// извикването, не намерението. Детерминистичната граница е файловата система/sandbox-ът; това е слой.
//
// Fail-closed: неразбираем payload или вътрешна грешка → отказ; срив/таймаут → `onFailure: "block"`.

import { readFileSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { sanitize } from "./guard-secrets.mjs";
import { shellWords, commandOf, execStrings, base } from "./guard-dangerous.mjs";
import { ALLOW } from "./guard-allowlist.mjs";
import { isMain } from "../../tools/lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// ── Какво е пазено ────────────────────────────────────────────────────────────────────────────────────
const TIER_A = [
  /(?:^|\/)\.claude\/hooks(?:\/|$)/,
  /(?:^|\/)\.claude\/settings(?:\.local)?\.json$/,
  /(?:^|\/)\.claude\/skills\/[^/]+\/\.claude-plugin(?:\/|$)/,
  /(?:^|\/)\.claude\/(?:dev-mods|plugins)(?:\/|$)/,
  /(?:^|\/)\.githooks(?:\/|$)/,
  /(?:^|\/)\.git\/hooks(?:\/|$)/, // кука на git = изпълнение на код при commit
  /(?:^|\/)tools\/security\/secret-scan\.mjs$/,
  // Managed settings са с най-висок приоритет (`disableAllHooks`, `allowManagedHooksOnly` там изключват всичко наше);
  // в облачния контейнер сме root, значи /etc е достижим. MCP сървър = нов инструмент (.mcp.json, ~/.claude.json).
  /^\/etc\/claude-code(?:\/|$)/,
  /^\/Library\/Application Support\/ClaudeCode(?:\/|$)/,
  /^[A-Za-z]:\/ProgramData\/ClaudeCode(?:\/|$)/i,
  /(?:^|\/)\.mcp\.json$/,
  /(?:^|\/)\.claude\.json$/,
  // Конфигурацията на git пуска код при всяка git команда (core.fsmonitor, core.sshCommand, alias.* с „!“, filter.*,
  // include.path) и може да смени core.hooksPath покрай регекса за командата (отворения spec, 21.11.2026).
  /(?:^|\/)\.git\/config$/,
  /(?:^|\/)\.git\/worktrees\/[^/]+\/config(?:\.worktree)?$/,
  /(?:^|\/)\.gitconfig$/,
  /(?:^|\/)\.config\/git\/config$/,
  /^\/etc\/gitconfig$/,
  // Месечният таван (23.11.2026) съди по данни, не само по код: цените, дневникът на разхода, буферът в .git
  // и флагът за оценки. Разбивача (N2): `{}` в prices.json или ред с по-високо `v` в буфера сваляше разхода до 0.
  /(?:^|\/)tools\/agents\/prices\.json$/,
  /(?:^|\/)tools\/agents\/evals\/usage\.jsonl$/,
  /(?:^|\/)\.git(?:\/worktrees\/[^/]+)?\/agents-(?:usage\.pending\.jsonl|eval\.json)$/,
];
const TIER_B = [/(?:^|\/)\.claude\/agents\/_memory(?:\/|$)/];

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["'](\.{1,2}\/[^"']+)["']/gm;

/** Файловете, които пазачите (или `start` — всички куки) зареждат транзитивно, като пътища спрямо корена на репото. */
export function guardClosure(root = ROOT, start_ = /^(?:guard-[\w-]+|agent-cap)\.mjs$/, extra = []) {
  const hooks = join(root, ".claude", "hooks");
  let start = [];
  try { start = readdirSync(hooks).filter((f) => start_.test(f)).map((f) => join(hooks, f)); } catch { /* няма */ }
  const seen = new Set(), queue = [...start, ...extra.map((r) => join(root, r))];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    let src = "";
    try { src = readFileSync(f, "utf8"); } catch { continue; }
    for (const m of src.matchAll(IMPORT_RE)) queue.push(resolve(dirname(f), m[1]));
  }
  return [...seen].map((f) => relative(root, f).split("\\").join("/")).filter((r) => !r.startsWith(".."));
}

/** Списък с правила за ниво A: регексите + затвореният списък на импортите (суфикс по граница „/“). */
// Разбивача, 23.11.2026 (N1, блокер): скрипт от позволения списък на guard-allowlist се пуска от агент, който има
// Write/Edit (Преводача). Непазен, той е пренаписваем → позволената команда пуска произволен код. Затова скриптовете и
// импортите им влизат в затворения списък на ниво A заедно с пазачите.
const ALLOWED_SCRIPTS = Object.values(ALLOW).flatMap((a) => a.scripts);

export function protectedSet(root = ROOT) {
  const closure = guardClosure(root, undefined, ALLOWED_SCRIPTS).filter((r) => !TIER_A.some((re) => re.test(r)));
  // Импортите на останалите куки (memory-capture, memory-preload, dod-check, usage-capture…) се изпълняват в куката:
  // агент, който ги пренапише, заобикаля проверката на поуките и ПРЕДАВАНЕ → ниво B (отказ за агент, свободно за
  // главната сесия). Само по пълен път — името на файла (usage.mjs, handoff.mjs) не е уникално в репото.
  const inA = new Set(closure);
  const hookDeps = guardClosure(root, /\.mjs$/).filter((r) => !inA.has(r) && !TIER_A.some((re) => re.test(r)));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = (r) => new RegExp(`(?:^|/)${esc(r)}$`);
  return { a: [...TIER_A, ...closure.map(rx)], b: [...TIER_B, ...hookDeps.map(rx)], closure, hookDeps };
}

/** Абсолютен път с разрешени symlink-ове (ако пътят или родителят му съществува). */
function realish(p) {
  try { return realpathSync(p); } catch { /* няма файл */ }
  try { return join(realpathSync(dirname(p)), basename(p)); } catch { return p; }
}

const expandHome = (w) => (w === "~" ? homedir() : w.startsWith("~/") ? join(homedir(), w.slice(2)) : w);

/** Ниво на пазене за път ("A" | "B" | ""). Пробва и пътя, и реалния му адрес (symlink към пазачите). */
export function tierOfPath(p, cwd = ROOT, set = protectedSet()) {
  if (!p || typeof p !== "string" || /^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return "";
  const abs = resolve(cwd, expandHome(p));
  for (const cand of new Set([abs, realish(abs)])) {
    const s = cand.split("\\").join("/");
    if (set.a.some((re) => re.test(s))) return "A";
    if (set.b.some((re) => re.test(s))) return "B";
  }
  return "";
}

// Свободен текст (код в `node -e`, тяло на heredoc): търсим пътя като дума, вкл. сглобен с join(".claude","hooks").
const TEXT_A = String.raw`\.claude\W{0,8}(?:hooks|settings(?:\.local)?\.json|dev-mods|plugins)\b|\.claude-plugin\b|\bdev-mods\b|\.githooks\b|secret-scan\.mjs|managed-settings\.json|\/etc\/claude-code\b|\.mcp\.json\b|\.claude\.json\b`;
const TEXT_B = String.raw`\.claude\W{0,8}agents\W{0,8}_memory\b`;
/** Ниво по свободен текст (по-широко от пътя — за код, който ще сглоби пътя сам). */
export function tierOfText(text, set = protectedSet()) {
  const s = sanitize(String(text || ""));
  const names = set.closure.map((r) => basename(r).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (new RegExp(`${TEXT_A}${names.length ? `|(?:^|[^\\w-])(?:${names.join("|")})\\b` : ""}`).test(s)) return "A";
  if (new RegExp(TEXT_B).test(s)) return "B";
  return "";
}

/** Глоб → регекс по сегменти; `*`/`?`/`[` в началото на сегмент не хващат скрит файл (както bash). */
function globRe(abs) {
  const seg = (s) => (/^[*?[]/.test(s) ? "(?!\\.)" : "") + s.split("").map((c) =>
    c === "*" ? "[^/]*" : c === "?" ? "[^/]" : c === "[" || c === "]" ? c : /[.+^${}()|\\]/.test(c) ? "\\" + c : c).join("");
  return new RegExp("^" + abs.split("/").map(seg).join("/") + "$");
}

/** Глоб (`.claude/h*`, `.cl?ude/hooks/*`, `*.mjs` след `cd .claude/hooks`) → засяга ли пазен път. */
function tierOfGlob(word, cwd, set) {
  if (!/[*?[]/.test(word)) return "";
  let re;
  try { re = globRe(resolve(cwd, expandHome(word)).split("\\").join("/")); } catch { return "A"; } // счупен глоб → fail-closed
  const probes = [
    ...set.closure.map((r) => join(ROOT, r)),
    ...(set.hookDeps || []).map((r) => join(ROOT, r)),
    ...["hooks", "hooks/guard-exfil.mjs", "hooks/_state/compact-snapshot.md", "settings.json", "settings.local.json",
      "dev-mods", "dev-mods/m/mod.js", "plugins", "agents/_memory", "agents/_memory/x.md", "skills/x/.claude-plugin"]
      .flatMap((x) => [join(ROOT, ".claude", x), join(homedir(), ".claude", x), join(cwd, ".claude", x)]),
    join(ROOT, ".githooks"), join(ROOT, ".githooks", "pre-commit"), join(ROOT, "tools", "security", "secret-scan.mjs"),
  ];
  for (const p of probes) {
    const s = p.split("\\").join("/");
    if (re.test(s)) { const t = tierOfPath(s, cwd, set); if (t) return t; }
  }
  return "";
}

const max = (a, b) => (a === "A" || b === "A" ? "A" : a === "B" || b === "B" ? "B" : "");
const wordTier = (w, cwd, set) => max(max(tierOfPath(w, cwd, set), tierOfGlob(w, cwd, set)), tierOfText(w, set));

/** Пазени „котви“ — папки и файлове, които извличане/кръпка в ПРЕДШЕСТВЕНИК на тях може да презапише. */
function anchors(cwd) {
  const out = [join(ROOT, ".claude"), join(ROOT, ".githooks"), join(ROOT, ".git", "hooks"), join(ROOT, ".mcp.json"),
    join(ROOT, "tools", "lib"), join(ROOT, "tools", "security"), join(homedir(), ".claude"), join(homedir(), ".claude.json"), "/etc/claude-code"];
  for (const d of [cwd, ROOT]) if (existsSync(join(d, ".claude"))) out.push(join(d, ".claude"));
  return out;
}
/** Папката съдържа (или е) пазена котва → запис „по данни“ в нея (архив, кръпка) може да стигне до пазачите. */
export function coversAnchor(dir, cwd = ROOT) {
  const d = resolve(cwd, expandHome(String(dir || "."))).replace(/\/+$/, "") || "/";
  // Сам пазен на ниво A. Ниво B (паметта, импортите на куките) се съди по думата със своето ниво — иначе
  // `prettier --check tools/lib/memory-core.mjs` ставаше „папка с пазачите“ (A → питане и за главната сесия).
  return anchors(cwd).some((a) => a === d || a.startsWith(d === "/" ? "/" : d + "/")) || tierOfPath(d, cwd) === "A";
}

/** `$X`/`${X}` → стойност от проследените присвоявания (и HOME). */
function expandVars(w, vars) {
  return String(w).replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, k) => (k === "HOME" ? homedir() : Object.hasOwn(vars, k) ? vars[k] : m));
}
// Неразгърната променлива + опашка, която прилича на пазен път (`$D/hooks/guard-x.mjs`) → не гадаем, отказ.
const LOOSE = /\$[{A-Za-z_][^/]*\/(?:hooks|dev-mods|plugins)\/|\$[{A-Za-z_][^/]*\/(?:settings(?:\.local)?\.json|\.claude-plugin|_memory)\b|\$[{A-Za-z_][^\s]*\/(?:guard-[\w-]+|secret-patterns|secret-scan)\.mjs/;

// ── Програми ──────────────────────────────────────────────────────────────────────────────────────────
// Само четат аргументите си (пренасочванията се съдят отделно).
const READERS = new Set(["cat", "head", "tail", "less", "more", "wc", "grep", "egrep", "fgrep", "rg", "ls", "stat", "file",
  "diff", "cmp", "sha256sum", "sha1sum", "sha512sum", "md5sum", "b2sum", "cksum", "jq", "realpath", "readlink", "dirname",
  "basename", "test", "[", "echo", "printf", "true", "false", "od", "hexdump", "strings", "column", "bat", "cd", "pushd", "popd", "du", "tree"]);
const GIT_READ = new Set(["status", "diff", "log", "show", "add", "commit", "push", "ls-files", "ls-tree", "grep", "blame", "branch", "tag", "remote", "symbolic-ref",
  "rev-parse", "cat-file", "fetch", "shortlog", "describe", "show-ref", "for-each-ref", "check-ignore", "check-attr", "reflog", "whatchanged", "diff-tree", "diff-index", "merge-base", "rev-list", "name-rev", "hash-object"]);
const INTERP = /^(?:node|nodejs|deno|bun|python[0-9.]*|ruby|perl|php|(?:ba|z|k|da|a|c|tc|fi)?sh)$/;
const REDIR = /^(?:\d*>>?|&>>?|>\||\d*>&?)(.*)$/; // `>` `>>` `2>` `&>` `>|` (+ слепен път)

/** Мястото на подкомандата на git след глобалните флагове (`git -C x -c a=b log` → 4). */
function gitSubIndex(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) i += /^(?:-C|-c|--git-dir|--work-tree|--namespace|--exec-path)$/.test(args[i]) ? 2 : 1;
  return i;
}
/** Подкомандата на git след глобалните флагове (`git -C x -c a=b log` → log). */
function gitSub(args) { return args[gitSubIndex(args)] || ""; }

// Ключове на git, чиято стойност е команда/код (пуска се при git команда) или зарежда чужда конфигурация.
const GIT_EXEC_KEY = /^(?:core\.(?:hookspath|fsmonitor|sshcommand|pager|editor|askpass|gitproxy|attributesfile)|alias\..+|filter\..+|diff\.(?:external|.+\.(?:textconv|command))|merge\..+\.driver|include\.path|includeif\..+|credential\.(?:.+\.)?helper|gpg\.(?:.+\.)?program|sequence\.editor|pager\..+|interactive\.difffilter|uploadpack\..+|receive\..+|remote\..+\.(?:uploadpack|receivepack|proxy)|url\..+|http\.(?:.+\.)?proxy|submodule\..+\.update|(?:diff|merge)tool\..+\.(?:cmd|path)|web\.browser|browser\..+\.(?:cmd|path)|man\..+\.(?:cmd|path)|instaweb\..+)$/i;

// git подкоманди, които пренаписват работното дърво от ref — `git reset --hard <стар sha>` връща стара, уязвима версия
// на куките, без пазен път да е в командата (отворения spec, 21.11.2026). Ниво B: отказ за агент, свободно за главната сесия.
/** Корен на работното дърво на git над `dir` ("" — извън репо). */
function gitTop(dir) {
  for (let d = resolve(dir); ; d = dirname(d)) { if (existsSync(join(d, ".git"))) return d; if (d === dirname(d)) return ""; }
}
function gitRewritesTree(sub, rest, gcwd) {
  const pos = rest.filter((w) => !w.startsWith("-")), has = (re) => rest.some((w) => re.test(w));
  if (rest.includes("--")) return false; // пътищата след `--` се съдят като пътища (по-горе)
  switch (sub) {
    case "checkout":
      if (has(/^-[bB]$|^--orphan$/)) return pos.length > 1; // нов клон от HEAD не сменя файлове; с начална точка — сменя
      return pos.length > 0 && !pos.every((p) => existsSync(resolve(gcwd, p))); // съществуващ файл = пътека, иначе ref
    case "switch": return !(has(/^-[cC]$|^--create$|^--force-create$|^--orphan$/) && pos.length <= 1) && pos.length > 0;
    case "reset": return has(/^--(?:hard|merge|keep)$/);
    case "stash": return !["list", "show", "drop", "clear", "create", "store"].includes(pos[0]);
    case "clean": return has(/^-[a-zA-Z]*f|^--force$/) && !has(/^-[a-zA-Z]*n|^--dry-run$/);
    case "read-tree": return has(/^-u$|^--reset$/);
    case "bisect": return !["log", "view", "visualize", "terms"].includes(pos[0]);
    case "merge": case "pull": case "rebase": case "cherry-pick": case "revert": case "checkout-index": return true;
    default: return false;
  }
}

/** argv на проста команда → [причина, ниво] или ["", ""]. `state.cwd` се мести при `cd`. */
function argvVerdict(argvRaw, state, set) {
  state.vars ||= {};
  // Простите присвоявания се проследяват (`D=.claude; rm $D/hooks/x`), после думите се разгръщат.
  for (const w of argvRaw) { const m = /^([A-Za-z_]\w*)=(.*)$/.exec(w); if (m) state.vars[m[1]] = m[2]; else break; }
  if (/^(?:export|declare|local|readonly)$/.test(argvRaw[0] || "")) for (const w of argvRaw.slice(1)) { const m = /^([A-Za-z_]\w*)=(.*)$/.exec(w); if (m) state.vars[m[1]] = m[2]; }
  const argv0 = argvRaw.map((w) => expandVars(w, state.vars));
  // Съди се СЛЕД разгръщането: известна променлива (`F=/tmp/fx; … > $F/guard-self.mjs`) вече е буквален път и
  // се съди по него; отказ остава само за неразгърната (21.11.2026 — фалшив блок на фикстура в tools/…/fixtures).
  for (const w of argv0) if (LOOSE.test(w)) return [`пазен път зад неразгърната променлива (${w.slice(0, 80)})`, "A"];
  // Пренасочванията пишат: целта им се съди като запис, независимо от програмата.
  const argv = [];
  for (let k = 0; k < argv0.length; k++) {
    const m = REDIR.exec(argv0[k]);
    if (m && !argv0[k].startsWith(">(")) {
      const target = m[1] || argv0[k + 1];
      if (!m[1]) k++;
      if (target && !/^&\d$/.test(target)) {
        const t = max(tierOfPath(target, state.cwd, set), tierOfGlob(target, state.cwd, set));
        if (t) return [`пренасочване към пазен файл (${target})`, t];
      }
      continue;
    }
    argv.push(argv0[k]);
  }
  // Присвояване, което съдържа пазен път (`F=.claude/hooks/x; rm $F`) — после пътят не се вижда → отказ.
  for (const w of argv) {
    const m = /^[A-Za-z_]\w*=(.*)$/.exec(w);
    if (m && wordTier(m[1], state.cwd, set)) return [`пазен път в променлива (${w.slice(0, 80)})`, wordTier(m[1], state.cwd, set)];
    if (!m) break;
  }
  // `for f in <списък>; do …; done`: списъкът сам не пише — променливата получава най-пазения елемент, за да се съди
  // тялото по истинския път (`rm $f` → отказ, `echo "$f"`/`git diff $f` → свободно).
  if (argv[0] === "for" && argv[2] === "in" && /^[A-Za-z_]\w*$/.test(argv[1] || "")) {
    let pick = argv[3] || "", best = "";
    for (const w of argv.slice(3)) { const t = wordTier(w, state.cwd, set); if (t && (t === "A" || !best)) { pick = w; best = t; if (t === "A") break; } }
    state.vars[argv[1]] = pick;
    return ["", ""];
  }
  // `env -S "rm …"` разделя низа на команда — commandOf го поглъща като стойност на флага.
  if (base(argv[0] || "") === "env") {
    const k = argv.findIndex((w) => w === "-S" || w === "--split-string" || w.startsWith("--split-string="));
    if (k > 0) { const v = argv[k].includes("=") ? argv[k].split("=").slice(1).join("=") : argv[k + 1]; if (v) return bashVerdictAt(v, state, set, 1); }
  }
  const a = commandOf(argv);
  if (!a.length) return ["", ""];
  const name = base(a[0]), args = a.slice(1);
  if (name === "cd" || name === "pushd") { if (args[0] && !args[0].startsWith("-")) state.cwd = resolve(state.cwd, expandHome(args[0])); return ["", ""]; }
  // git, който изключва нашата .githooks кука или пише кръпка „по данни“ в работното дърво.
  if (name === "git") {
    const all = args.join(" ");
    if (/core\.hookspath/i.test(all) && !/--get\b|--list\b|\s-l\b/.test(all)) return ["git: смяна на core.hooksPath изключва .githooks пазача", "A"];
    // `git -c alias.x='!rm -rf .claude' x`, `-c core.fsmonitor='rm …'`: стойността е команда на обвивката → съди се като команда.
    for (let i = 0; i < args.length && args[i].startsWith("-"); i++) {
      if (args[i] !== "-c" || !args[i + 1]) continue;
      const kv = /^([^=]+)=(.*)$/s.exec(args[++i]);
      if (!kv) continue;
      const t = tierOfText(kv[2], set);
      if (t) return [`git -c ${kv[1]}: пазен път в стойността`, t];
      if (GIT_EXEC_KEY.test(kv[1])) { const w = bashVerdictAt(kv[2].replace(/^!/, ""), { ...state, vars: { ...state.vars } }, set, 1); if (w[0]) return [`git -c ${kv[1]}: ${w[0]}`, w[1]]; }
    }
    const sub = gitSub(args);
    if (sub === "config") {
      const rest = args.slice(gitSubIndex(args) + 1);
      const pos = rest.filter((w) => !w.startsWith("-"));
      const writes = rest.some((w) => /^(?:--add|--replace-all|--unset(?:-all)?|--rename-section|--remove-section)$/.test(w)) || ["set", "unset"].includes(pos[0]) || pos.length >= 2;
      const reads = rest.some((w) => /^(?:--get(?:-all|-regexp|-urlmatch|-color(?:bool)?)?|--list|-l)$/.test(w)) || ["get", "list"].includes(pos[0]);
      if (rest.some((w) => w === "--edit" || w === "-e") || pos[0] === "edit") return ["git config --edit пише конфигурацията на git", "A"];
      const key = ["set", "unset"].includes(pos[0]) ? pos[1] : pos[0];
      if (writes && !reads && key && GIT_EXEC_KEY.test(key)) return [`git config ${key}: ключ, който пуска код при всяка git команда`, "A"];
    }
    if (/^(?:apply|am)$/.test(sub) && !args.some((w) => /^--(?:check|stat|numstat|summary)$/.test(w))) {
      const k = args.indexOf("--directory");
      const dir = k >= 0 ? args[k + 1] : state.cwd;
      if (coversAnchor(dir, state.cwd)) return [`git ${sub}: кръпката пише по данни в папка с пазачите`, "A"];
    }
  }
  // Извличане/кръпка „по данни“: целта е съдържанието на архива/кръпката — съди се папката-местоназначение.
  const EXTRACT = new Set(["tar", "bsdtar", "unzip", "cpio", "patch", "7z", "7za"]);
  if (EXTRACT.has(name)) {
    const mode = name === "tar" || name === "bsdtar" ? args.some((w) => (/^-?[A-Za-z]*x[A-Za-z]*$/.test(w) && !w.startsWith("--")) || w === "--extract" || w === "--get")
      : name === "cpio" ? args.some((w) => /^-[A-Za-z]*i/.test(w) || w === "--extract")
      : name === "7z" || name === "7za" ? args[0] === "x" || args[0] === "e"
      : name === "unzip" ? !args.some((w) => /^-[A-Za-z]*[lvtZ]/.test(w)) // -l/-v/-t/-Z само четат
      : true;
    if (mode) {
      const flag = (re) => { const k = args.findIndex((w) => re.test(w)); return k < 0 ? null : args[k].includes("=") ? args[k].split("=").slice(1).join("=") : args[k + 1]; };
      const dest = name === "unzip" ? flag(/^-d$/) : name === "patch" ? flag(/^(?:-d|--directory(?:=.*)?)$/) : flag(/^(?:-C|--directory(?:=.*)?)$/);
      if (name === "patch") { const files = args.filter((w) => !w.startsWith("-")); if (files[0] && wordTier(files[0], state.cwd, set)) return ["patch: целта е пазен файл", "A"]; }
      if (coversAnchor(dest || state.cwd, state.cwd)) return [`${name}: извличане/кръпка по данни в папка с пазачите (${dest || state.cwd})`, "A"];
    }
  }
  // tree -o ФАЙЛ пише изхода си във файл, макар tree да е в READERS (трудният spec на Кодаджията, 21.11.2026:
  // `tree -o .claude/settings.json /tmp/d` презаписваше настройките) → целта се съди като пренасочване.
  if (name === "tree") {
    for (let i = 0; i < args.length; i++) {
      const target = args[i] === "-o" ? args[i + 1] : /^-o./.test(args[i]) ? args[i].slice(2) : null;
      if (!target) continue;
      const t = max(tierOfPath(target, state.cwd, set), tierOfGlob(target, state.cwd, set));
      if (t) return [`tree -o пише в пазен файл (${target})`, t];
    }
  }
  // find -delete/-exec от корен, който съдържа пазачите — шаблонът на find (`*hooks/x`) не е път, не гадаем.
  if (name === "find" && args.some((w) => /^-(?:delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(w))) {
    const roots = []; for (const w of args) { if (w.startsWith("-") || /^[!(),]$/.test(w)) break; roots.push(w); }
    if ((roots.length ? roots : ["."]).some((r) => coversAnchor(r, state.cwd))) return ["find с -delete/-exec от папка, която съдържа пазачите", "A"];
  }
  // Папка-предшественик на пазачите (ревю на PR #434 — Кодаджията и AI-джията): `cp -r /tmp/x/hooks .claude/`,
  // `mv /tmp/s/settings.json .claude/`, `rsync -a /tmp/x/ .claude/`, `rm -rf .claude`, `git checkout evil -- .claude`
  // стигат до пазен път, без той да е буквално в командата → съди се целта като път-резултат и папката-предшественик.
  const pathy = (w) => !w.startsWith("-") && !/^[a-z][a-z0-9+.-]*:\/\//i.test(w);
  // git: глобалните флагове преди подкомандата не са цел; `-C`/`--work-tree` е папката, спрямо която се съдят
  // пътищата (21.11.2026 — `git -C <корен> branch --show-current` беше спрян, а `git -C .claude checkout x -- hooks` мина бе).
  let gcwd = state.cwd, gargs = args;
  if (name === "git") {
    gargs = [];
    let i = 0;
    for (; i < args.length && args[i].startsWith("-"); i++) {
      const w = args[i], eq = /^--(git-dir|work-tree|namespace|exec-path)=(.*)$/.exec(w);
      if (eq) { if (eq[1] === "work-tree") gcwd = resolve(gcwd, expandHome(eq[2])); continue; }
      if (/^(?:-C|-c|--git-dir|--work-tree|--namespace|--exec-path)$/.test(w)) {
        if ((w === "-C" || w === "--work-tree") && args[i + 1]) gcwd = resolve(gcwd, expandHome(args[i + 1]));
        i++; continue;
      }
      gargs.push(w);
    }
    gargs.push(...args.slice(i));
  }
  const ancestorHit = (w) => pathy(w) && coversAnchor(w, gcwd);
  // `git restore --staged .` пипа само индекса, не файловете.
  const stagedOnly = name === "git" && gitSub(args) === "restore" && args.some((w) => w === "--staged" || w === "-S") && !args.some((w) => w === "--worktree" || w === "-W");
  if (!READERS.has(name) && name !== "find" && !stagedOnly && !(name === "git" && GIT_READ.has(gitSub(args)))) {
    if (["cp", "install", "rsync", "mv", "ln"].includes(name)) {
      const t = args.findIndex((w) => w === "-t" || w.startsWith("--target-directory"));
      const plain = args.filter(pathy);
      const dest = t >= 0 ? (args[t].includes("=") ? args[t].split("=").slice(1).join("=") : args[t + 1]) : plain[plain.length - 1];
      const srcs = t >= 0 ? plain.filter((w) => w !== dest) : plain.slice(0, -1);
      if (dest) {
        const d = resolve(state.cwd, expandHome(dest));
        for (const s of srcs) {
          const r = join(d, basename(s.replace(/\/+$/, "")));
          if (tierOfPath(r, state.cwd, set) || coversAnchor(r, state.cwd)) return [`${name}: резултатът ${relative(ROOT, r) || r} е пазен път`, "A"];
        }
        const recursive = name === "rsync" || name === "mv" || args.some((w) => /^-[a-zA-Z]*[rRa]/.test(w) || w === "--recursive" || w === "--archive");
        if (recursive && coversAnchor(d, state.cwd)) return [`${name}: рекурсивен запис в папка, която съдържа пазачите`, "A"];
      }
      if (name === "mv" && srcs.some(ancestorHit)) return ["mv: мести папка, която съдържа пазачите", "A"];
    } else if (!INTERP.test(name) && !["tar", "bsdtar", "zip", "7z", "7za", "cpio", "unzip", "patch", "sed"].includes(name) && gargs.some(ancestorHit)) {
      // (архиваторите се съдят по-горе по режим и местоназначение: `tar -czf /tmp/a.tgz .` само чете)
      return [`${name}: действие върху папка, която съдържа пазачите`, "A"];
    }
  }
  if (name === "git") {
    const sub = gitSub(args), top = gitTop(gcwd);
    if (top && (existsSync(join(top, ".claude")) || coversAnchor(top, state.cwd)) && gitRewritesTree(sub, args.slice(gitSubIndex(args) + 1), gcwd))
      return [`git ${sub} пренаписва работното дърво от ref (вкл. куките) — за един файл ползвай \`git checkout <ref> -- <път>\``, "B"];
  }
  const hits = args.map((w, i) => [i, w, wordTier(w, state.cwd, set)]).filter(([, , t]) => t);
  if (!hits.length) return ["", ""];
  const tier = hits.reduce((acc, [, , t]) => max(acc, t), "");
  const deny = (why) => [`${name}: ${why}`, tier];

  if (READERS.has(name)) return ["", ""];
  if (name === "git") {
    const sub = gitSub(args);
    if (GIT_READ.has(sub)) return ["", ""];
    return deny(`git ${sub} сменя файловете в работното дърво`);
  }
  if (name === "sed") {
    if (args.some((w) => /^-[a-zA-Z]*i/.test(w) || /^--in-place/.test(w))) return deny("редакция на място (-i)");
    const firstFile = args.findIndex((w, j) => !w.startsWith("-") && (j === 0 || !/^-[ef]$/.test(args[j - 1])));
    const script = args.some((w) => /^-[ef]$/.test(w)) ? -1 : firstFile; // без -e първата дума е скриптът
    if (hits.some(([i]) => i === script || (i > 0 && /^-[ef]$/.test(args[i - 1])))) return deny("пазен път в скрипта на sed (w/r команда)");
    return ["", ""];
  }
  if (name === "find") {
    if (args.some((w) => /^-(?:delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(w))) return deny("find с -delete/-exec");
    return ["", ""];
  }
  if (name === "rsync" && args.some((w) => w === "--remove-source-files")) return deny("rsync --remove-source-files трие източника");
  if (name === "cp" || name === "install" || name === "rsync") {
    const t = args.findIndex((w) => w === "-t" || w.startsWith("--target-directory"));
    const dest = t >= 0 ? (args[t].includes("=") ? args[t].split("=")[1] : args[t + 1]) : args.filter((w) => !w.startsWith("-")).pop();
    if (dest && wordTier(dest, state.cwd, set)) return deny("целта е пазен файл");
    return ["", ""];
  }
  if (INTERP.test(name)) {
    // Пускане на пазен скрипт (`node .claude/hooks/guard-x.mjs`, `node --check …`) е четене/изпълнение — свободно.
    // Пазен път в код (-e/-c/-p/--eval/--import/-r) или като аргумент на друг скрипт → отказ: скриптът може да пише.
    let i = 0;
    while (i < args.length && args[i].startsWith("-")) {
      if (/^(?:-e|-c|-p|--eval|--print|-r|--require|--import|--loader|--experimental-loader|--input-type|-m|-x|-S)$/.test(args[i])) return deny("пазен път в код за интерпретатор (сглобява се по време на изпълнение)");
      i += 1;
    }
    const scriptOnly = hits.every(([j]) => j === i);
    return scriptOnly ? ["", ""] : deny("пазен път като аргумент на скрипт — скриптът може да пише");
  }
  return deny("команда, която може да пише в пазен път");
}

/** Телата на heredoc-ите заедно с програмата, която ги чете. */
function heredocs(src) {
  const out = [];
  const re = /<<(-?)\s*(['"]?)([\w.-]+)\2/g;
  let m;
  while ((m = re.exec(src))) {
    if (src[m.index + 2] === "<" || src[m.index - 1] === "<") continue; // here-string
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    let head = "?";
    try {
      const a = commandOf(shellWords(src.slice(lineStart, m.index)).cmds.pop() || []);
      head = base(a[0] || "?");
      // Съобщение за commit през stdin (`git commit -F - <<EOF`) е данни; `git apply <<EOF` пише → не е четене.
      if (head === "git") head = GIT_READ.has(gitSub(a.slice(1))) ? "cat" : "git";
      // `cat <<'EOF' | node`: тялото стига до изпълнителя след пайпа, не до cat.
      const lineEnd = src.indexOf("\n", m.index);
      const after = src.slice(m.index + m[0].length, lineEnd < 0 ? src.length : lineEnd);
      for (const st of (pipelineList(head + after)[0] || []).slice(1)) { const ex = stageExecutor(st); if (ex) { head = ex; break; } }
    } catch { head = "?"; }
    const bodyStart = src.indexOf("\n", m.index);
    if (bodyStart < 0) continue;
    let p = bodyStart + 1, end = src.length;
    while (p < src.length) {
      let nl = src.indexOf("\n", p); if (nl < 0) nl = src.length;
      const line = src.slice(p, nl);
      if ((m[1] === "-" ? line.replace(/^\t+/, "") : line) === m[3]) { end = p; break; }
      p = nl + 1;
    }
    out.push({ head, body: src.slice(bodyStart + 1, end) });
  }
  return out;
}

// ── Пайп: пазен път в едно звено → изпълнител в следващо ──────────────────────────────────────────────
// `echo <пазен> | xargs rm`, `… | sh`, `… | while read f; do rm "$f"; done`: пътят е в звено, което само „чете“, а
// изпълнителят няма аргументи — по думите си всяко звено е невинно (отворения spec на Кодаджията, 21.11.2026).

/** Индексът на затварящата скоба за `(` на позиция `open` (кавичките се прескачат). */
function closeParenAt(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "'") { const j = s.indexOf("'", i + 1); i = j < 0 ? s.length : j; continue; }
    if (c === '"') { for (i++; i < s.length && s[i] !== '"'; i++) if (s[i] === "\\") i++; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return s.length - 1;
}

/** Командните редове като списъци от звена на пайп. Кавички, `$(…)`, `<(…)`, `>(…)` и телата на heredoc се прескачат. */
function pipelineList(src) {
  const s = String(src || ""), out = [], pending = [];
  let stages = [], cur = "";
  const endStage = () => { stages.push(cur.trim()); cur = ""; };
  const endLine = () => { endStage(); const st = stages.filter(Boolean); if (st.length) out.push(st); stages = []; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { cur += c + (s[i + 1] ?? ""); i++; continue; }
    if (c === "'" || c === "`") { const j = s.indexOf(c, i + 1), k = j < 0 ? s.length - 1 : j; cur += s.slice(i, k + 1); i = k; continue; }
    if (c === '"') { let k = i + 1; for (; k < s.length && s[k] !== '"'; k++) if (s[k] === "\\") k++; cur += s.slice(i, k + 1); i = k; continue; }
    if (/[$<>]/.test(c) && s[i + 1] === "(") { const k = closeParenAt(s, i + 1); cur += s.slice(i, k + 1); i = k; continue; }
    if (c === "<" && s[i + 1] === "<" && s[i + 2] !== "<" && s[i - 1] !== "<") {
      const m = /^<<(-?)\s*(['"]?)([\w.-]+)\2/.exec(s.slice(i));
      if (m) { pending.push({ delim: m[3], strip: m[1] === "-" }); cur += m[0]; i += m[0].length - 1; continue; }
    }
    if (c === "\n") {
      endLine();
      for (const h of pending.splice(0)) { // тялото на heredoc е данни на своята команда (съди се в heredocs())
        let p = i + 1;
        while (p < s.length) { let e = s.indexOf("\n", p); if (e < 0) e = s.length; const line = s.slice(p, e); p = e + 1; if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break; }
        i = p - 1;
      }
      continue;
    }
    if (c === "|" && s[i + 1] === "|") { endLine(); i++; continue; }
    if (c === "|") { endStage(); if (s[i + 1] === "&") i++; continue; }
    if (c === "&" && s[i + 1] === "&") { endLine(); i++; continue; }
    if (c === "&" && (s[i + 1] === ">" || s[i - 1] === ">")) { cur += c; continue; } // `&>`, `>&` са пренасочвания
    if (c === ";" || c === "&" || c === "(" || c === ")") { endLine(); continue; }
    cur += c;
  }
  endLine();
  return out;
}

const STDIN_LOOP = /^(?:while|until|for|read|mapfile|readarray|eval|source|\.|parallel)$/;
/** Звено, което изпълнява входа си (код или аргументи от stdin) → име; иначе "". */
function stageExecutor(stage) {
  let argv;
  try { argv = shellWords(stage).cmds[0] || []; } catch { return "?"; }
  const raw = argv.filter((w) => !/^[A-Za-z_]\w*=/.test(w));
  if (!raw.length) return "";
  if (STDIN_LOOP.test(base(raw[0]))) return base(raw[0]);
  for (const m of stage.matchAll(/>\(([^)]*)\)/g)) { const ex = stageExecutor(m[1]); if (ex) return ex; } // `tee >(sh)`
  const a = commandOf(raw), n = base(a[0] || ""), opts = a.slice(1);
  if (raw.slice(0, raw.length - a.length).some((w) => base(w) === "xargs")) return !a.length || READERS.has(n) ? "" : `xargs ${n}`;
  if (INTERP.test(n)) {
    // Проба на пазач (`printf '…' | node .claude/hooks/guard-x.mjs`): stdin е payload-ът, кукaта само съди.
    const script = opts.find((w) => !w.startsWith("-"));
    const code = opts.some((w) => /^(?:-e|-c|-p|--eval|--print|-r|--require|--import|-m|-)$/.test(w));
    return !code && script && /(?:^|\/)\.claude\/hooks\/[\w.-]+\.mjs$/.test(script) ? "" : n;
  }
  if (/^[gmn]?awk$/.test(n)) return opts.some((w) => !w.startsWith("-") && /system\s*\(|\||>/.test(w)) ? n : "";
  if (n === "sed") return opts.some((w) => /(?:^|[;\n{}]\s*)e(?:\s|;|$)/.test(w) || /^s(.)(?:\\.|(?!\1).)*\1(?:\\.|(?!\1).)*\1[gpIiMm0-9]*e/.test(w)) ? "sed e" : "";
  return "";
}

/** Ниво на пазен път в текст: свободният текст (пътищата на пазачите) и всяка дума като път (вкл. импортите на куките). */
function textOrPathTier(text, state, set) {
  let t = tierOfText(text, set);
  try { for (const argv of shellWords(text).cmds) for (const w of argv) t = max(t, tierOfPath(expandVars(w, state.vars || {}), state.cwd, set)); } catch { /* текстът стига */ }
  return t;
}

function pipeVerdict(src, state, set) {
  for (const stages of pipelineList(src)) {
    for (let k = 0; k < stages.length; k++) {
      const ex = stageExecutor(stages[k]);
      if (!ex) continue;
      // Входът на изпълнителя в собственото му звено: `xargs rm < <(echo …)`, `sh <<< "…"`, `xargs rm < списък`.
      const own = [...stages[k].matchAll(/<\(([^)]*)\)/g)].map((m) => m[1])
        .concat([...stages[k].matchAll(/<<<\s*('[^']*'|"[^"]*"|\S+)/g)].map((m) => m[1]))
        .concat([...stages[k].matchAll(/(?:^|[^<>&\d])<\s*([^\s<(][^\s]*)/g)].map((m) => m[1]));
      const t = max(k ? textOrPathTier(stages.slice(0, k).join(" | "), state, set) : "", own.length ? textOrPathTier(own.join(" "), state, set) : "");
      if (t) return [`пазен път стига като данни до ${ex}, който изпълнява входа си`, t];
    }
  }
  return ["", ""];
}

function bashVerdictAt(command, state, set, depth) {
  if (depth > 4) return ["твърде дълбоко вложени команди", "A"];
  // `>|` (noclobber override) е пренасочване, а не пайп — иначе целта изглежда като нова команда.
  const src = sanitize(String(command || "")).replace(/>\|/g, "> ");
  for (const h of heredocs(src)) {
    const t = tierOfText(h.body, set);
    if (t && !READERS.has(h.head)) return [`heredoc към ${h.head || "?"} споменава пазен път`, t];
  }
  const pv = pipeVerdict(src, state, set);
  if (pv[0]) return pv;
  let parsed;
  try { parsed = shellWords(src); } catch { return tierOfText(src, set) ? ["неразбираема команда с пазен път", tierOfText(src, set)] : ["", ""]; }
  for (const argv of parsed.cmds) {
    const v = argvVerdict(argv, state, set);
    if (v[0]) return v;
    for (const inner of execStrings(argv)) { const w = bashVerdictAt(inner, state, set, depth + 1); if (w[0]) return w; }
  }
  for (const inner of parsed.subs) { const w = bashVerdictAt(inner, state, set, depth + 1); if (w[0]) return w; }
  return ["", ""];
}

/** Bash/Monitor команда → [причина, ниво] (["", ""] = свободно). */
export function bashVerdict(command, { cwd = ROOT, set = protectedSet() } = {}) {
  return bashVerdictAt(command, { cwd }, set, 0);
}

/** Write/Edit/MultiEdit/NotebookEdit → [причина, ниво]. */
export function writeVerdict(toolInput = {}, { cwd = ROOT, set = protectedSet() } = {}) {
  const f = toolInput.file_path || toolInput.notebook_path || toolInput.path || "";
  const t = tierOfPath(f, cwd, set);
  return t ? [`запис в пазен файл (${relative(ROOT, resolve(cwd, f)) || f})`, t] : ["", ""];
}

/** Решението за payload: {action: "allow"|"deny"|"ask", reason}. Чиста функция — тестваема. */
export function decide(p, { set = protectedSet() } = {}) {
  const tool = String(p?.tool_name || "");
  const cwd = typeof p?.cwd === "string" && isAbsolute(p.cwd) ? p.cwd : ROOT;
  let why = "", tier = "";
  if (WRITE_TOOLS.has(tool)) [why, tier] = writeVerdict(p.tool_input || {}, { cwd, set });
  else if (tool === "Bash" || tool === "PowerShell" || tool === "Monitor") [why, tier] = bashVerdict(p.tool_input?.command, { cwd, set });
  if (!why) return { action: "allow", reason: "" };
  const agent = p.agent_id || p.agent_type;
  if (agent) return { action: "deny", reason: why, agent: String(p.agent_type || p.agent_id) };
  return tier === "A" ? { action: "ask", reason: why } : { action: "allow", reason: "" };
}

function main() {
  let p;
  try { p = JSON.parse(readFileSync(0, "utf8")); } catch {
    process.stderr.write("guard-self: неразбираем payload — отказ (fail-closed).\n");
    process.exit(2);
  }
  const d = decide(p);
  if (d.action === "deny") {
    process.stderr.write(
      `guard-self: „${d.agent}“ не може да сменя пазачите на флота (${d.reason}). ` +
      `Куките, настройките, модовете и паметта се сменят само от главната сесия с одобрение на човек. ` +
      `Предай поправката като diff с файл:ред в ПРЕДАВАНЕ.\n`,
    );
    process.exit(2);
  }
  if (d.action === "ask") {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `guard-self: смяна на пазач на флота (${d.reason}). Потвърди само ако си я поискал.`,
      },
    }) + "\n");
  }
  process.exit(0);
}

if (isMain(import.meta.url)) {
  try { main(); } catch (e) {
    process.stderr.write(`guard-self: вътрешна грешка (${String(e?.message || e).slice(0, 120)}) — отказ (fail-closed).\n`);
    process.exit(2);
  }
}
