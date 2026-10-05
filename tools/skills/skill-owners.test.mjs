// skill-owners.test.mjs — умението и агентът-собственик казват едно и също (2026-09-23).
//
// Умение и агент с общ домейн са два входа към една работа: главната сесия чете умението, делегираната
// задача — дефиницията. Дублирането не беше проблемът; разминаването беше:
//  - `web-vitals` обявяваше за собственик SEO, а скоростта е на Скоростника, и караше измерване с
//    `cwv.mjs` „преди пускане" — PageSpeed не вижда непубликуван сайт, значи инструкцията е неизпълнима;
//  - `seed-author` искаше „check-dups чисти", а Сийдъра знае, че инструментът е текстов grep с базова
//    линия от стотици умишлени съвпадения — критерият е „нула НОВИ", иначе всеки seed е „провален".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS = join(ROOT, ".claude", "skills");
const skill = (id) => readFileSync(join(SKILLS, id, "SKILL.md"), "utf8");
const agents = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8")).agents;

/** Името на агента-собственик от реда „Собственик … = агентът X" (удебелено или не). */
export function ownerOf(text) {
  const m = String(text).match(/Собственик[^=\n]*=\s*агентът\s+(?:\*\*([^*]+)\*\*|([^\s.,;(*]+(?:\s+[А-Я][^\s.,;(*]*)?))/);
  return m ? (m[1] || m[2]).trim() : null;
}

test("всеки обявен собственик на умение е реален агент от ростера", () => {
  const names = new Set(agents.map((a) => a.name));
  const bad = [];
  for (const d of readdirSync(SKILLS)) {
    if (!existsSync(join(SKILLS, d, "SKILL.md"))) continue;
    const o = ownerOf(skill(d));
    if (o && !names.has(o)) bad.push(`${d} → „${o}“`);
  }
  assert.deepEqual(bad, [], "собственик, който не е в agents.json");
});

test("web-vitals: собственик е Скоростника и преди пускане се мери локално, не с PageSpeed", () => {
  const s = skill("web-vitals");
  assert.equal(ownerOf(s), "Скоростника");
  assert.match(s, /prelaunch-audit\.mjs/, "пътят преди пускане");
  assert.match(s, /не вижда непубликуван/i, "защо cwv.mjs не става преди пускане");
  assert.match(readFileSync(join(ROOT, ".claude", "agents", "skorostnika.md"), "utf8"), /web-vitals/, "агентът знае за умението");
});

test("seed-author: критерият за дубли е „нула НОВИ спрямо преди“, както при Сийдъра", () => {
  const s = skill("seed-author");
  assert.match(s, /нула НОВИ/);
  assert.doesNotMatch(s, /check-dups\/integrity чисти/, "старото „чисто = 0“ се връща");
  assert.match(readFileSync(join(ROOT, ".claude", "agents", "siydara.md"), "utf8"), /seed-author/, "агентът знае за умението");
});

test("ownerOf: удебелено и не, едно и две думи", () => {
  assert.equal(ownerOf("Собственик = агентът **Правният Разбирач** (само чете)"), "Правният Разбирач");
  assert.equal(ownerOf("Собственик = агентът Сийдъра."), "Сийдъра");
  assert.equal(ownerOf("Собственик на скоростта/CWV = агентът **Скоростника** (мери)"), "Скоростника");
  assert.equal(ownerOf("без собственик"), null);
});
