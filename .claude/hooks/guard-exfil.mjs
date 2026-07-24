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
const NET_SEND = /\b(curl|wget|nc|ncat|netcat|telnet|scp|sftp|rsync)\b|\/dev\/tcp\//i;
// Референция към тайна env-променлива ($NAME или ${NAME}), която изглежда секретна.
// Case-insensitive (red-team F2: $mytoken минаваше; малки букви също са тайна).
const SECRET_ENV = /\$\{?\s*[A-Za-z0-9_]*(SECRET|_KEY|APIKEY|API_KEY|TOKEN|PASSWORD|PASSWD|_PWD|_DSN|DATABASE_URL|PRIVATE_KEY|ACCESS_KEY|AUTH_?TOKEN|CREDENTIAL)[A-Za-z0-9_]*\s*\}?/i;
// Изпращане на .env файл (cat/source/redirect/upload).
const ENV_FILE = /(cat|source|\.|<|--data(-binary)?\s+@|--data-urlencode\s+@|-d\s+@|-T|--upload-file)\s+[^\n]*\.env\b|@\.env\b/i;
// Пълен env dump, пуснат нанякъде.
// F2: лови и `$(printenv)` / `$(env)` субституция (не само pipe/redirect), + затварящи `)"'`.
const ENV_DUMP = /\b(printenv|env)\b\s*(\||>|\)|["']|$)|\$\(\s*(printenv|env)\b/;
// F2: `curl --data @file` / `-T file` към мрежа, КОГАТО файлът изглежда чувствителен (пази near-zero-FP —
// не флагва легитимен `curl -d @body.json`). Лови стейджната тайна в не-.env файл.
const DATA_FILE_SEND = /(--data(-binary|-urlencode)?|-d|-T|--upload-file)\s+@?["']?\S*(secret|token|apikey|api[_-]?key|cred|password|passwd|\.env|\.pem|id_rsa|private[_-]?key)\S*/i;

export function detectBashExfil(command) {
  const s = String(command || "");
  if (!NET_SEND.test(s)) {
    // без мрежов verb: пак пази изнасяне на .env dump през pipe към мрежа само ако има NET_SEND — иначе allow
    return null;
  }
  for (const p of SECRET_RE) if (p.re.test(s)) return `литерален ${p.name} към мрежата`;
  const m = s.match(SECRET_ENV);
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
