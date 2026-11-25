#!/usr/bin/env node
// guard-secrets.mjs — тайна в съдържанието, което агентът пише (Write|Edit|MultiEdit|NotebookEdit).
//
// Два режима по `hook_event_name` (19.11.2026, по https://code.claude.com/docs/en/hooks.md: PostToolUse тича
// СЛЕД инструмента — записаното вече е на диска; за предотвратяване се ползва PreToolUse):
//   • PreToolUse (основният): ВИСОКО-УВЕРЕН секрет-шаблон (near-zero-FP) в новото съдържание → отказ (exit 2),
//     тайната не стига до диска. Fail-closed: неразбираем payload или вътрешна грешка → отказ;
//     срив/таймаут → `onFailure: "block"`.
//   • PostToolUse (втори слой, ако PreToolUse не е тичал — напр. стара сесия): предупреждение (exit 2) да се
//     махне ПРЕДИ commit. Fail-open.
// Реалният твърд гейт остава `tools/security/secret-scan.mjs` при commit/CI.
// Пропуска fixture/eval/test/scratch пътища (там фалшиви ключове са легитимни).
//
// Договор: stdin = JSON {hook_event_name, tool_name, tool_input:{file_path, content|new_string|edits|new_source}}.

// Near-zero-FP шаблони — от ЕДИНСТВЕНИЯ източник `tools/lib/secret-patterns.mjs`.
// Дотук този списък беше преписан на ръка с коментар „както в secret-scan" и дрейфна до 8 срещу 18:
// рънтайм предпазителите (този + guard-exfil + guard-prompt) пропускаха литерален Anthropic/OpenAI
// ключ, Discord bot token, SendGrid, Twilio, GitHub OAuth, GOCSPX, Slack webhook и AWS secret.
// Ползваме CREDENTIAL (не ALL): JWT остава само за commit гейта, защото `Authorization: Bearer eyJ…`
// е ЛЕГИТИМЕН рънтайм трафик и блокирането му би било фалшива тревога (виж secret-patterns.mjs).
import { CREDENTIAL } from "../../tools/lib/secret-patterns.mjs";
import { isMain } from "../../tools/lib/is-main.mjs";
export const SECRET_RE = CREDENTIAL;

// Пътища, където фалшиви ключове са легитимни (фикстури/тестове/eval/scratch) → не вдигай шум.
export const SKIP_PATH = /(^|\/)(evals?|fixtures?|__tests__|test|tests|\.tmp|scratchpad|node_modules)(\/|$)|\.(test|spec)\.[a-z]+$/i;

// Невидими знаци, с които се крие/разкъсва payload. Red-team F6/F7: старият списък покриваше само
// U+200B-200F/U+202A-202E/U+2066-2069 и ПРОПУСКАШЕ Unicode Tags блока U+E0000-E007F (огледално
// повтаря ASCII, не се вижда в браузър/терминал/ревю, но моделът го чете), както и U+FEFF, U+2060,
// U+00AD, U+180E, U+3164. Един `sk_live_…` с вмъкнат U+200B преставаше да се разпознава като тайна.
// Санитизираме ВЕДНЪЖ на едно място, вместо да разширяваме два отделни списъка ad hoc.
// 02.11.2026: + селекторите на варианти (U+FE00-FE0F, U+E0100-E01EF), CGJ U+034F, U+061C, хангъл
// пълнителите U+115F/U+1160/U+FFA0, монголските FVS U+180B-180D и кхмерските U+17B4/17B5. Записан с
// \u escape-и: суровите невидими знаци в изходния код не се виждат при ревю (същата причина, поради
// която ги махаме).
export const INVISIBLE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFE00-\uFE0F\uFEFF\uFFA0]|[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;

/** Маха невидимите знаци, нормализира (NFKC) и разкодира %XX, за да не се крие payload зад тях. */
export function sanitize(text) {
  const s = String(text || "").normalize("NFKC").replace(INVISIBLE, "");
  // Червен екип 31.10.2026: `sk%5Flive%5F…` в адрес минаваше покрай шаблоните. Разкодираме всяка
  // %XX двойка поотделно (счупено кодиране не хвърля), два пъти — срещу двойно кодиране.
  if (!s.includes("%")) return s;
  const once = (x) => x.replace(/(?:%[0-9A-Fa-f]{2})+/g, (m) => { try { return decodeURIComponent(m); } catch { return m; } });
  return once(once(s)).normalize("NFKC").replace(INVISIBLE, "");
}

export function findSecret(content) {
  const s = sanitize(content);
  for (const p of SECRET_RE) if (p.re.test(s)) return p.name;
  return null;
}

/** Пътят на записания файл за всеки инструмент (Write/Edit: file_path · NotebookEdit: notebook_path). */
export const fileOf = (ti = {}) => ti.file_path || ti.notebook_path || "";

/** Записаното съдържание за всеки инструмент: Write → content · Edit → new_string ·
 *  NotebookEdit → new_source · MultiEdit → edits[].new_string. Чиста, тестваема функция. */
export function contentOf(ti = {}) {
  return ti.content ?? ti.new_string ?? ti.new_source ??
    (Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string ?? "").join("\n") : "");
}

/** Решение за payload: {exit, message}. Чиста функция — тестваема. */
export function verdict(payload) {
  const pre = payload?.hook_event_name === "PreToolUse";
  const ti = payload?.tool_input || {};
  // Кръг 2 (2026-09-09): NotebookEdit пише в `notebook_path`/`new_source`, MultiEdit в `edits[]` —
  // куката четеше само Write/Edit полетата, значи тайна в бележник или в мулти-редакция минаваше
  // (проба: изход 0). Тук четем всички форми; matcher-ът в settings.json включва и двата инструмента.
  const file = fileOf(ti);
  if (file && SKIP_PATH.test(file)) return { exit: 0, message: "" };
  const hit = findSecret(contentOf(ti));
  if (!hit) return { exit: 0, message: "" };
  return pre
    ? { exit: 2, message: `⛔ guard-secrets: записът е отказан — възможен ${hit} в ${file || "файла"}. Тайните живеят само на сървъра (mode 600), никога в репото. Сложи плейсхолдър (напр. в .env.example) и пиши отново.\n` }
    : { exit: 2, message: `⚠️  guard-secrets: възможен ${hit} в ${file || "записания файл"}. Махни го (тайните живеят само на сървъра, mode 600) ПРЕДИ commit. Пусни: node tools/security/secret-scan.mjs\n` };
}

if (isMain(import.meta.url)) {
  let buf = "";
  const fail = (pre) => {
    // PreToolUse е пазач (fail-closed); PostToolUse е само предупреждение (fail-open).
    if (pre) { process.stderr.write("⛔ guard-secrets: неразбираем payload или вътрешна грешка — записът е отказан (fail-closed).\n"); process.exit(2); }
    process.exit(0);
  };
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => {
    let payload;
    try { payload = JSON.parse(buf || "{}"); } catch { return fail(/"hook_event_name"\s*:\s*"PreToolUse"/.test(buf) || !/PostToolUse/.test(buf)); }
    try {
      const v = verdict(payload);
      if (v.message) process.stderr.write(v.message);
      process.exit(v.exit);
    } catch {
      fail(payload?.hook_event_name !== "PostToolUse");
    }
  });
  process.stdin.on("error", () => process.exit(0));
}
