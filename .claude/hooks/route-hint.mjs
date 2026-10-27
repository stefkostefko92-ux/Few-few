#!/usr/bin/env node
// route-hint.mjs — UserPromptSubmit: на всяка заявка казва на главната сесия кой НАШ агент я поема.
//
// Защо (правило на собственика, 2026-10-27): „когато задачата иска агент — наш агент“. Правило в
// CLAUDE.md е пожелание; главната сесия го забравя под натиск и посяга към общ агент или прави всичко
// сама, а общият агент не учи флота (няма памет, дневник, оценка). Тук рутерът на екипите
// (tools/agents/teams.mjs) се пуска върху самата заявка и ако хване екип, слага пред сесията един ред:
// кой е нашият агент и с кой поток. Нищо не хваща → мълчи (без шум на „ок“ и „продължи“).
//
// Fail-open: всяка грешка → изход 0 без изход; подсказката никога не спира заявката.

import { readFileSync } from "node:fs";
import { route, loadTeams, names } from "../../tools/agents/teams.mjs";

export const MIN_PROMPT = 12; // по-кратко е „ок“/„продължи“ — няма какво да се рутира

/** Подсказката за заявката или празен низ. Чиста функция — тества се без харнес. */
export function hintFor(prompt, T = loadTeams(), nm = names()) {
  const text = String(prompt || "").trim();
  if (text.length < MIN_PROMPT) return "";
  const r = route(text, T);
  if (r.fallback || !r.score) return "";
  const team = T.teams.find((t) => t.id === r.team);
  const name = (id) => nm[id] || id;
  const flow = team?.workflow?.steps?.map((s) => name(s.agent)).join(" → ");
  const tie = r.ambiguous ? ` Равно с екип „${T.teams.find((t) => t.id === r.rival)?.name || r.rival}“ — избери по същината.` : "";
  return `🧭 Маршрут: екип „${team?.name || r.team}“ — наш агент ${name(r.agent)} (subagent_type: ${r.agent})` +
    (flow ? `; поток: ${flow}` : "") + `.${tie} Когато задачата иска агент — пускай нашия (правило на собственика), не общ; ` +
    `ако никой не пасва, кажи го и предложи нов агент или умение.`;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  const hint = hintFor(payload.prompt);
  if (!hint) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: hint } }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch { /* fail-open */ }
  process.exit(0);
}
