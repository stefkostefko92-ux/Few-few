#!/usr/bin/env node
// guard-prompt.mjs — UserPromptSubmit hook: щит на ВХОДА на сесията.
// Единствената цел: случайно ПОСТАВЕНА ТАЙНА в промпта (реален ключ от клипборда) да не влезе
// в контекста/логовете. Ползва високо-доверителните шаблони на secret-scan (near-zero-FP).
// НЕ филтрира инструкциите на потребителя (той е доверен) — само тайни. Fail-open при грешка.
// Изричен байпас: ако промптът съдържа „[секрет-ок]", пропуска (нарочно поставена примерна тайна).
//
// Exit 2 → промптът се блокира, потребителят вижда защо (ключът НЕ влиза в историята).
//
// Red-team 2026-09-08: ТРИ файла (secret-patterns.mjs · secret-parity.test.mjs · guard-secrets.mjs)
// твърдяха, че „трите рънтайм предпазителя импортират същия SECRET_RE" — а този носеше СОБСТВЕН,
// ръчно преписан списък от 7 шаблона (срещу 17 в CREDENTIAL) и не санитизираше. Живо доказано
// с проби през CLI-то: AWS ключ, SendGrid, GitHub fine-grained PAT, Google OAuth secret, Twilio,
// Slack webhook и `sk_live_` с вмъкнат U+200B — всичките с изход 0 (РАЗРЕШЕНО). Parity тестът
// пазеше guard-secrets и secret-scan, но НЕ и този файл — „зелено по слепота": документ, който
// описва състояние, което не съществува. Сега импортира и се пази от същия тест.

import { readFileSync } from "node:fs";
import { SECRET_RE, sanitize } from "./guard-secrets.mjs"; // единствен източник + санитизация

// [name, re] кортежи (запазен формат за консуматорите) — от CREDENTIAL, никога преписани.
export const SECRET_RES = SECRET_RE.map((p) => [p.name, p.re]);

// Чиста логика — тестваема: {hits:[имена], ok}.
export function scanPrompt(text) {
  const raw = String(text ?? "");
  if (raw.includes("[секрет-ок]")) return { hits: [], ok: true, bypass: true };
  const s = sanitize(raw); // невидими знаци (U+200B, Unicode Tags…) не крият payload
  const hits = SECRET_RES.filter(([, re]) => re.test(s)).map(([name]) => name);
  return { hits, ok: hits.length === 0, bypass: false };
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
  const prompt = String(payload.prompt || payload.user_prompt || "");
  if (!prompt) process.exit(0);
  const r = scanPrompt(prompt);
  if (r.ok) process.exit(0);
  console.error(`⛔ guard-prompt: промптът съдържа каквото прилича на РЕАЛНА тайна (${r.hits.join(", ")}). Не я поставяй в чат — тя влиза в история/логове. РОТИРАЙ ключа, ако е истински. Ако е нарочен пример — добави „[секрет-ок]" в съобщението.`);
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { process.exit(0); } }
