#!/usr/bin/env node
// guard-exfil.mjs — PreToolUse(Bash|WebFetch) предпазител срещу ИЗНАСЯНЕ на тайни/данни навън
// (lethal-trifecta изходът). guard-secrets пази ЗАПИС в repo; тук пазим ИЗПРАЩАНЕ навън през мрежата.
// Блокира само високо-уверени exfil вектори (near-zero-FP): нормалните curl/wget/git/npm минават.
// **Fail-open при вътрешна грешка** (хук-бъг не спира работата); БЛОКИРА при засечен exfil (exit 2).
//
// Договор: stdin = JSON {tool_name, tool_input}. Bash → tool_input.command; WebFetch → tool_input.url.
// Регистриран като PreToolUse matcher "Bash|WebFetch".

import { SECRET_RE } from "./guard-secrets.mjs"; // единствен източник за „какво е тайна"

// Verb, който ИЗПРАЩА навън (не включва git/psql/npm — те не са exfil в нашия контекст).
const NET_SEND = /\b(curl|wget|nc|ncat|netcat|telnet|scp|sftp|rsync|ssh)\b|\/dev\/tcp\//i;
// Red-team F2: ИНТЕРПРЕТАТОРЪТ също е мрежов канал — `node -e 'fetch(...)'` не съдържа нито един
// verb отгоре и минаваше безпрепятствено. Искаме И интерпретатор, И мрежово извикване (иначе
// всеки `node script.js` би вдигал фалшива тревога).
const NET_INTERPRETER =
  /\b(node|deno|bun|python3?|perl|ruby|php)\b[^\n]*(-e|-c|--eval|--exec)?[^\n]*\b(fetch\s*\(|urllib|requests\.(get|post|put)|http\.client|net\/http|Net::HTTP|file_get_contents|curl_exec|XMLHttpRequest)/i;
const isNetChannel = (s) => NET_SEND.test(s) || NET_INTERPRETER.test(s);
// Референция към тайна env-променлива ($NAME или ${NAME}), която изглежда секретна.
// Case-insensitive (red-team F2: $mytoken минаваше; малки букви също са тайна).
// Red-team F3: списъкът пропускаше чести имена. Добавени PASS/PAT/SK/JWT/COOKIE/SESSION/KEY.
// ВНИМАНИЕ за фалшиви позитиви: `PAT` без lookahead лови `$PATH` (най-често ползваната променлива
// изобщо), а голо `KEY` лови `$MONKEY` — затова и двете са с граници.
const SECRET_ENV =
  /\$\{?\s*[A-Za-z0-9_]*(SECRET|_KEY\b|KEY(?![A-Za-z])|APIKEY|API_KEY|TOKEN|PASSWORD|PASSWD|PASS(?![A-Za-z])|_PWD|_DSN|DATABASE_URL|PRIVATE_KEY|PRIVKEY|ACCESS_KEY|AUTH_?TOKEN|CREDENTIAL|_PAT\b|PAT(?![A-Za-z])|_SK\b|SK_|JWT|COOKIE|SESSION)[A-Za-z0-9_]*\s*\}?/i;
// Достъп до тайна от КОД (`process.env.X`, `os.environ['X']`, `ENV['X']`, `getenv('X')`) — няма `$`
// отпред, затова SECRET_ENV не го хващаше и целият интерпретаторен вектор оставаше отворен.
const SECRET_ENV_CODE =
  /(process\.env|os\.environ|ENV\[|getenv\s*\()\s*[.\['"]{0,2}\s*[A-Za-z0-9_]*(SECRET|KEY|TOKEN|PASSWORD|PASS|CREDENTIAL|DATABASE_URL|DSN|PRIVKEY|JWT|COOKIE|SESSION)/i;
// Изпращане на .env файл (cat/source/redirect/upload).
const ENV_FILE = /(cat|source|\.|<|--data(-binary)?\s+@|--data-urlencode\s+@|-d\s+@|-T|--upload-file)\s+[^\n]*\.env\b|@\.env\b/i;
// Пълен env dump, пуснат нанякъде.
// F2: лови и `$(printenv)` / `$(env)` субституция (не само pipe/redirect), + затварящи `)"'`.
const ENV_DUMP = /\b(printenv|env)\b\s*(\||>|\)|["']|$)|\$\(\s*(printenv|env)\b/;
// F2: `curl --data @file` / `-T file` към мрежа, КОГАТО файлът изглежда чувствителен (пази near-zero-FP —
// не флагва легитимен `curl -d @body.json`). Лови стейджната тайна в не-.env файл.
const DATA_FILE_SEND = /(--data(-binary|-urlencode)?|-d|-T|--upload-file)\s+@?["']?\S*(secret|token|apikey|api[_-]?key|cred|password|passwd|\.env|\.pem|id_rsa|private[_-]?key)\S*/i;

// Red-team F5 (двустъпково стажиране): хуковете са БЕЗ състояние между извиквания, затова
// `printenv > /tmp/s.txt` (ход 1) и `curl --data-binary @/tmp/s.txt` (ход 2) минаваха поотделно.
// Не можем да свържем ходовете, но можем да срежем ВЕРИГАТА при ход 1: пълен env dump във ФАЙЛ
// няма легитимна употреба в агентски контекст.
const ENV_DUMP_TO_FILE = /\b(printenv|env)\s*(\||>|>>)\s*\S/;
// Red-team F4: `cat secrets.json | curl --data-binary @-` — чувствителният файл е ВЛЯВО от пайпа,
// затова DATA_FILE_SEND (който гледа само аргумента на curl) не го виждаше.
const SENSITIVE_READ_PIPED =
  /\b(cat|head|tail|base64|gpg|openssl|xxd|strings)\b[^\n|]*\b\S*(secret|token|apikey|api[_-]?key|cred|password|passwd|\.env|\.pem|id_rsa|private[_-]?key|\.npmrc|\.netrc)\S*[^\n|]*\|/i;

export function detectBashExfil(command) {
  const s = String(command || "");
  // Проверките БЕЗ нужда от мрежов канал (режат веригата рано).
  if (ENV_DUMP_TO_FILE.test(s)) return "пълен env dump във файл (стажиране за по-късно изнасяне)";
  if (!isNetChannel(s)) return null;
  if (SENSITIVE_READ_PIPED.test(s)) return "чувствителен файл, четен в пайп към мрежов канал";
  for (const p of SECRET_RE) if (p.re.test(s)) return `литерален ${p.name} към мрежата`;
  const m = s.match(SECRET_ENV) || s.match(SECRET_ENV_CODE);
  if (m) return `тайна env променлива (${m[0].trim()}) към мрежата`;
  if (ENV_FILE.test(s)) return ".env файл изпращан навън";
  if (ENV_DUMP.test(s)) return "пълен env dump към мрежата";
  if (DATA_FILE_SEND.test(s)) return "чувствителен файл (secret/token/.env/.pem) изпращан навън";
  return null;
}

export function detectUrlExfil(url) {
  const s = String(url || "");
  for (const p of SECRET_RE) if (p.re.test(s)) return `${p.name} в URL`;
  if (/[?&](api[_-]?key|access[_-]?token|secret|password|passwd|auth[_-]?token|session)=[^&\s]{8,}/i.test(s)) return "секрет в URL query";
  return null;
}

// Red-team F2 (президент + Разбивача, 2026-07-29): guard-exfil пазеше само Bash|WebFetch, а
// WebSearch е СЪЩО изходен канал — низът на заявката напуска към търсачка и е контролируем от
// инжектирано съдържание. Агент, подмамен да „търси" тайна, я изнася през заявката. Проверяваме
// същите литерални тайни (SECRET_RE) в query-то; нормалните търсения минават (near-zero-FP).
export function detectSearchExfil(query) {
  const s = String(query || "");
  for (const p of SECRET_RE) if (p.re.test(s)) return `${p.name} в текста на търсенето`;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let buf = "";
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(buf || "{}");
      const tool = payload?.tool_name || "";
      const ti = payload?.tool_input || {};
      let why = null;
      if (/bash/i.test(tool)) why = detectBashExfil(ti.command);
      else if (/webfetch/i.test(tool)) why = detectUrlExfil(ti.url);
      else if (/websearch/i.test(tool)) why = detectSearchExfil(ti.query);
      if (why) {
        process.stderr.write(`⛔ Блокирано от guard-exfil: ${why}. Тайните живеят само на сървъра — не се изнасят навън от агента. Ако е легитимно, направи го ръчно извън агента.\n`);
        process.exit(2);
      }
      process.exit(0);
    } catch {
      process.exit(0); // fail-open при хук-грешка
    }
  });
  process.stdin.on("error", () => process.exit(0));
}
