#!/usr/bin/env node
// doctrine-skill.mjs — генерира умението agent-doctrine от двата източника на истината.
//
// Защо умение, а не кука: статичната доктрина (сигурност + процедура) е еднаква за всички 29 агента и
// не зависи от задачата. Подадена като `skills:` във frontmatter, тя влиза в контекста на агента при
// старт по механизма на харнеса, без тавана от 10 000 знака на `additionalContext` на куките, и след
// компактиране оцелява (първите 5 000 токена на всяко умение се връщат). Куката остава за това, което
// зависи от агента и задачата: картата, личната памет и споделените поуки.
//
// Източниците остават _memory/SECURITY.md (секция „Доктрина“) и _memory/PROCEDURE.md (секция
// „Процедура“) — умението е техен генериран образ, байт в байт същият текст, който куката подаваше.
//
//   node tools/agents/doctrine-skill.mjs           # --check: умението съвпада ли с източниците
//   node tools/agents/doctrine-skill.mjs --write   # генерирай го наново

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { securityDoctrine, procedureDoctrine } from "../../.claude/hooks/memory-preload.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SKILL_NAME = "agent-doctrine";
export const SKILL_FILE = join(ROOT, ".claude", "skills", SKILL_NAME, "SKILL.md");

const DESCRIPTION =
  "Общата доктрина за сигурност и процедурата на нашите агенти — единен цикъл, red lines, блокът ПРЕДАВАНЕ, " +
  "стълбата за възстановяване и схемата за учене. Зарежда се предварително във всеки агент от .claude/agents " +
  "през skills; ползвай го, когато пишеш или преглеждаш агентска дефиниция, доктрината или процедурата.";

export function renderDoctrineSkill() {
  const body = [securityDoctrine(), procedureDoctrine()].filter(Boolean).join("\n\n");
  return [
    "---",
    `name: ${SKILL_NAME}`,
    "description: >-",
    `  ${DESCRIPTION}`,
    "user-invocable: false",
    "---",
    "",
    "# Доктрина и процедура на агентите",
    "",
    "Генерирано от `.claude/agents/_memory/SECURITY.md` и `PROCEDURE.md` (`node tools/agents/doctrine-skill.mjs --write`).",
    "",
    body,
    "",
  ].join("\n");
}

function main(argv) {
  const want = renderDoctrineSkill();
  if (argv.includes("--write")) {
    mkdirSync(dirname(SKILL_FILE), { recursive: true });
    writeFileSync(SKILL_FILE, want);
    console.log(`✓ ${SKILL_NAME}: записано (${want.length} знака)`);
    return;
  }
  const have = existsSync(SKILL_FILE) ? readFileSync(SKILL_FILE, "utf8") : "";
  if (have === want) { console.log(`✓ ${SKILL_NAME}: съвпада с _memory/SECURITY.md + PROCEDURE.md`); return; }
  console.log(`✗ ${SKILL_NAME}: ${have ? "разминава се с" : "липсва спрямо"} _memory/SECURITY.md + PROCEDURE.md — пусни: node tools/agents/doctrine-skill.mjs --write`);
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
