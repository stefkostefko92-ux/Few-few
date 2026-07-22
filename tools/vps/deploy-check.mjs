#!/usr/bin/env node
// tools/vps/deploy-check.mjs — статичен проверител за деплой shell скриптове (VPS-аджията).
//
// Хваща типичните рискове в bash деплой БЕЗ да го пуска: липса на `set -euo pipefail` (тихи провали),
// ексфилтрация/ехо на тайни, `curl … | bash` от недоверен източник, опасно `rm -rf` с непроверена
// променлива, `npm ci` без `--omit=dev` в продукция, липса на health-check/rollback след рестарт.
//
// Употреба:  node tools/vps/deploy-check.mjs <файл-или-папка>
// Изход: 0 = чисто/само INFO, 1 = има HIGH находки. Евристичен помощник, не заместител на ревю.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

// Оценява едно shell съдържание. Чиста функция — тестваема.
export function lintShell(src, rel) {
  const out = [];
  const add = (sev, code, msg) => out.push({ sev, code, msg, where: rel });
  const lines = src.split("\n");

  // 1) set -euo pipefail (без него грешките текат тихо → полу-деплой)
  if (!/set\s+-[a-z]*e[a-z]*o?\s+pipefail|set\s+-e[uo]*\b/.test(src) && !/set\s+-e\b/.test(src))
    add("HIGH", "no-strict-mode", "Липсва `set -euo pipefail` — грешка в стъпка не спира скрипта → риск от полу-деплой. Добави го в началото.");

  // 2) Ехо/ексфилтрация на тайна
  if (/(echo|printf|cat)\s+[^\n]*(SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY|_KEY)\b/i.test(src))
    add("HIGH", "secret-echo", "Тайна се извежда в лог (`echo`/`cat` на SECRET/PASSWORD/TOKEN) — попада в CI/journalctl. Никога не печатай тайни.");
  if (/curl[^\n]*(-d|--data)[^\n]*\$\{?[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD)/i.test(src))
    add("HIGH", "secret-exfil", "Тайна се праща навън през curl (`-d $TOKEN`) — ексфилтрация. Тайните остават на машината (mode 600), не пътуват.");

  // 3) curl|bash от мрежа (пайп към шел изпълнява непроверен код)
  if (/(curl|wget)\s[^\n|]*\|\s*(sudo\s+)?(bash|sh)\b/.test(src))
    add("HIGH", "pipe-to-shell", "`curl … | bash` изпълнява непроверен отдалечен код като root — supply-chain риск. Свали, провери checksum, после пусни.");

  // 4) rm -rf с непроверена променлива (празна → трие root)
  if (/rm\s+-rf?\s+["']?\$\{?[A-Za-z_]/.test(src) && !/:\?|:-|\[\[\s*-[nz]\s*/.test(src))
    add("HIGH", "unsafe-rm", "`rm -rf $VAR` без проверка че `$VAR` е зададена/непразна — при празна стойност трие грешна папка. Ползвай `${VAR:?}` или guard `[[ -n $VAR ]]`.");

  // 5) npm ci без --omit=dev в продукция
  if (/npm\s+(ci|install)\b/.test(src) && !/--omit=dev|--production|NODE_ENV=production/.test(src))
    add("MEDIUM", "dev-deps-in-prod", "`npm ci` без `--omit=dev` в деплой — качва dev зависимости на продукция (по-голяма атакувана повърхност). Добави `--omit=dev`.");

  // 6) Рестарт на услуга без health-check/rollback
  if (/(systemctl\s+restart|docker\s+compose\s+up|docker-compose\s+up)/.test(src) && !/(health|curl\s+-[a-zA-Z]*f|rollback|--wait|healthcheck)/i.test(src))
    add("MEDIUM", "no-healthcheck", "Рестарт/деплой без health-check + rollback — счупен билд остава жив. Провери здравето след рестарт и върни при провал.");

  // 7) sudo без нужда вътре в цикъл/навсякъде (least privilege) — само INFO
  if ((src.match(/\bsudo\b/g) || []).length > 8)
    add("INFO", "sudo-heavy", "Много `sudo` извиквания — обмисли еднократна ескалация или изрична обосновка (least privilege).");

  return out;
}

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (["node_modules", ".git", "dist", "build"].includes(e)) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

function report(findings, root) {
  const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  if (!findings.length) { console.log("✓ deploy-check: чисто (няма находки)."); return; }
  console.log(`deploy-check — ${findings.length} находки за ${root}:\n`);
  for (const f of findings) console.log(`  [${f.sev}] ${f.code} · ${f.where}\n        ${f.msg}`);
  const h = findings.filter((f) => f.sev === "HIGH").length;
  console.log(`\n${h} HIGH · ${findings.filter((f) => f.sev === "MEDIUM").length} MEDIUM · ${findings.filter((f) => f.sev === "INFO").length} INFO`);
}

function runCli() {
  const root = process.argv[2] || ".";
  if (!existsSync(root)) { report([{ sev: "HIGH", code: "no-path", msg: `Пътят не съществува: ${root}`, where: root }], root); process.exit(1); }
  const files = (statSync(root).isDirectory() ? walk(root) : [root]).filter((f) => [".sh", ".bash"].includes(extname(f)) || /(^|\/)[^.\/]*\.(sh|bash)$/.test(f) || /deploy|autodeploy|install/i.test(f) && extname(f) === "");
  const findings = [];
  for (const f of files) {
    let src = ""; try { src = readFileSync(f, "utf8"); } catch { continue; }
    if (!/^#!.*\b(bash|sh)\b/.test(src) && extname(f) === "") continue; // само реални шел скриптове без разширение
    findings.push(...lintShell(src, f.replace(root, "").replace(/^\//, "") || f));
  }
  report(findings, root);
  process.exit(findings.some((f) => f.sev === "HIGH") ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
