#!/usr/bin/env node
// headless-run.mjs — НАПЪЛНО автоматичен behavioral eval: пуска агентите БЕЗ оркестратор-сесия,
// през headless Claude Code (`claude -p`). Дефиницията на агента (тялото, без frontmatter) отива
// като --append-system-prompt; задачата от golden spec-а е промптът; изходът се записва и скорира.
//
//   node tools/agents/evals/headless-run.mjs                # критичните (verifier-покритите)
//   node tools/agents/evals/headless-run.mjs --all          # всички функционални spec-ове
//   node tools/agents/evals/headless-run.mjs --dry          # само покажи какво би пуснал
//
// Изисква: `claude` CLI + ANTHROPIC_API_KEY в средата (CI secret — НИКОГА в репото).
// Без ключ/CLI → изход 0 с ясно съобщение (гейтът не лъже червено заради липсваща конфигурация).
//
// ПОУКА (run 30044070028): кодът беше непроверен и падна при първи реален контакт. Сега е
// САМОДИАГНОСТИЦИРАЩ: probe на CLI преди 8-те скъпи рънa, feature-detect на флагове (`--bare`
// не съществува в стар CLI → всяко извикване падаше мигновено), stderr се хваща и показва,
// нула изходи → чист диагностичен изход (не stack trace). Цена: критичните = 8 рънa.

import { execSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const argv = process.argv.slice(2);
const OUT = join(ROOT, ".claude", "hooks", "_state", "behavioral-out");

function agentBody(id) {
  const raw = readFileSync(join(ROOT, ".claude", "agents", id + ".md"), "utf8");
  return raw.replace(/^---[\s\S]*?---\n/, ""); // без frontmatter — само системният промпт
}

// Извиква claude, връща {ok, out, err}. Никога не хвърля — грешката е ДАННИ, не крах.
// Хваща И stdout И stderr при провал (claude пише грешките си в stdout в -p режим).
function claudeRun(args) {
  try {
    const out = execFileSync("claude", args, { encoding: "utf8", timeout: 300000, cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out, err: "" };
  } catch (e) {
    const out = (e.stdout || "").toString();
    const err = (e.stderr || "").toString();
    return { ok: false, out, err: (err + (out ? "\n[stdout]: " + out : "") || e.message || "").toString().slice(0, 600) };
  }
}

function cliSupports(flag) {
  try { return execFileSync("claude", ["--help"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).includes(flag); }
  catch { return false; }
}

function main() {
  const dry = argv.includes("--dry");
  if (!process.env.ANTHROPIC_API_KEY && !dry) {
    console.log("headless-run: няма ANTHROPIC_API_KEY — пропускам (добави като CI secret, никога в репото). Изход 0."); process.exit(0);
  }
  try { execSync("command -v claude", { stdio: "ignore" }); }
  catch { if (!dry) { console.log("headless-run: няма `claude` CLI — пропускам. Изход 0."); process.exit(0); } }

  const plan = JSON.parse(execSync(`node ${join(HERE, "run-plan.mjs")}${argv.includes("--all") ? "" : " --critical"}`, { encoding: "utf8" }));
  const specIds = new Set(plan.map((p) => p.specId));
  console.log(`headless-run: ${plan.length} рънa${dry ? " (dry)" : ""}`);
  if (dry) { plan.forEach((p) => console.log(`  · ${p.specId} (${p.agent})`)); process.exit(0); }

  // Feature-detect флагове (различни версии CLI): --bare изолира от auto-discovery;
  // --dangerously-skip-permissions изключва permission промптовете (задължително за headless CI —
  // ефимерен runner, throwaway). Ползват се само ако `--help` ги обявява.
  const bare = cliSupports("--bare");
  const skipPerm = cliSupports("--dangerously-skip-permissions");
  const COMMON = [...(bare ? ["--bare"] : []), ...(skipPerm ? ["--dangerously-skip-permissions"] : [])];
  console.log(`флагове: --bare=${bare} · skip-permissions=${skipPerm}`);

  // ── Probe: работи ли CLI headless ИЗОБЩО, преди 8-те скъпи рънa? ──
  console.log(`claude версия: ${(() => { const r = claudeRun(["--version"]); return r.ok ? r.out.trim() : "?"; })()}`);
  const probe = claudeRun(["-p", "Отговори само с думата: ok", ...COMMON, "--output-format", "text"]);
  if (!probe.ok) {
    console.error(`✗ headless-run: probe извикването се провали — CLI не работи headless в тази среда.\n  изход (stdout+stderr): ${probe.err}\n  (вероятни причини: невалиден ANTHROPIC_API_KEY, permission/trust диалог, или флагов формат.)`);
    process.exit(1);
  }
  console.log(`✓ probe ok (${probe.out.trim().slice(0, 40)})`);

  mkdirSync(OUT, { recursive: true });
  let produced = 0;
  for (const p of plan) {
    const args = ["-p", p.task, ...COMMON, "--append-system-prompt", agentBody(p.agent), "--output-format", "text"];
    const r = claudeRun(args);
    if (r.ok && r.out.trim()) { writeFileSync(join(OUT, p.specId + ".txt"), r.out); produced++; console.log(`  ✓ ${p.specId} (${r.out.length} знака)`); }
    else console.log(`  ✗ ${p.specId}: ${r.err || "празен изход"}`);
  }

  if (!produced) {
    console.error(`✗ headless-run: нула произведени изхода от ${plan.length} рънa — виж ✗ грешките по-горе. НЕ скорирам (нула резултата = безсмислено). Изход 1.`);
    process.exit(1);
  }

  // ── Скориране само върху РЕАЛНО произведените файлове ──
  const madeIds = new Set(readdirSync(OUT).filter((f) => f.endsWith(".txt")).map((f) => f.replace(/\.txt$/, "")).filter((id) => specIds.has(id)));
  console.log(`\nСкориране на ${madeIds.size}/${plan.length} произведени изхода:`);
  try { execSync(`node ${join(HERE, "eval.mjs")} --run ${OUT} --record`, { stdio: "inherit" }); }
  catch { /* eval връща ≠0 при провалени проверки — това е РЕЗУЛТАТ, не крах на скрипта */ }
  let vfail = 0;
  for (const p of plan) {
    if (!existsSync(join(OUT, p.specId + ".txt"))) continue;
    try { execSync(`node ${join(ROOT, "tools", "agents", "verifier.mjs")} ${p.agent} ${join(OUT, p.specId + ".txt")}`, { stdio: "inherit" }); }
    catch { vfail++; }
  }
  console.log(`\nИтог: ${produced}/${plan.length} изхода · verifier провали: ${vfail}`);
  // Провал на behavioral eval = агент не покри инвариантите си (verifier) → червено; частично произведени също.
  process.exit(vfail || produced < plan.length ? 1 : 0);
}

main();
