#!/usr/bin/env node
// artifact-sync.mjs — Stop hook: агентите научиха нещо → артефактът на флота се обновява ВИНАГИ.
//
// Решение на собственика (2026-09-23): „искам да ъпдейтваш винаги и артефакта на агентите, когато се
// учат". Кука не може сама да публикува Artifact (това е инструмент на модела, не на шела), затова
// налагаме реда на харнеса: ако клонът на паметта `agents/memory` е напреднал спрямо последния
// ПУБЛИКУВАН връх, сесията не спира тихо — връща се ВЕДНЪЖ с точните стъпки.
//
// Не блокира: няма клон на паметта · върхът вече е публикуван · повторно спиране (stop_hook_active →
// само напомняне; иначе безкраен цикъл, ако публикуването е невъзможно в тази среда). Fail-open.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { publishedTip, ARTIFACT_URL } from "../../tools/docs/build-artifact.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// САМО локалният клон на паметта: той се появява, когато В ТОЗИ clone е публикувана поука (куката или
// harvest). Отдалеченият `origin/agents/memory` идва с всеки нов clone — ако гледахме него, всяка нова
// сесия щеше да иска публикуване, без агентите да са научили нищо.
export function learnedTip(cwd = ROOT) {
  const r = spawnSync("git", ["rev-parse", "-q", "--verify", "refs/heads/agents/memory^{commit}"], { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Чиста логика: нужно ли е обновяване и какво да се каже. */
export function artifactDue(tip, published) {
  if (!tip || tip === published) return null;
  const s = tip.slice(0, 8);
  return `Artifact-sync: агентите научиха нови поуки (agents/memory → ${s}), а артефактът на флота е от ` +
    `${published ? published.slice(0, 8) : "по-стара версия"}. Обнови го: ` +
    `(1) node tools/docs/build-artifact.mjs <scratchpad>/galaxy-artifact.html ` +
    `(2) Artifact publish на СЪЩИЯ адрес ${ARTIFACT_URL} ` +
    `(3) node tools/docs/build-artifact.mjs --mark-published ${tip}. ` +
    `Ако публикуването е невъзможно в тази среда, кажи го изрично на потребителя.`;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { /* fail-open */ }
  const msg = artifactDue(learnedTip(ROOT), publishedTip(ROOT));
  if (!msg) process.exit(0);
  if (payload.stop_hook_active) { console.log(`⚠ ${msg}`); process.exit(0); }
  console.error(msg);
  process.exit(2); // върни сесията веднъж
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch { process.exit(0); } }
