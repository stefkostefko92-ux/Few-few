#!/usr/bin/env node
// guard-prompt.mjs — UserPromptSubmit hook: щит на ВХОДА на сесията.
// Единствената цел: случайно ПОСТАВЕНА ТАЙНА в промпта (реален ключ от клипборда) да не влезе
// в контекста/логовете. Ползва високо-доверителните шаблони на secret-scan (near-zero-FP).
// НЕ филтрира инструкциите на потребителя (той е доверен) — само тайни. Fail-open при грешка.
// Изричен байпас: ако промптът съдържа „[секрет-ок]", пропуска (нарочно поставена примерна тайна).
//
// Exit 2 → промптът се блокира, потребителят вижда защо (ключът НЕ влиза в историята).

import { readFileSync } from "node:fs";

// Високо-доверителни шаблони (подмножество на tools/security/secret-scan.mjs — дръж ги в синхрон).
export const SECRET_RES = [
  ["Anthropic/OpenAI ключ", /\bsk-(?:ant-|proj-)?[0-9A-Za-z_-]{24,}\b/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}\b/],
  ["Google API ключ", /\bAIza[0-9A-Za-z\-_]{35}\b/],
  ["Slack token", /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ["Stripe ключ", /\b[sr]k_live_[0-9A-Za-z]{20,}\b/],
  ["PEM частен ключ", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Discord bot token", /\b[MNO][A-Za-z0-9_-]{23,26}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/],
];

// Чиста логика — тестваема: {hits:[имена], ok}.
export function scanPrompt(text) {
  if (String(text).includes("[секрет-ок]")) return { hits: [], ok: true, bypass: true };
  const hits = SECRET_RES.filter(([, re]) => re.test(text)).map(([name]) => name);
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
