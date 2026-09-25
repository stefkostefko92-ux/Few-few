#!/usr/bin/env node
// tools/ci/workflow-audit.mjs — „ръката" на Конвейерът (v1.0).
//
// Статичен скан на GitHub Actions workflow-ите за чести рискове/пропуски.
// Zero-dep (наивен YAML прочит по редове — не пълен парсер), near-zero-FP.
// Fail-closed по желание: с --strict връща ненулев код при блокери (CI гейт за самите CI файлове).
//
// Употреба:
//   node tools/ci/workflow-audit.mjs [път-до-репо]      # четим отчет (по подразбиране .)
//   node tools/ci/workflow-audit.mjs . --json            # машинен изход
//   node tools/ci/workflow-audit.mjs . --strict          # exit 1 при блокери
//
// Не замества живата проверка на docs.github.com/actions — допълва я.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const JSON_OUT = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");
const WF_DIR = join(ROOT, ".github", "workflows");

const findings = [];
const add = (sev, rule, file, line, msg) => findings.push({ sev, rule, file, line, msg });

if (!existsSync(WF_DIR)) {
  const out = { root: ROOT, workflows: 0, findings: [], note: "няма .github/workflows/" };
  if (JSON_OUT) await emitJsonNow(out, 0);
  console.log(`\n⚙  Конвейерът — не открих .github/workflows/ в ${ROOT}. (Нищо за одит.)`);
  process.exit(0);
}

const files = readdirSync(WF_DIR).filter(f => /\.ya?ml$/.test(f) && statSync(join(WF_DIR, f)).isFile());

// известни „официални" собственици, за които таг (вместо SHA) е приемлив
const OFFICIAL = /^(actions|github|docker|dependabot)\//;

for (const f of files) {
  const p = join(WF_DIR, f), txt = readFileSync(p, "utf8"), lines = txt.split("\n");
  const has = re => re.test(txt);
  const lineOf = re => { const i = lines.findIndex(l => re.test(l)); return i < 0 ? 0 : i + 1; };

  // 1) permissions деклариран ли е (иначе се подразбира широк за класически repo)
  if (!/^\s*permissions\s*:/m.test(txt))
    add("warn", "no-permissions", f, 1, "Липсва `permissions:` → GITHUB_TOKEN може да е с широки права. Задай минимални (стартирай от `contents: read`).");
  if (/permissions\s*:\s*write-all/.test(txt))
    add("warn", "permissions-write-all", f, lineOf(/write-all/), "`permissions: write-all` е прекалено широко. Вдигни точно нужното.");

  // 2) actions по подвижен таг/branch вместо SHA (само third-party)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/uses\s*:\s*([^\s#@]+)@([^\s#]+)/);
    if (!m) continue;
    const [, action, ref] = m;
    if (action.startsWith("./") || action.startsWith(".\\")) continue; // локален
    const isSha = /^[0-9a-f]{40}$/i.test(ref);
    if (!isSha && !OFFICIAL.test(action))
      add("warn", "unpinned-action", f, i + 1, `Third-party action \`${action}@${ref}\` не е пинат по пълен commit SHA → supply-chain риск (таговете са подвижни).`);
  }

  // 3) pull_request_target + checkout на PR код (опасно)
  if (has(/pull_request_target/) && /actions\/checkout/.test(txt) && /ref\s*:\s*\$\{\{\s*github\.event\.pull_request\.head/.test(txt))
    add("block", "prt-checkout-head", f, lineOf(/pull_request_target/), "`pull_request_target` + checkout на PR head изпълнява ЧУЖД код с base права/secrets → бан-ниво риск. Не билдвай непроверен PR код там.");
  else if (has(/pull_request_target/))
    add("warn", "pull-request-target", f, lineOf(/pull_request_target/), "`pull_request_target` върви с secrets на base repo — увери се, че не изпълняваш непроверен PR код.");

  // 4) continue-on-error на носеща стъпка (гейтът става лъжлив)
  if (/continue-on-error\s*:\s*true/.test(txt))
    add("info", "continue-on-error", f, lineOf(/continue-on-error\s*:\s*true/), "`continue-on-error: true` — увери се, че е на некритична стъпка, иначе гейтът минава при провал.");

  // 5) potential plaintext secret / hardcoded token
  const secretRe = /(ghp_[0-9A-Za-z]{20,}|gho_[0-9A-Za-z]{20,}|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_\-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  if (secretRe.test(txt))
    add("block", "hardcoded-secret", f, lineOf(secretRe), "Възможна тайна в plaintext в workflow → ползвай `${{ secrets.* }}` / OIDC и ротирай, ако е реална.");

  // 6) script injection: непроверен ${{ github.event.* }} директно в run
  for (let i = 0; i < lines.length; i++)
    if (/run\s*:/.test(lines[i]) || (i > 0 && /run\s*:\s*\|/.test(lines[i - 1])))
      if (/\$\{\{\s*github\.event\.(issue|pull_request|comment|head_commit)\b[^}]*\}\}/.test(lines[i]))
        add("warn", "script-injection", f, i + 1, "Непроверен `${{ github.event.* }}` в `run:` → риск от script injection. Подай през env променлива и цитирай.");

  // 7) кеш липсва при setup-node (по-бавно/скъпо)
  if (/actions\/setup-node/.test(txt) && !/cache\s*:/.test(txt))
    add("info", "no-node-cache", f, lineOf(/setup-node/), "`setup-node` без `cache:` → пре-инсталираш зависимости всеки run. Добави `cache: 'npm'|'pnpm'|'yarn'`.");

  // 8) concurrency липсва (overtaken runs горят минути)
  if ((has(/on\s*:\s*\n?[\s\S]*pull_request/) || /pull_request/.test(txt)) && !/^\s*concurrency\s*:/m.test(txt))
    add("info", "no-concurrency", f, 1, "Без `concurrency` с `cancel-in-progress` — стари PR runs не се отменят (харчат минути).");
}

// монорепо: workflow без path филтър, но с явна продуктова папка в него
try {
  const dirs = readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules").map(d => d.name);
  for (const f of files) {
    const txt = readFileSync(join(WF_DIR, f), "utf8");
    if (/on\s*:/.test(txt) && !/paths\s*:/.test(txt) && !/paths-ignore\s*:/.test(txt)) {
      const hit = dirs.find(d => new RegExp(`\\b${d}/`).test(txt) || new RegExp(`working-directory\\s*:\\s*\\.?/?${d}\\b`).test(txt));
      if (hit) add("info", "no-path-filter", f, 1, "Workflow-ът реферира продукт „" + hit + "/“ без paths: филтър → върви и при несвързани промени (монорепо разход). Добави path филтър.");
    }
  }
} catch (e) {}

const order = { block: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file));
const blockers = findings.filter(x => x.sev === "block").length;

if (JSON_OUT) {
  await emitJsonNow({ root: ROOT, workflows: files.length, findings, summary: { blockers, warns: findings.filter(x => x.sev === "warn").length, infos: findings.filter(x => x.sev === "info").length } }, STRICT && blockers ? 1 : 0);
}

const icon = { block: "✗", warn: "▲", info: "·" };
console.log(`\n⚙  Конвейерът — одит на GitHub Actions (${files.length} workflow файла)\n`);
if (!findings.length) console.log("  ✓ Няма чести рискове. (Пак потвърди синтаксиса/версиите на живо.)");
for (const x of findings) console.log(`  ${icon[x.sev]} [${x.rule}] ${x.file}${x.line ? ":" + x.line : ""}\n      ${x.msg}`);
console.log(`\nИтог: ${blockers} блокери · ${findings.filter(x => x.sev === "warn").length} предупреждения · ${findings.filter(x => x.sev === "info").length} бележки`);
console.log(blockers ? "СТАТУС: има блокери — оправи ги." : "СТАТУС: няма твърди блокери (жива проверка все пак задължителна).");
process.exit(STRICT && blockers ? 1 : 0);
