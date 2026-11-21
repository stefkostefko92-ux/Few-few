#!/usr/bin/env node
// guard-model.mjs — PreModelSwitch: правилото „никога Haiku“ на собственика като механизъм, не като молба.
//
// Защо (19.11.2026, по https://code.claude.com/docs/en/hooks.md — PreModelSwitch, v2.1.251+): смяна на модела
// през `/model`, `/config` или `set_model` минава оттук; кука на проектно ниво може да я откаже. Фоновите задачи
// на харнеса (заглавия, обобщения, `/goal`, псевдонимът `haiku`) се пренасочват отделно с
// `ANTHROPIC_DEFAULT_HAIKU_MODEL` в `.claude/settings.json` (https://code.claude.com/docs/en/env-vars.md).
// `deniedModels` действа само в managed settings — затова е кука.
//
// Решение: целевият модел е Haiku (по ID или по поискания псевдоним) → deny с причина. Друго → без решение.
// Fail-closed: неразбираем payload → отказ на смяната (exit 2); таймаут → харнесът сам блокира смяната.

import { readFileSync } from "node:fs";
import { isMain } from "../../tools/lib/is-main.mjs";

export const HAIKU = /haiku/i;

/** Причина за отказ или "" . */
export function modelVerdict(p = {}) {
  const to = String(p.to_model || ""), asked = String(p.requested_model || "");
  if (HAIKU.test(to) || HAIKU.test(asked)) {
    return `Правило на собственика: никога Haiku (поискан „${asked || to}“). Ползвай Opus или Sonnet; за фоновите задачи харнесът е пренасочен към Sonnet 5.5.`;
  }
  return "";
}

if (isMain(import.meta.url)) {
  let p;
  try { p = JSON.parse(readFileSync(0, "utf8")); } catch { process.stderr.write("guard-model: неразбираем payload — смяната е отказана.\n"); process.exit(2); }
  const why = modelVerdict(p);
  if (why) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreModelSwitch", permissionDecision: "deny", permissionDecisionReason: why } }) + "\n");
  process.exit(0);
}
