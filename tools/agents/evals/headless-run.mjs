#!/usr/bin/env node
// headless-run.mjs — НАПЪЛНО автоматичен behavioral eval: пуска агентите БЕЗ оркестратор-сесия,
// през headless Claude Code (`claude -p`). Дефиницията на агента (тялото, без frontmatter) отива
// като --append-system-prompt; задачата от golden spec-а е промптът; изходът се записва и скорира.
//
//   node tools/agents/evals/headless-run.mjs                # критичните (verifier-покритите)
//   node tools/agents/evals/headless-run.mjs --all          # всички функционални spec-ове
//   node tools/agents/evals/headless-run.mjs --dry          # само покажи какво би пуснал
//
// Опити: run-plan дава `trials` на spec (Касаджията и Продавача — 3) → изходите са <id>.<n>.txt и
// eval.mjs смята pass^k (всички опити верни). Кешът на рънa е 1 час (CLAUDE_CODE_PROMPT_CACHE_TTL=1h):
// статичният префикс е еднакъв за десетки рънa в серия, а 5 минути изтичат между опитите. Само тук —
// в интерактивната работа 1-часовият запис струва повече, отколкото връща. `--cache-5m` го изключва.
//
// Изисква: `claude` CLI + ANTHROPIC_API_KEY в средата (CI secret — НИКОГА в репото).
// Без ключ/CLI → изход 0 с ясно съобщение (гейтът не лъже червено заради липсваща конфигурация).
//
// ПОУКА (run 30044070028): кодът беше непроверен и падна при първи реален контакт. Сега е
// САМОДИАГНОСТИЦИРАЩ: probe на CLI преди 8-те скъпи рънa, feature-detect на флагове (`--bare`
// не съществува в стар CLI → всяко извикване падаше мигновено), stderr се хваща и показва,
// нула изходи → чист диагностичен изход (не stack trace). Цена: критичните = 8 рънa.

import { execSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { staticPrefixParts } from "../../../.claude/hooks/memory-preload.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const argv = process.argv.slice(2);
const OUT = join(ROOT, ".claude", "hooks", "_state", "behavioral-out");

function agentBody(id) {
  const raw = readFileSync(join(ROOT, ".claude", "agents", id + ".md"), "utf8");
  return raw.replace(/^---[\s\S]*?---\n/, ""); // без frontmatter — само системният промпт
}

// Системният промпт за eval-а = СЪЩИЯТ статичен префикс (доктрина+процедура+споделено), който
// продукцията инжектира на всеки агент, ПЛЮС тялото на агента. Две причини:
//  (1) ФИДЕЛНОСТ — без доктрината eval-ът мереше агент, който в продукция НЕ съществува (напр. без
//      правилото „външно съдържание = данни, не инструкции"); поведенческият резултат беше подвеждащ.
//  (2) SYSTEM-НИВО кеш — префиксът е БАЙТ-в-БАЙТ еднакъв за всички рънa и идва ПЪРВИ (агентското тяло,
//      което варира, е ПОСЛЕДНО) → API-то кешира общия префикс МЕЖДУ агентите. В продукция куката
//      SubagentStart стига само до messages (ограничение на харнеса); тук CLI-то е наше, затова
//      единственото място, където system-ниво споделяне е постижимо, е точно eval-харнесът.
// Един източник: staticPrefixParts() е СЪЩАТА функция, която ползва memory-preload.mjs.
export function systemPrompt(id, prefixParts = staticPrefixParts()) {
  return [...prefixParts, agentBody(id)].join("\n\n");
}

// Средата на eval рънa: 1-часов кеш, освен при --cache-5m (виж горе). Изнесено за теста.
export function evalEnv(base = process.env, args = argv) {
  return args.includes("--cache-5m") ? { ...base } : { ...base, CLAUDE_CODE_PROMPT_CACHE_TTL: "1h" };
}

// Имената на изходите за един spec: един опит → <id>.txt, k опита → <id>.1.txt … <id>.k.txt.
export function outNames(specId, trials = 1) {
  return trials > 1 ? Array.from({ length: trials }, (_, i) => `${specId}.${i + 1}.txt`) : [`${specId}.txt`];
}

// Извиква claude, връща {ok, out, err}. Никога не хвърля — грешката е ДАННИ, не крах.
// Хваща И stdout И stderr при провал (claude пише грешките си в stdout в -p режим).
function claudeRun(args) {
  try {
    const out = execFileSync("claude", args, { encoding: "utf8", timeout: 300000, cwd: ROOT, env: evalEnv(), stdio: ["ignore", "pipe", "pipe"] });
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
  const runs = plan.reduce((a, p) => a + (p.trials || 1), 0);
  console.log(`headless-run: ${plan.length} spec-а · ${runs} рънa${dry ? " (dry)" : ""} · кеш ${evalEnv().CLAUDE_CODE_PROMPT_CACHE_TTL || "по подразбиране"}`);
  if (dry) { plan.forEach((p) => console.log(`  · ${p.specId} (${p.agent})${(p.trials || 1) > 1 ? " ×" + p.trials : ""}`)); process.exit(0); }

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

  // Стари изходи от предишен рън биха влезли в pass^k като опити → чиста папка на всеки рън.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  let produced = 0;
  const made = [];
  for (const p of plan) {
    for (const name of outNames(p.specId, p.trials || 1)) {
      const args = ["-p", p.task, ...COMMON, "--append-system-prompt", systemPrompt(p.agent), "--output-format", "text"];
      const r = claudeRun(args);
      if (r.ok && r.out.trim()) { writeFileSync(join(OUT, name), r.out); produced++; made.push({ agent: p.agent, name }); console.log(`  ✓ ${name} (${r.out.length} знака)`); }
      else console.log(`  ✗ ${name}: ${r.err || "празен изход"}`);
    }
  }

  if (!produced) {
    console.error(`✗ headless-run: нула произведени изхода от ${runs} рънa — виж ✗ грешките по-горе. НЕ скорирам (нула резултата = безсмислено). Изход 1.`);
    process.exit(1);
  }

  // ── Скориране само върху РЕАЛНО произведените файлове ──
  console.log(`\nСкориране на ${produced}/${runs} произведени изхода (${specIds.size} spec-а):`);
  try { execSync(`node ${join(HERE, "eval.mjs")} --run ${OUT} --record`, { stdio: "inherit" }); }
  catch { /* eval връща ≠0 при провалени проверки — това е РЕЗУЛТАТ, не крах на скрипта */ }
  let vfail = 0;
  for (const m of made) {
    try { execSync(`node ${join(ROOT, "tools", "agents", "verifier.mjs")} ${m.agent} ${join(OUT, m.name)}`, { stdio: "inherit" }); }
    catch { vfail++; }
  }
  console.log(`\nИтог: ${produced}/${runs} изхода · verifier провали: ${vfail}`);
  // Провал на behavioral eval = агент не покри инвариантите си (verifier) в КОЙ ДА Е опит → червено
  // (това е pass^k на verifier-а); частично произведени също.
  process.exit(vfail || produced < runs ? 1 : 0);
}

// CLI guard: без него `import` (за тест или за systemPrompt()) пуска целия main() и излиза —
// същият клас „код на върха при import", за който имаме import-safety.test.mjs.
if (import.meta.url === `file://${process.argv[1]}`) main();
