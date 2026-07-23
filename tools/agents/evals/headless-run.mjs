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
// Без ключ → изход 0 с ясно съобщение (гейтът не лъже червено заради липсваща конфигурация).
// Цена: критичните са 8 рънa; --all е ~54 — пускай --all нарочно, не по каданс.

import { execSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

function main() {
  if (!process.env.ANTHROPIC_API_KEY && !argv.includes("--dry")) {
    console.log("headless-run: няма ANTHROPIC_API_KEY в средата — пропускам (добави го като CI secret, никога в репото). Изход 0.");
    process.exit(0);
  }
  try { execSync("command -v claude", { encoding: "utf8" }); } catch {
    if (!argv.includes("--dry")) { console.log("headless-run: няма `claude` CLI — пропускам. Изход 0."); process.exit(0); }
  }

  const plan = JSON.parse(execSync(`node ${join(HERE, "run-plan.mjs")}${argv.includes("--all") ? "" : " --critical"}`, { encoding: "utf8" }));
  console.log(`headless-run: ${plan.length} рънa${argv.includes("--dry") ? " (dry)" : ""}`);
  if (argv.includes("--dry")) { plan.forEach((p) => console.log(`  · ${p.specId} (${p.agent})`)); process.exit(0); }

  mkdirSync(OUT, { recursive: true });
  let failed = 0;
  for (const p of plan) {
    try {
      // execFile (не shell) — задачата/дефиницията не минават през shell интерполация.
      // --bare: без auto-discovery (hooks/skills/CLAUDE.md) → тестваме ЧИСТАТА дефиниция, детерминистично (проверено: code.claude.com/docs/en/headless).
      const out = execFileSync("claude", ["-p", p.task, "--bare", "--append-system-prompt", agentBody(p.agent), "--output-format", "text"], { encoding: "utf8", timeout: 300000, cwd: ROOT });
      writeFileSync(join(OUT, p.specId + ".txt"), out);
      console.log(`  ✓ ${p.specId} (${out.length} знака)`);
    } catch (e) { failed++; console.log(`  ✗ ${p.specId}: ${String(e.message).slice(0, 120)}`); }
  }

  // Скориране: golden + verifier (verifier само за покритите агенти — той сам пропуска другите).
  execSync(`node ${join(HERE, "eval.mjs")} --run ${OUT} --record`, { stdio: "inherit" });
  for (const p of plan) {
    try { execSync(`node ${join(ROOT, "tools", "agents", "verifier.mjs")} ${p.agent} ${join(OUT, p.specId + ".txt")}`, { stdio: "inherit" }); }
    catch { failed++; }
  }
  process.exit(failed ? 1 : 0);
}

main();
