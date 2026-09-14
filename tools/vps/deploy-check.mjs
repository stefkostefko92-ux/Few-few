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
  //
  // ИЗКЛЮЧЕНИЕ с ИЗРИЧЕН отказ: диагностичен скрипт (smoke тест, здравна
  // проверка) нарочно НЕ ползва `-e` — иначе спира на първата провалена
  // проверка и не докладва останалите, тоест губи точно смисъла си. Такъв
  // скрипт трябва да го КАЖЕ на място с маркер и причина, и пак да пази
  // `-u` и `-o pipefail`. Мълчаливо липсващо `-e` си остава нарушение.
  const optsOut = /#\s*deploy-check:\s*allow-no-errexit\s*—\s*\S/.test(src);
  const hasErrexit = /set\s+-[a-z]*e/.test(src);
  if (!hasErrexit && optsOut) {
    if (!/set\s+-[a-z]*u/.test(src) || !/pipefail/.test(src))
      add("HIGH", "weak-strict-mode", "Отказът от `-e` е допустим за диагностичен скрипт, но `-u` и `-o pipefail` остават задължителни.");
  } else if (!hasErrexit) {
    add("HIGH", "no-strict-mode", "Липсва `set -euo pipefail` — грешка в стъпка не спира скрипта → риск от полу-деплой. Добави го в началото (или `# deploy-check: allow-no-errexit — <причина>`, ако е диагностичен).");
  }

  // 2) Ехо/ексфилтрация на тайна
  //
  // Проверката гони ЛОГ, не запис. `printf 'X=%s\n' "$pass" >> "$env_file"` е
  // как една тайна ЛЕГИТИМНО се ражда на сървъра (autodeploy генерира
  // REDIS_PASSWORD в .env, mode 600) — тя никога не минава през stdout и не
  // стига до CI/journalctl. Първата версия не различаваше двете и обяви точно
  // този запис за изтичане. Затова редът се брои за нарушение САМО ако НЯМА
  // пренасочване към файл — или ако пренасочва към самия stdout/stderr.
  const LOGS_A_SECRET =
    /(echo|printf|cat)\s+[^\n]*(SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY|_KEY)\b/i;
  const REDIRECT_TO_FILE = />>?\s*("?\$?\{?[A-Za-z_./][^\n|&]*)/;
  const REDIRECT_TO_STD = />>?\s*("?\/dev\/(stdout|stderr|fd\/[12])"?|&[12])/;
  const secretToLog = lines.some((l) => {
    if (!LOGS_A_SECRET.test(l)) return false;
    if (REDIRECT_TO_STD.test(l)) return true;        // /dev/stdout е ЛОГ
    return !REDIRECT_TO_FILE.test(l);                // без пренасочване → ЛОГ
  });
  if (secretToLog)
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

  // 8) Незащитен subshell под `set -e` — един проект убива целия пробег
  //
  // ЗАЩО (VPS-аджията, одит 07.08.2026): `( cd "$d"; bash deploy.sh )` без `||`
  // изглежда безобидно, но при `set -e` ненулевият изход на subshell-а прекратява
  // ЦЕЛИЯ скрипт насред пробега. В монорепо autodeploy това значи, че провалът на
  // един продукт оставя всички следващи неразгърнати, а symlink-ът и резюмето се
  // прескачат — при вече мигрирана база и вдигнати контейнери. Намерено в три
  // блока наведнъж (zabobovdol, supreme, eternaltouch).
  //
  // Ловим само subshell, който ИЗПЪЛНЯВА нещо съществено (`bash …`/`npm …`), не
  // всяко `( cd … && ls )`; и само когато скриптът наистина е под `set -e`.
  if (/set\s+-[a-z]*e/.test(src)) {
    const unguarded = [];
    // Две форми: многоредова (затварящата скоба е в начало на ред) и едноредова.
    // И в двата случая гледаме какво следва СЛЕД затварящата скоба.
    const FORMS = [
      /^[ \t]*\(\s*cd\s[\s\S]*?^[ \t]*\)(.*)$/gm,   // ( cd …\n  bash …\n)
      /^[ \t]*\(\s*cd\s[^)\n]*\)(.*)$/gm,           // ( cd … && bash … )
    ];
    for (const re of FORMS) {
      let m;
      while ((m = re.exec(src)) !== null) {
        const body = m[0];
        let after = m[1] || "";
        if (!/\b(bash|sh|npm|pnpm|yarn|docker)\b/.test(body)) continue;  // тривиален subshell
        // Гардът често е пренесен на следващ ред: `) \` + `  || { … }`.
        // Първата версия на това правило не следваше пренасянето и обяви пет
        // напълно защитени блока за нарушители — синтаксис, не съдържание.
        let tail = src.slice(m.index + m[0].length);
        while (/\\\s*$/.test(after)) {
          const nl = tail.indexOf("\n");
          if (nl === -1) break;
          const next = tail.slice(nl + 1, tail.indexOf("\n", nl + 1) === -1 ? undefined : tail.indexOf("\n", nl + 1));
          after = next;
          tail = tail.slice(nl + 1);
        }
        if (/\|\||&&\s*\{|;\s*then/.test(after)) continue;               // има гард
        const head = body.split("\n")[0].trim();
        if (!unguarded.includes(head)) unguarded.push(head);
      }
    }
    if (unguarded.length)
      add("HIGH", "unguarded-subshell",
        `Subshell с деплой команда без \`|| { … }\` при \`set -e\` (${unguarded.length} бр.) — провалът на един продукт прекратява целия autodeploy и оставя следващите неразгърнати. Добави \`|| { warn …; deploy_failed=1; return; }\`.`);
  }

  // ── Чистене с `ls <шаблон>` при `set -euo pipefail` ─────────────────────────
  //
  // Това е най-тихият възможен провал в целия скрипт и вече ни се случи: при
  // ПРАЗЕН шаблон `ls` връща 2, `pipefail` вдига кода на целия конвейер, а
  // `set -e` прекратява скрипта — БЕЗ нито един ред изход. Деплоят изглежда
  // напълно успешен („✔ … е жив" е последното, което виждаш), но всичко след
  // него не се е случило: `current` symlink-ът не се мести и старите релийзи не
  // се чистят. Измерено на живо — `current` беше от преди седмица, а дискът на
  // 83%, при десетина „успешни" деплоя междувременно.
  //
  // Коварното е, че шаблонът е празен точно когато чистенето е излишно, тоест
  // отказва при нормалния случай, а работи при изключението. При vpsdash редът
  // ПРЕДИ него трие единствения `.bak`, значи провалът беше 100% възпроизводим.
  if (/set\s+-[a-z]*e[a-z]*o?\s+pipefail|set\s+-o\s+pipefail/.test(src)) {
    const bad = [];
    // Само редове, ЗАПОЧВАЩИ с `ls` — присвояване (`x="$(ls …)"`) и заместване
    // на процес (`done < <(ls …)`) не разпространяват кода по същия начин.
    const RX = /^[ \t]*ls\s+-1[^\n]*\|[^\n]*$/gm;
    let m;
    while ((m = RX.exec(src)) !== null) {
      const line = m[0].trim();
      if (/\|\|\s*(true|:)\s*$/.test(line)) continue;
      const n = src.slice(0, m.index).split("\n").length;
      bad.push(`${n}: ${line.slice(0, 80)}`);
    }
    if (bad.length)
      add("HIGH", "cleanup-kills-script",
        `Чистене с \`ls\` без \`|| true\` при \`set -euo pipefail\` (${bad.length} бр.) — празен шаблон връща 2, ` +
        `pipefail го вдига, set -e убива скрипта БЕЗ изход и всичко след него (current symlink, чистене на релийзи) ` +
        `не се изпълнява. Добави \`|| true\`. Места: ${bad.join(" · ")}`);
  }

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
