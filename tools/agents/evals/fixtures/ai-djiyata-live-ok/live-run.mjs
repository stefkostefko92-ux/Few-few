#!/usr/bin/env node
// live-run.mjs — пуска НАШИ агенти така, както тичат в продукция, и връща дословния им отговор.
//
// Защо (2026-10-27): паметта, процедурата и блокът ПРЕДАВАНЕ не стигаха до агентите от юли, а всички
// тестове бяха зелени — те мереха какво връщат куките, не какво агентът вижда. Единственото, което хвана
// дупката, беше агент, пуснат истински. Този двигател прави това повторяемо:
//   • всяко пускане е НОВА headless сесия (`claude -p`) — уменията и дефинициите се зареждат наново, както
//     в нова работна сесия; в текущата сесия умение, създадено по-късно, не стига до агентите;
//   • в ИЗОЛИРАНО копие на репото (git worktree на дадения ref) — агентът не може да пипне работното дърво;
//   • главната сесия пуска агента през Agent tool — минава SubagentStart/SubagentStop куките, умението
//     agent-doctrine, картата и паметта, т.е. целия продукционен път;
//   • Stop куките на оркестратора (session-dod, artifact-sync) са махнати само в копието: те съдят главната
//     сесия и подменяха отговора;
//   • оценката мери, не учи: копието е в eval режим (tools/lib/eval-mode.mjs, файл в .git/worktrees/<копие>/),
//     иначе memory-capture публикува поуки в agents/memory направо от копието (общи refs) и опит 2 от pass^k
//     извлича поуката на опит 1. AGENT_MEMORY_SYNC=0 НЕ стига — спира само фоновия sync (хванато на 27.10).
//     Прегледът на PR (pr-review.mjs) е продукционна работа и учи — той не пуска eval режим.
//
//   node tools/agents/evals/live-run.mjs --jobs kasadjiyata:kasadjiyata:3,seo:seo --out <папка> [--ref HEAD]
//     job = <агент>:<spec id>[:опити]  → <папка>/<spec>.txt или <spec>.<n>.txt
//
// Изисква `claude` CLI с вход (локално или в облачна сесия). Без него → изход 2 с ясно съобщение.

import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setEvalMode } from "../../lib/eval-mode.mjs";
import { isMain } from "../../lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..", "..");
export const ORCHESTRATOR_STOP_HOOKS = /session-dod|artifact-sync/;
export const ALLOWED = ["Agent", "Read", "Grep", "Glob", "WebFetch", "WebSearch"];

/**
 * Инструментите на ОЦЕНКАТА (2026-11-02, пилот „качество първо“): досега копието позволяваше само четене, а в
 * продукция същите агенти пишат и пускат тестове — Изпитателят „пишеше“ e2e тест, който не можеше да запише,
 * Разбивача не можеше да пусне PoC. Оценката мереше описание, не работа. Сега: запис само под /tmp (копието
 * /tmp/live-run-* и scratchpad-ът; истинското репо е извън /tmp и остава недостъпно за Write/Edit), пускане на
 * тестове и наши инструменти, git само за четене. Пазачите (guard-*) тичат в копието както в продукция.
 * Без npx за произволни пакети (мрежа + доставчик) — само конкретните инструменти на продуктите.
 */
export const EVAL_ALLOWED = [...ALLOWED, "Skill",
  "Edit(//tmp/**)", "Write(//tmp/**)",
  "Bash(node *)", "Bash(npm test*)", "Bash(npm run *)", "Bash(bash tools/*)",
  "Bash(npx tsx *)", "Bash(npx tsc *)", "Bash(npx vitest *)", "Bash(npx playwright *)",
  "Bash(git diff *)", "Bash(git log *)", "Bash(git show *)", "Bash(git status*)",
  "Bash(ffprobe *)", "Bash(mkdir -p /tmp/*)",
  // 14.11.2026: локалната търсачка на ui-ux-pro-max (само stdlib, без мрежа) — без нея оценката мереше
  // Дизайнера без каталога, защото командата искаше одобрение (в сесия го дава собственикът).
  "Bash(python3 -I -B .claude/skills/ui-ux-pro-max/scripts/search.py *)"];

/** Обвивката за главната сесия: пусни агента със задачата дословно, върни дословно отговора. */
export function wrapperPrompt(agent, task) {
  // 27.10.2026 (жив гейт): агентът по подразбиране тече на ЗАДЕН план и обвивката понякога приключваше с „агентът
  // още работи, ще върна отговора“ — `claude -p` печата това и излиза; оценката получи бележка вместо отговор.
  return `Пусни нашия агент ${agent} през Agent tool (subagent_type: ${agent}, run_in_background: false — на ПРЕДЕН план, изчакай го) ВЕДНЪЖ, със задачата по-долу, дословно и без добавки. ` +
    `Не приключвай, преди да имаш отговора му. ` +
    `След това върни САМО дословния му отговор — без коментар, без съкращения, без обобщение. ` +
    // 27.10.2026: при второ известие за същия агент последното съобщение беше „вече предадох отговора по-горе“
    // — `claude -p` връща само последното, оценката получи коментар вместо отговора на Разбивача.
    `Ако пристигне повече от един резултат, последното ти съобщение пак е ПЪЛНИЯТ дословен отговор на агента (най-пълният), никога бележка за дубликата.\n\nЗАДАЧА:\n${task}`;
}

/** Махни Stop куките на оркестратора от settings на копието (агентските куки остават). */
export function stripOrchestratorStop(settings) {
  const s = JSON.parse(JSON.stringify(settings));
  if (Array.isArray(s.hooks?.Stop)) {
    s.hooks.Stop = s.hooks.Stop
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !ORCHESTRATOR_STOP_HOOKS.test(String(h.command || ""))) }))
      .filter((g) => g.hooks.length);
  }
  return s;
}

/** `агент:spec[:k]` → задачи с имена на изходите. */
export function expandJobs(spec, readTask) {
  const jobs = [];
  for (const item of String(spec || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [agent, specId, k] = item.split(":");
    const n = Math.max(1, Number(k) || 1);
    const task = readTask(specId || agent);
    for (let i = 1; i <= n; i++) jobs.push({ agent, specId: specId || agent, name: n > 1 ? `${specId || agent}.${i}.txt` : `${specId || agent}.txt`, task });
  }
  return jobs;
}

/** JSON изходът на `claude -p --output-format json` → текст и цена; невалиден → суров текст. */
export function parseResult(out) {
  try { const j = JSON.parse(out); return { text: String(j.result || ""), costUsd: Number(j.total_cost_usd) || 0, sessionId: String(j.session_id || "") }; }
  catch { return { text: String(out || ""), costUsd: 0, sessionId: "" }; }
}

/**
 * Записаното от агента (Write/Edit/MultiEdit) — от транскрипта на СОБСТВЕНАТА сесия на пускането (2026-11-02).
 * Щом агентите в оценката могат да пишат, кодът им е във файл, а финалният текст е само обобщение: оценителят
 * мереше обобщението („стабилни селектори“ липсваха, а тестът ги имаше). Транскриптът е точен за всяко пускане,
 * за разлика от файла в копието, който паралелен опит може да е презаписал.
 */
export function attachWrites(text, sessionId, wt, home = process.env.HOME || "/root") {
  if (!sessionId || !wt || !/^[\w-]+$/.test(sessionId)) return String(text);
  const dir = join(home, ".claude", "projects", String(wt).replace(/[^A-Za-z0-9-]/g, "-"), sessionId, "subagents");
  if (!existsSync(dir)) return String(text);
  const written = [];
  for (const f of readdirSync(dir).filter((f) => /^agent-.*\.jsonl$/.test(f)).sort()) {
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      let r; try { r = JSON.parse(line); } catch { continue; }
      const c = r?.message?.content;
      if (!Array.isArray(c)) continue;
      for (const b of c) {
        if (b?.type !== "tool_use" || !b.input?.file_path) continue;
        if (b.name === "Write") written.push({ path: b.input.file_path, how: "Write", body: String(b.input.content || "") });
        else if (b.name === "Edit") written.push({ path: b.input.file_path, how: "Edit", body: String(b.input.new_string || "") });
        else if (b.name === "MultiEdit") for (const e of b.input.edits || []) written.push({ path: b.input.file_path, how: "Edit", body: String(e.new_string || "") });
      }
    }
  }
  let out = String(text), total = 0;
  for (const w of written.slice(0, MAX_FILES)) {
    if (total >= TOTAL_CAP) break;
    const body = w.body.slice(0, FILE_CAP);
    total += body.length;
    out += `\n\n--- записано от агента (${w.how}): ${w.path} ---\n${body}`;
  }
  return out;
}

// 27.10.2026 (жив гейт): при отказан запис в репото агентът пише в scratchpad-а на сесията и посочва пътя —
// правилно поведение, но оценителят виждаше само текста и „коректен fxmanifest“ падаше за файл, който съществува.
// Посочените файлове от scratchpad-а на копието се прикачват към оценявания изход (с таван).
export const SCRATCH_RE = /\/tmp\/claude-0\/-tmp-live-run-[^\s`'"“”)]+?\/scratchpad(?:\/[^\s`'"“”)]*)?/g;
const FILE_CAP = 20_000, TOTAL_CAP = 80_000, MAX_FILES = 20;

/** Текстът + съдържанието на посочените файлове от scratchpad-а (папка → файловете в нея, рекурсивно). */
export function attachScratchpad(text) {
  const files = [];
  const walk = (p) => {
    if (files.length >= MAX_FILES || !existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) { for (const e of readdirSync(p).sort()) walk(join(p, e)); }
    else if (st.isFile() && !files.includes(p)) files.push(p);
  };
  for (const m of new Set(String(text).match(SCRATCH_RE) || [])) walk(m.replace(/[.,;:]+$/, ""));
  let out = String(text), total = 0;
  for (const f of files) {
    if (total >= TOTAL_CAP) break;
    const body = readFileSync(f, "utf8").slice(0, FILE_CAP);
    total += body.length;
    out += `\n\n--- приложен файл от scratchpad: ${f} ---\n${body}`;
  }
  return out;
}

export function claudeAvailable() {
  try { execFileSync("claude", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
}

/** Изолирано копие на ref-а с махнати Stop куки на оркестратора. Връща пътя и функция за почистване.
 *  overlay: {from, paths} — тези пътища идват от друг ref (преглед на стар PR с ТЕКУЩИЯ агентски слой).
 *  measure: true (по подразбиране) — eval режим в копието: паметта се чете, но нищо не се записва. */
// stderr на git остава в грешката (14.11.2026): с „ignore“ пълен диск изглеждаше като голо „код 128“.
const GIT_STDIO = ["ignore", "ignore", "pipe"];
export function makeWorktree(ref = "HEAD", overlay = null, { measure = true, sparse = null, memory = "on" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "live-run-"));
  rmSync(dir, { recursive: true, force: true });
  if (sparse?.length) {
    // Частично копие (31.10.2026): файловете в корена + агентският слой + подадените папки — 12 MB вместо
    // 2,1 GB за преглед на PR по един продукт (code.claude.com/docs/en/large-codebases, sparse worktree).
    execFileSync("git", ["-C", ROOT, "worktree", "add", "--no-checkout", "--detach", dir, ref], { stdio: GIT_STDIO });
    execFileSync("git", ["-C", dir, "sparse-checkout", "set", "--no-cone", ...sparsePatterns(sparse)], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "checkout", "-q", "--detach", ref], { stdio: "ignore" });
  } else execFileSync("git", ["-C", ROOT, "worktree", "add", "--detach", dir, ref], { stdio: GIT_STDIO });
  if (overlay) execFileSync("git", ["-C", dir, "checkout", overlay.from, "--", ...overlay.paths], { stdio: "ignore" });
  // memory: "off" — рамо „без поуките“ за A/B на паметта (31.10.2026): memory-preload не подава личната памет.
  if (measure) setEvalMode(dir, { label: "live-run", memory: memory === "off" ? "off" : "on", minutes: 180 });
  const sp = join(dir, ".claude", "settings.json");
  writeFileSync(sp, JSON.stringify(stripOrchestratorStop(JSON.parse(readFileSync(sp, "utf8"))), null, 2) + "\n");
  const cleanup = () => { try { execFileSync("git", ["-C", ROOT, "worktree", "remove", "--force", dir], { stdio: "ignore" }); } catch { rmSync(dir, { recursive: true, force: true }); } };
  return { dir, cleanup };
}

/** Шаблоните за частично копие: файловете в корена, агентският слой, deploy/ и подадените папки. */
export function sparsePatterns(dirs) {
  const top = [...new Set([".claude", "tools", "deploy", ...dirs])].filter((d) => /^[\w.@-]+$/.test(d));
  return ["/*", "!/*/", ...top.map((d) => `/${d}/`)];
}

/** Сменя (или добавя) скаларно поле във frontmatter. Само в изолираното копие — за рамена на
 *  сравнение (усилие, модел), без да се пипа истинската дефиниция (31.10.2026). */
export function patchFrontmatter(md, field, value) {
  if (!/^[A-Za-z][\w-]*$/.test(field) || !/^[\w.:-]+$/.test(value)) throw new Error(`невалидно --set ${field}=${value}`);
  const [pre, fm, ...rest] = md.split(/^---\s*$/m);
  if (rest.length === 0) throw new Error("няма frontmatter");
  const re = new RegExp(`^${field}:.*$`, "m");
  const next = re.test(fm) ? fm.replace(re, `${field}: ${value}`) : fm.replace(/\s*$/, `\n${field}: ${value}\n`);
  return [pre, next, ...rest].join("---");
}

/** Рамо за аблация (31.10.2026): `път::търси::замени` — точен текст, само в копието; липсващ текст е грешка
 *  (иначе рамото тихо би мерило същото като базата). Пример: махане на ред от доктрината на агентите. */
export function applyPatch(dir, spec) {
  const [rel, find, repl = ""] = String(spec).split("::");
  if (!rel || !find || rel.includes("..") || rel.startsWith("/")) throw new Error(`невалидно --patch „${spec}“ (път::търси::замени)`);
  const f = join(dir, rel);
  const src = readFileSync(f, "utf8");
  if (!src.includes(find)) throw new Error(`--patch: текстът не е намерен в ${rel}`);
  writeFileSync(f, src.split(find).join(repl));
  return rel;
}

/** `kodadjiyata.effort=medium,seo.model=sonnet` → [{agent, field, value}] */
export function parseSets(spec) {
  return String(spec || "").split(",").filter(Boolean).map((s) => {
    const m = s.trim().match(/^([\w-]+)\.([A-Za-z][\w-]*)=([\w.:-]+)$/);
    if (!m) throw new Error(`невалидно --set „${s}“ (агент.поле=стойност)`);
    return { agent: m[1], field: m[2], value: m[3] };
  });
}

/** Аргументите на едно пускане — с ИЗРИЧНА собствена сесия (виж runJobs). */
export function jobArgs(j, { allowed = ALLOWED, extraArgs = [], sessionId }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(sessionId))) throw new Error("jobArgs: sessionId трябва да е UUID");
  return ["-p", wrapperPrompt(j.agent, j.task), "--session-id", sessionId, "--allowedTools", ...allowed, "--output-format", "json", ...extraArgs];
}

/** Пуска задачите (конкурентно) в копието. Връща [{...job, ok, text, costUsd, err, seconds}]. */
// wtFor(job) → {dir, cleanup} | null: собствено копие за пускане, което ПИШЕ (2026-11-02 — паралелните опити в едно
// копие виждаха и си приписваха файловете един на друг; сляпото съдийство го хвана). null → общото `wt`.
export async function runJobs(jobs, { wt, wtFor = () => null, bin = "claude", concurrency = 3, timeoutMs = 900000, extraArgs = [], allowed = ALLOWED, onDone = () => {} } = {}) {
  const results = new Array(jobs.length);
  let i = 0;
  const one = async (j) => {
    const own = wtFor(j);
    try { return await oneIn(j, own?.dir || wt); } finally { own?.cleanup(); }
  };
  const oneIn = (j, wt) => new Promise((resolve) => {
    const t0 = Date.now();
    // Собствена сесия на всяко пускане (2026-11-02): без нея паралелните опити наследяваха сесията на родителя —
    // общ транскрипт и общ scratchpad, тоест записаното от един опит се приписваше на друг (сляпото съдийство
    // видя едни и същи файлове в два опита). Махането на CLAUDE_CODE_SESSION_ID НЕ стига (проба: session_id пак
    // родителският); `--session-id <uuid>` стига (проба: върнатият session_id = поисканият).
    const sessionId = randomUUID();
    const env = { ...process.env, CLAUDE_PROJECT_DIR: wt, AGENT_MEMORY_SYNC: "0" };
    delete env.CLAUDE_CODE_SESSION_ID;
    execFile(bin, jobArgs(j, { allowed, extraArgs, sessionId }),
      { cwd: wt, timeout: timeoutMs, maxBuffer: 1 << 26, env },
      (err, stdout, stderr) => {
        const r = parseResult(stdout);
        if (r.text) r.text = attachWrites(attachScratchpad(r.text), sessionId, wt);
        resolve({ ...j, ok: !err && !!r.text.trim(), text: r.text, costUsd: r.costUsd, err: err ? String(stderr || err.message).slice(0, 300) : "", seconds: Math.round((Date.now() - t0) / 1000) });
      });
  });
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (i < jobs.length) { const k = i++; results[k] = await one(jobs[k]); onDone(results[k]); }
  }));
  return results;
}

async function main(argv) {
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : null; };
  if (!claudeAvailable()) { console.error("live-run: няма `claude` CLI с вход — живото пускане не е възможно тук."); process.exit(2); }
  const out = val("--out");
  if (!out || !val("--jobs")) { console.error("употреба: live-run.mjs --jobs агент:spec[:k],… --out <папка> [--ref HEAD] [--concurrency 3] [--set агент.поле=стойност,…] [--memory off] [--patch път::търси::замени]"); process.exit(2); }
  const specDir = join(ROOT, "tools", "agents", "evals", "specs");
  const jobs = expandJobs(val("--jobs"), (id) => {
    const f = join(specDir, id + ".json");
    if (!existsSync(f)) throw new Error(`няма spec „${id}"`);
    return JSON.parse(readFileSync(f, "utf8")).task;
  });
  mkdirSync(out, { recursive: true });
  const sets = parseSets(val("--set"));
  const patches = [];
  for (let k = argv.indexOf("--patch"); k >= 0; k = argv.indexOf("--patch", k + 1)) patches.push(argv[k + 1]);
  // Рамото се строи наново във всяко копие: всяко пускане пише в свое (виж wtFor в runJobs).
  const arm = (log) => {
    const w = makeWorktree(val("--ref") || "HEAD", null, { memory: val("--memory") || "on" });
    for (const p of patches) { const r = applyPatch(w.dir, p); if (log) console.log(`рамо: --patch ${r} (само в копието)`); }
    for (const s of sets) {
      const f = join(w.dir, ".claude", "agents", `${s.agent}.md`);
      writeFileSync(f, patchFrontmatter(readFileSync(f, "utf8"), s.field, s.value));
      if (log) console.log(`рамо: ${s.agent}.${s.field} = ${s.value} (само в копието)`);
    }
    return w;
  };
  if (val("--memory") === "off") console.log("рамо: без личната памет (само в копието)");
  const { dir, cleanup } = arm(true);
  try {
    const res = await runJobs(jobs, { wt: dir, wtFor: () => arm(false), concurrency: Number(val("--concurrency")) || 3, allowed: EVAL_ALLOWED, onDone: (r) => {
      if (r.ok) writeFileSync(join(out, r.name), r.text);
      console.log(`${r.ok ? "✓" : "✗"} ${r.name} · ${r.agent} · ${r.text.length} зн. · $${r.costUsd.toFixed(2)} · ${r.seconds}s${r.err ? " · " + r.err : ""}`);
    } });
    const cost = res.reduce((a, r) => a + r.costUsd, 0);
    console.log(`готово: ${res.filter((r) => r.ok).length}/${res.length} · $${cost.toFixed(2)}`);
    process.exitCode = res.every((r) => r.ok) ? 0 : 1;
  } finally { cleanup(); }
}

if (isMain(import.meta.url)) await main(process.argv.slice(2));
