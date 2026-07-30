#!/usr/bin/env node
// guard-secrets.mjs — PostToolUse(Write|Edit) ранно предупреждение. Ако тъкмо записан файл съдържа
// ВИСОКО-УВЕРЕН секрет-шаблон (near-zero-FP), surface-ва предупреждение веднага (exit 2), за да го махнеш
// ПРЕДИ commit. Не отменя записа — реалният hard gate е `tools/security/secret-scan.mjs` при commit/CI.
// Пропуска fixture/eval/test/scratch пътища (там фалшиви ключове са легитимни). **Fail-open** навсякъде.
//
// Договор: stdin = JSON {tool_name, tool_input:{file_path, content|new_string}}. Регистриран като
// PostToolUse matcher "Write|Edit".

// Near-zero-FP шаблони — от ЕДИНСТВЕНИЯ източник `tools/lib/secret-patterns.mjs`.
// Дотук този списък беше преписан на ръка с коментар „както в secret-scan" и дрейфна до 8 срещу 18:
// рънтайм предпазителите (този + guard-exfil + guard-prompt) пропускаха литерален Anthropic/OpenAI
// ключ, Discord bot token, SendGrid, Twilio, GitHub OAuth, GOCSPX, Slack webhook и AWS secret.
// Ползваме CREDENTIAL (не ALL): JWT остава само за commit гейта, защото `Authorization: Bearer eyJ…`
// е ЛЕГИТИМЕН рънтайм трафик и блокирането му би било фалшива тревога (виж secret-patterns.mjs).
import { CREDENTIAL } from "../../tools/lib/secret-patterns.mjs";
export const SECRET_RE = CREDENTIAL;

// Пътища, където фалшиви ключове са легитимни (фикстури/тестове/eval/scratch) → не вдигай шум.
export const SKIP_PATH = /(^|\/)(evals?|fixtures?|__tests__|test|tests|\.tmp|scratchpad|node_modules)(\/|$)|\.(test|spec)\.[a-z]+$/i;

// Невидими знаци, с които се крие/разкъсва payload. Red-team F6/F7: старият списък покриваше само
// U+200B-200F/U+202A-202E/U+2066-2069 и ПРОПУСКАШЕ Unicode Tags блока U+E0000-E007F (огледално
// повтаря ASCII, не се вижда в браузър/терминал/ревю, но моделът го чете), както и U+FEFF, U+2060,
// U+00AD, U+180E, U+3164. Един `sk_live_…` с вмъкнат U+200B преставаше да се разпознава като тайна.
// Санитизираме ВЕДНЪЖ на едно място, вместо да разширяваме два отделни списъка ad hoc.
export const INVISIBLE =
  /[­᠎​-‏‪-‮⁠-⁤⁦-⁩ㅤ﻿]|[\u{E0000}-\u{E007F}]/gu;

/** Маха невидимите знаци и нормализира (NFKC), за да не се крие payload зад тях. */
export function sanitize(text) {
  return String(text || "").normalize("NFKC").replace(INVISIBLE, "");
}

export function findSecret(content) {
  const s = sanitize(content);
  for (const p of SECRET_RE) if (p.re.test(s)) return p.name;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let buf = "";
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(buf || "{}");
      const ti = payload?.tool_input || {};
      const file = ti.file_path || "";
      if (file && SKIP_PATH.test(file)) process.exit(0);
      const content = ti.content ?? ti.new_string ?? "";
      const hit = findSecret(content);
      if (hit) {
        process.stderr.write(`⚠️  guard-secrets: възможен ${hit} в ${file || "записания файл"}. Махни го (тайните живеят само на сървъра, mode 600) ПРЕДИ commit. Пусни: node tools/security/secret-scan.mjs\n`);
        process.exit(2);
      }
      process.exit(0);
    } catch {
      process.exit(0); // fail-open
    }
  });
  process.stdin.on("error", () => process.exit(0));
}
