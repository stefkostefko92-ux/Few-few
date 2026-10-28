#!/usr/bin/env node
// live-gate.mjs — промяна по агентския слой се приема само след като е доказана НА ЖИВО.
//
// Класът грешка, който това затваря (2026-10-27): от юли агентите не виждаха процедурата, блока
// ПРЕДАВАНЕ, картата и собствената си памет — куката подаваше ~25 000 знака, а харнесът пуска до 10 000.
// Всички тестове бяха зелени, защото мереха какво ВРЪЩА куката, не какво агентът ВИЖДА. Същият ден още
// два такива дефекта (форматът на ПРЕДАВАНЕ на отстъпен ред; върнатият агент губеше отговора си) се видяха
// само при истинско пускане. Правило оттук: всичко, което стига до агента, се проверява през харнеса.
//
//   node tools/agents/live-gate.mjs            # проба + оценки на живо, после печат в evals/live-gate.json
//   node tools/agents/live-gate.mjs --check    # без мрежа (gate.mjs/CI): входовете съвпадат ли с печата
//
// Проба на контекста: агентът връща JSON с ДОСЛОВНИТЕ думи след всеки маркер (доктрина, процедура,
// споделени поуки, карта, памет) и след началото на коренния CLAUDE.md (трябва да липсва — omitClaudeMd).
// Цитатът се сверява със самия източник — налучкан или преразказан отговор не минава.
// Оценки: критичните spec-ове (Касаджията и Продавача по 3 опита — pass^k) + golden spec-а на всеки агент,
// чиято дефиниция се е сменила; verifier-ът минава на всеки изход.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
export const STAMP = join(HERE, "evals", "live-gate.json");
export const CANARIES = ["seo", "kodadjiyata", "dizayner"]; // sonnet без Bash · opus с Bash без Write · с още едно умение
export const CRITICAL = [["kasadjiyata", "kasadjiyata", 3], ["prodavacha", "prodavacha", 3]];

/** Всичко, което определя какво агентът вижда и как се държи (без паметта — тя расте всеки ден). */
export function inputFiles(root = ROOT) {
  const ls = (d, f) => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter(f).map((x) => `${d}/${x}`) : []);
  return [
    ".claude/settings.json",
    ".claude/agents/_teams.json",
    ".claude/agents/_memory/PROCEDURE.md",
    ".claude/agents/_memory/SECURITY.md",
    ".claude/skills/agent-doctrine/SKILL.md",
    "tools/lib/memory-retrieval.mjs",
    "tools/lib/memory-branch.mjs",
    "tools/agents/teams.mjs",
    "tools/agents/handoff.mjs",
    ...ls(".claude/hooks", (x) => x.endsWith(".mjs") && !x.endsWith(".test.mjs")),
    ...ls(".claude/agents", (x) => x.endsWith(".md") && !x.startsWith("_") && x !== "README.md"),
  ].filter((f) => existsSync(join(root, f))).sort();
}

const sha = (s) => createHash("sha256").update(s).digest("hex");
export function fileHashes(root = ROOT, files = inputFiles(root)) {
  return Object.fromEntries(files.map((f) => [f, sha(readFileSync(join(root, f)))]));
}
export function inputsHash(hashes) {
  return sha(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)).map(([f, h]) => `${f}\n${h}`).join("\n"));
}

/** Кои входове са сменени спрямо печата. */
export function changedSince(stamp, hashes) {
  const before = stamp?.files || {};
  const all = new Set([...Object.keys(before), ...Object.keys(hashes)]);
  return [...all].filter((f) => before[f] !== hashes[f]).sort();
}

/** Кои агенти да се пробват и оценят според сменените входове. */
export function planFor(changed, agentsAll) {
  const defs = changed.filter((f) => /^\.claude\/agents\/[^_/][^/]*\.md$/.test(f)).map((f) => f.split("/").pop().replace(/\.md$/, ""));
  const plumbing = changed.some((f) => !/^\.claude\/agents\/[^_/][^/]*\.md$/.test(f));
  const probe = [...new Set([...(plumbing || !defs.length ? CANARIES : []), ...defs])].filter((a) => agentsAll.includes(a));
  const evals = [...CRITICAL.map(([a, s, k]) => `${a}:${s}:${k}`), ...defs.filter((a) => !CRITICAL.some(([c]) => c === a)).map((a) => `${a}:${a}`)];
  return { probe, evals: [...new Set(evals)] };
}

// ── Проба на контекста ──────────────────────────────────────────────────────────────────────────
export const MARKERS = {
  doctrine: "⛨ ДОКТРИНА ЗА СИГУРНОСТ",
  procedure: "⚙ ОБЩА ПРОЦЕДУРА",
  shared: "🔗 СПОДЕЛЕНИ ПОУКИ",
  card: "🧭 ТВОЯТА КАРТА",
  memory: "Проверена памет на",
  rootClaudeMd: "Guidance for AI assistants working in this",
};
export const MUST_BE_ABSENT = ["rootClaudeMd"];

export function probeTask() {
  const fields = Object.entries(MARKERS).map(([k, m]) => `"${k}": дословно първите 6 думи СЛЕД „${m}“ или null, ако го няма в контекста ти`).join(";\n");
  return "Диагностика на контекста — без инструменти и без търсене; само от това, което вече е в контекста ти при старта. " +
    "Върни САМО един JSON обект (без код-ограда, без друг текст преди него) с полетата:\n" + fields +
    ";\n\"handoffFields\": true, ако във формата на блока ПРЕДАВАНЕ виждаш полето „Изход/артефакт:“, иначе false.\n" +
    "Не налучквай и не преразказвай — копирай думите точно. След JSON обекта завърши с блока ПРЕДАВАНЕ (Към: човек, Статус: наред).";
}

/** Думи без пунктуация и регистър — агентът може да изпусне скоба или тире, но не и думите. */
export function words(s) {
  return String(s || "").toLowerCase().replace(/[*„“"'`«»()[\]]/g, " ").split(/\s+/)
    .map((w) => w.replace(/^[.,;:!?—–-]+|[.,;:!?—–-]+$/g, "")).filter(Boolean);
}

/** Текстът, който следва маркера в реалния източник (до 160 знака, през редовете). */
export function followText(source, marker) {
  const i = String(source || "").indexOf(marker);
  if (i < 0) return null;
  return source.slice(i + marker.length, i + marker.length + 160).replace(/\n/g, " ");
}

/** Цитатът на агента верен ли е: поне 4 думи и съвпада с началото на реалния текст след маркера. */
export function quoteMatches(quote, expected) {
  if (quote == null || expected == null) return false;
  const q = words(quote), e = words(expected);
  if (q.length < 4) return false;
  return q.slice(0, 4).every((w, i) => w === e[i]);
}

// Деветият жив гейт (28.10): Летописецът даде грешен обект и после поправен („ползвай само втория“), а тук се
// четеше първият. Важи ПОСЛЕДНИЯТ обект на пробата (поправката идва след грешката); без обект на пробата — първият.
export function firstJson(text) {
  const s = String(text || "");
  const starts = [...s.matchAll(new RegExp(`\\{\\s*"(?:${PROBE_KEYS.join("|")})"\\s*:`, "g"))].map((m) => m.index);
  const start = starts.length ? starts[starts.length - 1] : s.indexOf("{");
  const tail = start >= 0 ? s.slice(start) : s;
  for (let end = tail.indexOf("}"); start >= 0 && end > 0; end = tail.indexOf("}", end + 1)) {
    try { return JSON.parse(tail.slice(0, end + 1)); } catch { /* по-дълъг кандидат */ }
  }
  return lenientProbeJson(tail);
}

// Шестият жив гейт (27.10): агентът цитира `„seo"` (източникът смесва „ с ASCII ") и не екранира кавичката —
// JSON-ът е невалиден, а пробата падаше „няма JSON“, макар цитатите да са верни. Формат не е контекст: стойностите
// на ИЗВЕСТНИТЕ полета се четат между `"ключ":"` и следващото `","<известен ключ>":` / `"}`. Цитатът пак се сверява.
const PROBE_KEYS = [...Object.keys(MARKERS), "handoffFields"];
export function lenientProbeJson(s) {
  const out = {};
  const keyAlt = PROBE_KEYS.join("|");
  for (const k of PROBE_KEYS) {
    const m = s.match(new RegExp(`"${k}"\\s*:\\s*(null|true|false|"([\\s\\S]*?)"(?=\\s*,\\s*"(?:${keyAlt})"\\s*:|\\s*\\}))`));
    if (!m) continue;
    out[k] = m[1] === "null" ? null : m[1] === "true" ? true : m[1] === "false" ? false : m[2].replace(/\\"/g, '"');
  }
  return Object.keys(out).length >= 3 ? out : null;
}

/** Съди отговора на пробата спрямо очакваните източници. Връща { ok, problems }. */
export function judgeProbe(answer, expected) {
  const j = firstJson(answer);
  if (!j) return { ok: false, problems: ["няма JSON в отговора"] };
  const problems = [];
  for (const k of Object.keys(MARKERS)) {
    if (MUST_BE_ABSENT.includes(k)) {
      if (j[k] != null && expected[k] != null && quoteMatches(j[k], expected[k])) problems.push(`${k}: трябва да липсва (omitClaudeMd), а агентът го цитира`);
      continue;
    }
    if (!quoteMatches(j[k], expected[k])) problems.push(`${k}: ${j[k] == null ? "липсва в контекста" : `цитатът „${String(j[k]).slice(0, 60)}“ не съвпада с източника`}`);
  }
  if (j.handoffFields !== true) problems.push("handoffFields: агентът не вижда „Изход/артефакт:“ във формата на ПРЕДАВАНЕ");
  return { ok: problems.length === 0, problems };
}

async function expectedFor(agent, root) {
  const pre = await import(join(root, ".claude", "hooks", "memory-preload.mjs"));
  const skill = readFileSync(join(root, ".claude", "skills", "agent-doctrine", "SKILL.md"), "utf8");
  const agentPart = pre.agentPart(agent, { prompt: "диагностика" });
  const rootMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
  return {
    doctrine: followText(skill, MARKERS.doctrine),
    procedure: followText(skill, MARKERS.procedure),
    shared: followText(pre.sharedLessons(), MARKERS.shared),
    card: followText(agentPart, MARKERS.card),
    memory: followText(agentPart, MARKERS.memory),
    rootClaudeMd: followText(rootMd, MARKERS.rootClaudeMd),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────
function readStamp() { try { return JSON.parse(readFileSync(STAMP, "utf8")); } catch { return null; } }

function check() {
  const stamp = readStamp();
  const hashes = fileHashes();
  if (!stamp) { console.log("✗ live-gate: няма печат — агентският слой никога не е проверен на живо. Пусни: node tools/agents/live-gate.mjs"); return 1; }
  if (stamp.inputsHash === inputsHash(hashes)) { console.log(`✓ live-gate: агентският слой е проверен на живо на ${stamp.date} (${stamp.ref?.slice(0, 9)}) · ${stamp.summary}`); return 0; }
  const ch = changedSince(stamp, hashes);
  console.log(`✗ live-gate: ${ch.length} входа на агентския слой са сменени след живата проверка от ${stamp.date}:\n` +
    ch.slice(0, 15).map((f) => `    ${f}`).join("\n") + (ch.length > 15 ? `\n    … още ${ch.length - 15}` : "") +
    "\n  Тестовете не доказват какво агентът вижда. Пусни: node tools/agents/live-gate.mjs (после комитни evals/live-gate.json)");
  return 1;
}

async function run() {
  const { claudeAvailable, makeWorktree, runJobs, expandJobs } = await import("./evals/live-run.mjs");
  if (!claudeAvailable()) { console.error("live-gate: няма `claude` CLI с вход — живата проверка не е възможна тук."); return 2; }
  const files = inputFiles();
  const dirty = execFileSync("git", ["-C", ROOT, "status", "--porcelain", "--", ...files], { encoding: "utf8" }).trim();
  if (dirty) { console.error(`live-gate: има незаписани промени по агентския слой — комитни ги първо (пробата тича върху commit-а):\n${dirty}`); return 2; }
  const ref = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const hashes = fileHashes(ROOT, files);
  const agentsAll = files.filter((f) => /^\.claude\/agents\/[^_/][^/]*\.md$/.test(f)).map((f) => f.split("/").pop().replace(/\.md$/, ""));
  const stamp = readStamp();
  const plan = planFor(stamp ? changedSince(stamp, hashes) : ["(първа проверка)"], agentsAll);
  console.log(`live-gate · ${ref.slice(0, 9)} · проба: ${plan.probe.join(", ")} · оценки: ${plan.evals.join(", ")}`);

  const { dir, cleanup } = makeWorktree(ref);
  const out = mkdtempSync(join(tmpdir(), "live-gate-out-"));
  try {
    const probeJobs = plan.probe.map((a) => ({ agent: a, specId: `probe-${a}`, name: `probe-${a}.txt`, task: probeTask() }));
    const specDir = join(ROOT, "tools", "agents", "evals", "specs");
    const evalJobs = expandJobs(plan.evals.join(","), (id) => JSON.parse(readFileSync(join(specDir, id + ".json"), "utf8")).task);
    const results = await runJobs([...probeJobs, ...evalJobs], { wt: dir, concurrency: 3, onDone: (r) => console.log(`  ${r.ok ? "·" : "✗"} ${r.name} (${r.seconds}s, $${r.costUsd.toFixed(2)})${r.err ? " " + r.err : ""}`) });
    const probe = [];
    for (const r of results.filter((x) => x.name.startsWith("probe-"))) {
      const j = r.ok ? judgeProbe(r.text, await expectedFor(r.agent, dir)) : { ok: false, problems: [`пускането се провали: ${r.err}`] };
      probe.push({ agent: r.agent, ...j });
      console.log(`  ${j.ok ? "✓" : "✗"} проба ${r.agent}${j.ok ? "" : ": " + j.problems.join(" · ")}`);
    }
    // Всички изходи (и на пробите) остават за четене: „няма JSON в отговора“ без самия отговор не се диагностицира (27.10).
    // Пробите отделно: в specs/ има стари spec-ове probe-<агент> — eval.mjs --run <out> би ги оценил като отговори.
    mkdirSync(join(out, "probes"), { recursive: true });
    for (const r of results.filter((x) => x.ok)) writeFileSync(join(out, r.name.startsWith("probe-") ? join("probes", r.name) : r.name), r.text);
    let evalSummary = null;
    try { evalSummary = JSON.parse(execFileSync("node", [join(HERE, "evals", "eval.mjs"), "--run", out, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); }
    catch (e) { evalSummary = (() => { try { return JSON.parse(String(e.stdout || "")); } catch { return null; } })(); }
    let vfail = [];
    for (const r of results.filter((x) => !x.name.startsWith("probe-") && x.ok)) {
      try { execFileSync("node", [join(HERE, "verifier.mjs"), r.agent, join(out, r.name)], { stdio: "ignore" }); } catch { vfail.push(r.name); }
    }
    const missing = results.filter((x) => !x.ok).map((x) => x.name);
    const t = evalSummary?.trials;
    const passHatOk = !t || t.passHatK === t.specs;
    const evalOk = !!evalSummary && evalSummary.summary.fullPass === evalSummary.summary.specs && passHatOk;
    const ok = probe.every((p) => p.ok) && evalOk && !vfail.length && !missing.length;
    const cost = results.reduce((a, r) => a + r.costUsd, 0);
    const summary = `проба ${probe.filter((p) => p.ok).length}/${probe.length} · оценки ${evalSummary?.summary.fullPass ?? 0}/${evalSummary?.summary.specs ?? 0}${t ? ` · pass^k ${t.passHatK}/${t.specs}` : ""} · verifier ${vfail.length ? "✗ " + vfail.join(",") : "✓"}`;
    console.log(`\n${ok ? "✓" : "✗"} live-gate: ${summary} · $${cost.toFixed(2)}`);
    if (!ok) {
      if (evalSummary) for (const r of evalSummary.results.filter((x) => !x.ok)) console.log(`    ✗ ${r.id}${r.trial ? " #" + r.trial : ""}: ${r.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.label).join(" · ")}`);
      console.log(`  изходите: ${out} — прочети ги, преди да обучаваш агент (оценителят също греши). Печат НЕ е записан.`);
      return 1;
    }
    const cli = (() => { try { return execFileSync("claude", ["--version"], { encoding: "utf8" }).trim(); } catch { return "?"; } })();
    const date = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
    writeFileSync(STAMP, JSON.stringify({ date, ref, cli, summary, costUsd: +cost.toFixed(2), probe, inputsHash: inputsHash(hashes), files: hashes }, null, 2) + "\n");
    console.log(`  печат: ${relative(ROOT, STAMP)} — комитни го с промяната.`);
    rmSync(out, { recursive: true, force: true });
    return 0;
  } finally { cleanup(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = process.argv.includes("--check") ? check() : await run();
}
