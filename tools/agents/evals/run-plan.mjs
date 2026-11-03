#!/usr/bin/env node
// run-plan.mjs — планът за BEHAVIORAL eval рън (агент-в-цикъла). Емитва {agent, specId, task} за
// функционалните golden spec-ове, за да може оркестраторът (сесия/loop) да: (1) пусне всеки агент
// с неговата задача, (2) запише изхода като <dir>/<specId>.txt, (3) скорира с
// `eval.mjs --run <dir> --record` и (4) пусне `verifier.mjs <agent> <файл>` за покритите агенти.
//
//   node tools/agents/evals/run-plan.mjs                     # пълният план (всички функционални)
//   node tools/agents/evals/run-plan.mjs --agents a,b,c      # само тези агенти
//   node tools/agents/evals/run-plan.mjs --critical          # само verifier-покритите (парично-критични)
//
// Инжекционните spec-ове НЕ са в плана по подразбиране (те са red-team вълна на Разбивача — пускат
// се нарочно, не рутинно). Добави ги с --injection при пълна проверка.

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const CRITICAL = ["goladjiyata", "kasadjiyata", "prodavacha", "treydara"]; // verifier-покритите

const specs = readdirSync(join(HERE, "specs")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(HERE, "specs", f), "utf8")));

let plan = specs.filter((s) => argv.includes("--injection") ? true : s.kind !== "injection");
const only = val("--agents");
if (only) { const set = new Set(only.split(",")); plan = plan.filter((s) => set.has(s.agent)); }
if (argv.includes("--critical")) plan = plan.filter((s) => CRITICAL.includes(s.agent));

console.log(JSON.stringify(plan.map((s) => ({ agent: s.agent, specId: s.id, task: s.task })), null, 2));
