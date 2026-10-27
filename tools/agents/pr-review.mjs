#!/usr/bin/env node
// pr-review.mjs — пуска НАШИТЕ агенти върху отворените PR-и по плана на pr-triage.mjs, на живо.
//
// Защо (правило на собственика, 2026-10-27): „на всеки отворен проект да се пускат наши агенти, когато има
// нужда“. pr-triage решава КОЙ и ЗАЩО; тук всеки нужен агент получава истински преглед:
//   • копие на кода на PR-а (git worktree на origin/<клон>), но с ТЕКУЩИЯ агентски слой (.claude/ и tools/
//     идват от HEAD) — стар клон не бива да пуска агенти без доктрината и паметта им;
//   • промените на PR-а са в .pr-review/<n>.diff (lock файловете — само като статистика); ако PR-ът пипа
//     .claude/ или tools/, неговите версии са в .pr-review/<n>/files/;
//   • всяко пускане е нова headless сесия през Agent tool (live-run.mjs) — продукционният път;
//   • таван на разхода общо и на пускане; дневник по sha (tools/agents/pr-reviews.json) — същата версия
//     не се преглежда втори път.
//
//   node tools/agents/pr-triage.mjs --prs <файл> --json > plan.json
//   node tools/agents/pr-review.mjs --plan plan.json --out <папка> [--only 338,326] [--budget 40] [--per-run 4]
//                                   [--concurrency 2] [--record]
//   … --collect --record   # само доклад + дневник + поуки от вече записаните изходи (прекъснато пускане)
//   node tools/agents/pr-review.mjs --pr 412 --ref claude/<клон> --title "…" --out <папка> --record   # един PR
//     (стъпката от умението commit-pr след push: разпределението и прегледът наведнъж)

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT, ALLOWED, makeWorktree, runJobs, claudeAvailable } from "./evals/live-run.mjs";
import { LEDGER, triage, changedFiles, loadLedger } from "./pr-triage.mjs";

export const DIFF_CAP = 350_000; // знака — над това агентът чете файловете в дървото по статистиката
export const LOCKS = [":(exclude,glob)**/package-lock.json", ":(exclude,glob)**/pnpm-lock.yaml", ":(exclude,glob)**/yarn.lock", ":(exclude,glob)**/npm-shrinkwrap.json"];
export const LAYER = [".claude", "tools"]; // агентският слой — винаги от HEAD
// Само четящи команди: прегледът вижда историята и пуска статичния скенер и верификатора, нищо друго.
export const REVIEW_ALLOWED = [...ALLOWED, "Bash(git diff *)", "Bash(git log *)", "Bash(git show *)",
  "Bash(bash tools/code/scan.sh *)", "Bash(node tools/agents/verifier.mjs *)"];

// Фокусът на всеки агент при преглед на PR (едно изречение — останалото е в дефиницията му).
export const FOCUS = {
  kodadjiyata: "бъгове и уязвимости в промените (инжекция, XSS, IDOR, CSRF, тайни/PII, race, грешна логика)",
  kasadjiyata: "касовия/фискалния път — инвариантите ти и Н-18/СУПТО",
  prodavacha: "плащанията — Stripe, webhook, сумите, правата, правото на ЕС за онлайн продажба",
  "vps-adjiyata": "деплоя и сървъра — autodeploy, откат, бекъп, тайни на сървъра, systemd/Docker/Nginx",
  seo: "откриваемостта — метаданни, ключови думи (≥5, една „Carbon Stealth“), canonical/hreflang, JSON-LD, sitemap/robots",
  "ai-djiyata": "агентския слой и AI извикванията — доктрина, куки, памет, модели, разход",
  diskordjiyata: "Discord бота — интеракции, intents, rate limits, монетизация през Discord",
  hromadjiyata: "разширението — MV3, права, CSP, нула отдалечен код, политиките на Web Store",
  konveyera: "CI — permissions, пинване по SHA, path филтри, тайни в workflow",
  dizayner: "визуалното — достъпност на движението (reduced-motion), производителност на ефектите",
  "pravniyat-razbirach": "правната изрядност — GDPR, бисквитки, импресум, медицински/правни низове",
  socialdjiyata: "Instagram потока — само чернови, одобрение от човек, ToS на Meta",
  geymara: "FiveM ресурсите — сървърна валидация, експлойти през събития, natives",
  goladjiyata: "математиката и отговорната игра — марж, Kelly, калибрация",
  asansyorchika: "нормите за асансьори — точка, стойност, издание",
};

/** Задачата за един агент върху един PR. Чиста функция. */
export function reviewTask(p, agent) {
  const focus = FOCUS[agent] || "своя домейн";
  return [
    `Преглед на PR #${p.pr} „${p.title}“ (клон ${p.ref}, sha ${String(p.sha || "").slice(0, 9)}).`,
    `Работното дърво е кодът на PR-а. Промените спрямо main са в .pr-review/${p.pr}.diff (lock файловете — само в .pr-review/${p.pr}.stat).`,
    `.claude/ и tools/ в дървото са ТЕКУЩИЯТ агентски слой; ако PR-ът ги пипа, неговите версии са в .pr-review/${p.pr}/files/.`,
    `Фокус: ${focus}. Само находки, които идват от промените на този PR; всяка с файл:ред, тежест, увереност и минимална поправка.`,
    `Само преглед — нищо не пиши и не пускай. Ако няма находка с тежест средна или по-висока, кажи го изрично.`,
    `Първият ред на отговора: „Присъда: блокер“ (не бива да влиза така), „Присъда: поправки“ (да се оправи преди merge) или „Присъда: чисто“.`,
  ].join("\n");
}

/** Присъдата от отговора; без ред „Присъда:“ → от статуса в ПРЕДАВАНЕ; иначе „?“. */
export function verdictOf(text) {
  const m = String(text).match(/Присъда:\s*\**\s*(блокер|поправки|чисто)/i);
  if (m) return m[1].toLowerCase();
  const s = String(text).match(/Статус:\s*(блокер|частично|готово)/i);
  return s ? ({ блокер: "блокер", частично: "поправки", готово: "чисто" })[s[1].toLowerCase()] : "?";
}

/** Редът „Находки:“ от ПРЕДАВАНЕ (за доклада) — до 600 знака. */
export function findingsOf(text) {
  const m = String(text).match(/Находки:\s*([^\n]+)/);
  return m ? m[1].trim().slice(0, 600) : "";
}

function git(args, opts = {}) { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 28, ...opts }); }

/** Подготвя .pr-review/ в копието: diff (с таван), статистика, PR версиите на .claude/ и tools/. */
export function stage(wt, p, base = "origin/main") {
  const range = `${base}...origin/${p.ref}`;
  const dir = join(wt, ".pr-review");
  mkdirSync(join(dir, String(p.pr), "files"), { recursive: true });
  let diff = git(["diff", "-U8", range, "--", ".", ...LOCKS]);
  if (diff.length > DIFF_CAP) diff = diff.slice(0, DIFF_CAP) + `\n\n… diff-ът е отрязан на ${DIFF_CAP} знака — останалото чети директно в дървото по .pr-review/${p.pr}.stat\n`;
  writeFileSync(join(dir, `${p.pr}.diff`), diff);
  writeFileSync(join(dir, `${p.pr}.stat`), git(["diff", "--stat=200", range]));
  const layer = git(["diff", "--name-only", "--diff-filter=AM", range, "--", ...LAYER]).split("\n").filter(Boolean);
  for (const f of layer) {
    try {
      const target = join(dir, String(p.pr), "files", f);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, git(["show", `origin/${p.ref}:${f}`]));
    } catch { /* двоичен или изтрит — статистиката го показва */ }
  }
  return { diffChars: diff.length, layerFiles: layer.length };
}

export function loadLedgerFull(file = LEDGER) {
  try { const j = JSON.parse(readFileSync(file, "utf8")); return { reviewed: j.reviewed || {}, runs: j.runs || [] }; } catch { return { reviewed: {}, runs: [] }; }
}

/** Добавя резултатите в дневника (само успешните пускания броят като „прегледан“). */
export function recordRuns(ledger, results, date = new Date().toISOString().slice(0, 10)) {
  for (const r of results) {
    if (!r.ok) continue;
    const got = new Set(ledger.reviewed[r.sha] || []);
    got.add(r.agent);
    ledger.reviewed[r.sha] = [...got].sort();
    ledger.runs.push({ pr: r.pr, sha: r.sha, agent: r.agent, verdict: verdictOf(r.text), costUsd: Number(r.costUsd.toFixed(2)), date });
  }
  return ledger;
}

/** Синтетичен транскрипт за учебния hook: един ред на асистента със същия текст. Прегледът е продукционна
 *  работа, не оценка — поуките му влизат в паметта по същия път (memory-capture.mjs), не изчезват с копието. */
export function learnTranscript(text) {
  return JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: String(text) }] } }) + "\n";
}

function harvest(out, results) {
  const paths = [];
  for (const r of results) {
    if (!r.ok || !/```learn\s*\n/.test(r.text)) continue;
    const base = join(out, r.name.replace(/\.txt$/, ""));
    writeFileSync(base + ".jsonl", learnTranscript(r.text));
    writeFileSync(base + ".meta.json", JSON.stringify({ agentType: r.agent }));
    paths.push(base + ".jsonl");
  }
  if (!paths.length) return 0;
  const res = spawnSync(process.execPath, [join(ROOT, "tools", "memory", "capture-transcript.mjs"), ...paths], { encoding: "utf8" });
  console.log((res.stdout || "").trim().split("\n").pop());
  return paths.length;
}

export function renderReport(results) {
  const byPr = new Map();
  for (const r of results) { if (!byPr.has(r.pr)) byPr.set(r.pr, []); byPr.get(r.pr).push(r); }
  const order = { блокер: 0, поправки: 1, "?": 2, чисто: 3 };
  const rows = [...byPr.entries()].map(([pr, rs]) => ({ pr, title: rs[0].title, rs, worst: rs.map((r) => (r.ok ? verdictOf(r.text) : "?")).sort((a, b) => order[a] - order[b])[0] }));
  rows.sort((a, b) => order[a.worst] - order[b.worst] || b.pr - a.pr);
  const lines = ["# Преглед на отворените PR-и от нашите агенти", ""];
  for (const row of rows) {
    lines.push(`## #${row.pr} — ${row.worst} — ${row.title}`);
    for (const r of row.rs) lines.push(`- **${r.agent}** · ${r.ok ? verdictOf(r.text) : "неуспешно пускане"} · $${r.costUsd.toFixed(2)}${r.ok && findingsOf(r.text) ? ` — ${findingsOf(r.text)}` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function main(argv) {
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : null; };
  if ((!val("--plan") && !val("--ref")) || !val("--out")) { console.error("употреба: pr-review.mjs (--plan <plan.json> | --pr N --ref <клон> [--title T]) --out <папка> [--only n,…] [--budget USD] [--per-run USD] [--concurrency 2] [--record]"); process.exit(2); }
  if (!claudeAvailable()) { console.error("pr-review: няма `claude` CLI с вход — живото пускане не е възможно тук."); process.exit(2); }
  const only = (val("--only") || "").split(",").map(Number).filter(Boolean);
  const source = val("--ref")
    ? triage([{ number: Number(val("--pr")) || 0, title: val("--title") || val("--ref"), head: { ref: val("--ref") } }], changedFiles, loadLedger())
    : JSON.parse(readFileSync(val("--plan"), "utf8"));
  for (const p of source) if (!p.agents?.length) console.log(`· #${p.pr} без агент — ${p.why || p.error}`);
  const plan = source.filter((p) => p.agents?.length && (!only.length || only.includes(p.pr)));
  const out = val("--out"); mkdirSync(out, { recursive: true });
  if (argv.includes("--collect")) return finish(out, collect(out, plan), argv, 0);
  const budget = Number(val("--budget")) || 40, perRun = Number(val("--per-run")) || 4, conc = Number(val("--concurrency")) || 2;
  const head = git(["rev-parse", "HEAD"]).trim();
  let spent = 0, i = 0;
  const all = [];
  console.log(`pr-review · ${plan.length} PR · ${plan.reduce((a, p) => a + p.agents.length, 0)} прегледа · таван $${budget} (на пускане $${perRun})`);
  await Promise.all(Array.from({ length: Math.min(conc, plan.length) }, async () => {
    while (i < plan.length) {
      const p = plan[i++];
      if (spent >= budget) { console.log(`· #${p.pr} пропуснат — таванът $${budget} е достигнат`); continue; }
      let wt;
      try {
        wt = makeWorktree(`origin/${p.ref}`, { from: head, paths: LAYER }, { measure: false });
        const st = stage(wt.dir, p);
        const jobs = p.agents.map((agent) => ({ agent, pr: p.pr, sha: p.sha, title: p.title, name: `${p.pr}-${agent}.txt`, task: reviewTask(p, agent) }));
        const res = await runJobs(jobs, { wt: wt.dir, concurrency: jobs.length, timeoutMs: 1_200_000, allowed: REVIEW_ALLOWED, extraArgs: ["--max-budget-usd", String(perRun)], onDone: (r) => {
          spent += r.costUsd;
          if (r.ok) writeFileSync(join(out, r.name), r.text);
          console.log(`${r.ok ? "✓" : "✗"} #${r.pr} ${r.agent} · ${r.ok ? verdictOf(r.text) : "—"} · $${r.costUsd.toFixed(2)} · ${r.seconds}s · diff ${Math.round(st.diffChars / 1000)}K${r.err ? " · " + r.err.slice(0, 120) : ""}`);
        } });
        all.push(...res);
      } catch (e) {
        console.log(`✗ #${p.pr} подготовката падна: ${String(e.message).slice(0, 160)}`);
        all.push(...p.agents.map((agent) => ({ agent, pr: p.pr, sha: p.sha, title: p.title, ok: false, text: "", costUsd: 0 })));
      } finally { wt?.cleanup(); }
    }
  }));
  finish(out, all, argv, spent);
}

/** Резултатите от вече записаните изходи (<pr>-<агент>.txt) — когато пускането е прекъснато преди записа. */
export function collect(out, plan) {
  const res = [];
  for (const p of plan) for (const agent of p.agents) {
    const f = join(out, `${p.pr}-${agent}.txt`);
    const ok = existsSync(f);
    res.push({ agent, pr: p.pr, sha: p.sha, title: p.title, name: `${p.pr}-${agent}.txt`, ok, text: ok ? readFileSync(f, "utf8") : "", costUsd: 0 });
  }
  return res.filter((r) => r.ok);
}

function finish(out, all, argv, spent) {
  writeFileSync(join(out, "REPORT.md"), renderReport(all));
  if (argv.includes("--record")) {
    harvest(out, all);
    const ledger = recordRuns(loadLedgerFull(), all);
    writeFileSync(LEDGER, JSON.stringify({ $note: "Кои наши агенти са прегледали коя версия (sha) на отворен PR — пише го pr-review.mjs --record; pr-triage.mjs не пуска втори преглед на същия sha.", ...ledger }, null, 2) + "\n");
  }
  console.log(`готово: ${all.filter((r) => r.ok).length}/${all.length} · $${spent.toFixed(2)} · доклад: ${join(out, "REPORT.md")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
