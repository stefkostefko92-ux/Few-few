#!/usr/bin/env node
// tools/security/secret-scan.mjs — репо-широк скенер за изтекли тайни (defense-in-depth).
// Самостоятелен (нула зависимости), с БЛИЗКО ДО НУЛА фалшиви тревоги: ловим само
// висок-сигнал провайдър-ключове и частни ключове + git-проследени .env файлове.
// SAST/CVE остават за tools/code/scan.sh (semgrep/osv/gitleaks) — тук е винаги-включеният
// слой, който работи и без външни инструменти (за да не разчита гейтът на нищо).
//
// Употреба:
//   node tools/security/secret-scan.mjs            # сканира всички git-проследени файлове
//   node tools/security/secret-scan.mjs <path...>  # само подадените (напр. staged в pre-commit)
// Изход: 0 = чисто; 1 = намерена тайна; 2 = вътрешна грешка.

import { readFileSync, statSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const RED = "\x1b[31m", YEL = "\x1b[33m", GRN = "\x1b[32m", DIM = "\x1b[2m", RST = "\x1b[0m";

// Висок-сигнал шаблони за тайни (почти никога фалшиви) — от ЕДИНСТВЕНИЯ източник
// `tools/lib/secret-patterns.mjs`. Дотук списъкът живееше тук, а рънтайм предпазителите носеха свой,
// преписан на ръка — и дрейфнаха (18 срещу 8). Този гейт ползва ALL (CREDENTIAL + COMMIT_ONLY: JWT
// в комит е реален изтек); предпазителите ползват само CREDENTIAL. Parity: secret-parity.test.mjs.
import { ALL, asTuples } from "../lib/secret-patterns.mjs";
const RULES = asTuples(ALL);

// Шумно правило (има фалшиви: .env.example, тестове, полета-имена) — само с --strict,
// за ръчен по-дълбок одит, и НЕ върху example/test/doc/seed файлове. По подразбиране
// (CI/pre-commit) не се пуска, за да остане гейтът достоверен (нула фалшиви тревоги).
const STRICT = process.argv.includes("--strict");
const GENERIC_RULE = ["Generic hardcoded secret", /(?:secret|passwd|password|api[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*['"][^'"\s${}]{12,}['"]/i];
const GENERIC_SKIP = /(?:\.example|\.sample|\.template|\.md$|\.test\.|\.spec\.|__tests__\/|(?:^|\/)tests?\/|(?:^|\/)prisma\/seed)/i;

// Празни/плейсхолдер стойности, които НЕ са тайни (изрязваме шума за Generic правилото).
const PLACEHOLDER = /\b(?:example|sample|changeme|your[_-]|placeholder|dummy|test[_-]?key|xxx+|<[^>]+>|process\.env|import\.meta\.env|redacted|todo|fixme|000000|123456|foobar)\b/i;

// Пътища/файлове, които пропускаме (шум/бинарни/самореференция към шаблоните тук).
const SKIP_PATH = /(?:^|\/)(?:node_modules|\.git|dist|build|\.next|coverage|out|vendor|\.turbo)\//;
const SKIP_FILE = /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.min\.(?:js|css)|\.map|\.woff2?|\.ttf|\.png|\.jpe?g|\.gif|\.webp|\.avif|\.ico|\.pdf|\.zip|\.mp4|\.webm)$/i;
// Файлове, които СЪДЪРЖАТ шаблони за тайни като данни (иначе биха се самозасекли).
const SELF = /(?:tools\/security\/secret-scan\.mjs|tools\/code\/semgrep-rules\.yml|_memory\/SECURITY\.md|(?:^|\/)SECURITY\.md)$/;
// .env файлове, които НЕ бива да са проследени (example/sample са ок).
const ENV_TRACKED = /(?:^|\/)\.env(?:\.[a-z0-9]+)*$/i;
const ENV_OK = /\.(?:example|sample|template)$/i;

function fileList() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (args.length) return args;
  try {
    return execSync("git ls-files", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n").filter(Boolean);
  } catch {
    console.error(`${RED}✘ Не мога да изброя git файлове (git ls-files).${RST}`);
    process.exit(2);
  }
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

const findings = [];
for (const f of fileList()) {
  if (SKIP_PATH.test("/" + f) || SKIP_FILE.test(f) || SELF.test(f)) continue;
  if (!existsSync(f)) continue;
  try { if (statSync(f).size > 5 * 1024 * 1024) continue; } catch { continue; }

  // git-проследен .env (не example) = находка сама по себе си
  if (ENV_TRACKED.test(f) && !ENV_OK.test(f)) {
    findings.push({ file: f, line: 0, rule: "Проследен .env файл (тайни в git)", snippet: f });
    continue;
  }

  let buf;
  try { buf = readFileSync(f); } catch { continue; }
  if (isBinary(buf)) continue;
  const lines = buf.toString("utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.length > 4000) continue; // минифициран/данни ред
    const rules = STRICT && !GENERIC_SKIP.test(f) ? [...RULES, GENERIC_RULE] : RULES;
    for (const [rule, re] of rules) {
      const m = ln.match(re);
      if (!m) continue;
      if (rule.startsWith("Generic") && PLACEHOLDER.test(ln)) continue; // изрежи плейсхолдери
      const hit = m[0];
      const redacted = hit.length > 12 ? hit.slice(0, 6) + "…" + hit.slice(-2) : "«скрито»";
      findings.push({ file: f, line: i + 1, rule, snippet: redacted });
    }
  }
}

if (!findings.length) {
  console.log(`${GRN}✓ secret-scan: чисто — нула изтекли тайни в проследените файлове.${RST}`);
  process.exit(0);
}
console.error(`${RED}✘ secret-scan: ${findings.length} възможни тайни — НЕ комитвай/мерджвай:${RST}`);
for (const f of findings) {
  console.error(`  ${YEL}${f.file}:${f.line}${RST}  ${f.rule}  ${DIM}(${f.snippet})${RST}`);
}
console.error(`\n${DIM}Ако е фалшива тревога: премести тайната в .env (mode 600, извън git) или коригирай шаблона.${RST}`);
process.exit(1);
