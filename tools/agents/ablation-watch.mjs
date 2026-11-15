#!/usr/bin/env node
// ablation-watch.mjs — ритуал при нов модел: дължима ли е аблация на префикса (доктрина + процедура).
//
// Защо (2026-11-11): Boris Cherny — при всеки нов модел маха промпта и връща само реда, който поправя
// видим провал; голяма част от системния промпт поправя неща, които новият модел вече знае
// (tools/research/boris-cherny.md, т. 3 и 4). Префиксът ни (~4,8k т) се плаща на всеки старт и на всяка
// стъпка от веригата, а таванът му е почти стигнат — освободеното място е запас.
//
// Какво прави: чете модела, на който флотът РЕАЛНО върви (записите за употреба — usage-report), и го
// сравнява с печата `evals/ablation.json`. Нов модел в семейство (opus/sonnet) → ритуалът е дължим и
// инструментът печата командите за двете рамена (`live-run.mjs --patch`). Сверява и че всеки кандидат
// още стои дословно в своя файл (иначе кандидатът е остарял — махнат или пренаписан).
//
//   node tools/agents/ablation-watch.mjs            # доклад (L1, изход 0)
//   node tools/agents/ablation-watch.mjs --json
//   node tools/agents/ablation-watch.mjs --stamp --ref <sha> --result "<изход>"   # след ритуала
//
// Нищо не маха само. Махането е решение с доказателство (evals/README.md, „Аблация на доктрината“).
// Пазачите не са кандидати: пазач без удари работи, не е мъртъв.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../lib/is-main.mjs";
// Един източник с отчета за разхода: клонът agents/memory, работното дърво и буферът.
import { loadRecords } from "./usage-report.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const STAMP = join("tools", "agents", "evals", "ablation.json");

/** „opus-5-5“ → { family: "opus", id }; непознато → null. */
export function familyOf(model) {
  const m = String(model || "").match(/^(opus|sonnet|haiku|fable|mythos)-\d/);
  return m ? m[1] : null;
}

/** Най-новият реално обслужен модел по семейство (по `ts` на записа). */
export function currentModels(records) {
  const best = {};
  for (const r of records || []) {
    const fam = familyOf(r.model);
    if (!fam || !r.ts) continue;
    if (!best[fam] || r.ts > best[fam].ts) best[fam] = { model: r.model, ts: r.ts };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.model]));
}

/** Сравнение печат ↔ реалност; кандидатите — дословно ли стоят още. */
export function assess(stamp, current, readFile) {
  const stamped = stamp?.last?.models || {};
  const changed = Object.keys(stamped)
    .filter((fam) => current[fam] && current[fam] !== stamped[fam])
    .map((fam) => ({ family: fam, from: stamped[fam], to: current[fam] }));
  const candidates = (stamp?.candidates || []).map((c) => {
    let present = false;
    try { present = readFile(c.path).includes(c.find); } catch { present = false; }
    return { ...c, present };
  });
  return { due: changed.length > 0, changed, last: stamp?.last || null, candidates };
}

/** Командите за двете рамена — едно базово и по едно без всеки жив кандидат. */
export function ritualCommands(stamp, candidates, outBase = "/tmp/ablation") {
  const jobs = stamp?.last?.jobs;
  if (!jobs) return [];
  const live = candidates.filter((c) => c.present);
  const cmds = [`node tools/agents/evals/live-run.mjs --jobs ${jobs} --out ${outBase}/base`];
  for (const c of live) cmds.push(`node tools/agents/evals/live-run.mjs --jobs ${jobs} --out ${outBase}/${c.id} --patch '${c.path}::${c.find.replace(/'/g, "'\\''")}::'`);
  cmds.push(`node tools/agents/evals/eval.mjs --run ${outBase}/<рамо> --record --label ablation-<модел>-<рамо>   # + verifier.mjs + сляпо двойково съдийство`);
  return cmds;
}

function main(argv) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const stampFile = join(ROOT, STAMP);
  if (!existsSync(stampFile)) { console.error(`ablation-watch: липсва ${STAMP}`); process.exit(2); }
  const stamp = JSON.parse(readFileSync(stampFile, "utf8"));
  let records = [];
  if (process.env.ABLATION_RECORDS) records = JSON.parse(readFileSync(process.env.ABLATION_RECORDS, "utf8"));
  else { try { records = loadRecords(ROOT); } catch { records = []; } }
  const current = currentModels(records);

  if (argv.includes("--stamp")) {
    const ref = val("--ref"), result = val("--result");
    if (!ref || !result) { console.error("употреба: --stamp --ref <sha> --result \"<изход от ритуала>\""); process.exit(2); }
    if (!Object.keys(current).length) { console.error("ablation-watch: няма записи за употреба — не знам на кой модел е флотът; печатът не се сменя."); process.exit(2); }
    const models = {};
    for (const fam of Object.keys(stamp.last?.models || current)) if (current[fam]) models[fam] = current[fam];
    stamp.last = { ...stamp.last, date: new Date().toISOString().slice(0, 10), ref, models, result };
    writeFileSync(stampFile, JSON.stringify(stamp, null, 2) + "\n");
    console.log(`✓ печат: ${JSON.stringify(models)} · ${ref}`);
    return;
  }

  const r = assess(stamp, current, (p) => readFileSync(join(ROOT, p), "utf8"));
  if (argv.includes("--json")) { console.log(JSON.stringify({ ...r, current }, null, 2)); return; }
  console.log(`последна аблация: ${r.last?.date || "—"} при ${JSON.stringify(r.last?.models || {})}`);
  console.log(`флотът върви на: ${Object.keys(current).length ? JSON.stringify(current) : "неизвестно (няма записи за употреба)"}`);
  const stale = r.candidates.filter((c) => !c.present);
  for (const c of stale) console.log(`⚠ кандидат „${c.id}“ вече не стои дословно в ${c.path} — махни го от ${STAMP} или обнови текста`);
  if (!r.due) { console.log(`✓ няма нов модел след последната аблация (${r.candidates.length - stale.length} кандидата чакат следващия).`); return; }
  for (const c of r.changed) console.log(`↳ нов модел ${c.family}: ${c.from} → ${c.to} — ритуалът за аблация е дължим`);
  console.log("Ритуал (AI-джията; скъпо — пуска се по решение, k≥6 на рамо):");
  for (const cmd of ritualCommands(stamp, r.candidates)) console.log(`  ${cmd}`);
  console.log(`Махай само при равно качество; после --stamp. Кандидати: ${r.candidates.filter((c) => c.present).map((c) => c.id).join(", ") || "няма"}.`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
