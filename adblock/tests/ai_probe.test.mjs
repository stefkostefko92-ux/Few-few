// Пробата за AI на устройството (tools/ai_probe_*.js): разборът на отговора, ограничението, примерите.
// Самият модел (Gemini Nano) не тича тук — пробата се пуска на машината на собственика.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const ctx = {};
ctx.globalThis = ctx;
runInNewContext(readFileSync(join(ROOT, "tools", "ai_probe_lib.js"), "utf8"), ctx);
const { LANGS, SYSTEM, SCHEMA, parseAnswer, snippet, SAMPLES } = ctx.SA_AI;

ok("languages: only the five the Prompt API accepts", JSON.stringify(LANGS) === JSON.stringify(["en", "ja", "es", "de", "fr"]));
ok("answer schema: an object with a required boolean `ad`, nothing else",
  SCHEMA.type === "object" && SCHEMA.properties.ad.type === "boolean" && SCHEMA.required.includes("ad") && SCHEMA.additionalProperties === false);
ok("parse: plain JSON", parseAnswer('{"ad": true}') === true && parseAnswer('{"ad":false}') === false);
ok("parse: JSON inside extra text", parseAnswer('Sure: {"ad": true}.') === true);
ok("parse: anything unclear → null (never a guess)", parseAnswer("maybe") === null && parseAnswer("") === null && parseAnswer(undefined) === null && parseAnswer('{"ad":"yes"}') === null);
ok("snippet: whitespace collapsed, capped at 400 chars", snippet("a \n\n b") === "a b" && snippet("x".repeat(900)).length === 400);
ok("the instruction keeps organic talk about sponsors out", /merely talk about sponsors/.test(SYSTEM));
const langs = new Set(SAMPLES.map((s) => s.lang));
ok(`samples: every language, ads and non-ads in each (${SAMPLES.length})`,
  LANGS.every((l) => langs.has(l)) && LANGS.every((l) => SAMPLES.some((s) => s.lang === l && s.ad) && SAMPLES.some((s) => s.lang === l && !s.ad)));

// Пробата не е в пакета за магазина (tools/ се изключва) — package.sh го пази.
ok("the probe stays out of the store package (tools/* excluded)", /-x '\.git\/\*'.*'tools\/\*'/s.test(readFileSync(join(ROOT, "tools", "package.sh"), "utf8")));

done();
