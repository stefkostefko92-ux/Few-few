// build-agents-app.test.mjs — билдът на новото табло (страница „Агентите“ + галактиката като втора страница).
//
// Тече върху работното дърво: реалните 35 агента, екипи и маскоти. Пази договора с артефакта: главната
// страница е без обвивка (публикуването я слага), галактиката е цял документ (страниците в `files` нямат
// обвивка), данните не могат да затворят `<script>` и нищо не тегли чужди шрифтове.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, galaxyDocument, repoReader } from "./build-artifact.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASH = join(ROOT, "agents-dashboard");

test("страницата „Агентите“: всички агенти и екипи, вградени данни и маскоти, без обвивка", () => {
  const r = buildApp(DASH, null, repoReader(null, ROOT));
  assert.ok(r.agents >= 30, `агенти: ${r.agents}`);
  assert.ok(r.teams >= 10, `екипи: ${r.teams}`);
  assert.doesNotMatch(r.html, /<!doctype|<html|<head>|<body/i, "публикуването слага обвивката");
  assert.match(r.html, /<title>Агентите · Carbon Stealth<\/title>/);
  const data = r.html.match(/<script type="application\/json" id="app-data">([\s\S]*?)<\/script>/)[1];
  const parsed = JSON.parse(data);
  assert.equal(parsed.agents.length, r.agents);
  assert.ok(parsed.agents.every((a) => a.persona && a.persona.includes("Нямаш инструменти")), "всеки агент има личност за чата");
  const masc = JSON.parse(r.html.match(/<script type="application\/json" id="app-mascots">([\s\S]*?)<\/script>/)[1]);
  assert.ok(Object.keys(masc.portraits).length >= r.agents, "портрет за всеки агент");
  assert.doesNotMatch(r.html, /fonts\.googleapis|fonts\.gstatic|<svg\b/i, "без чужди шрифтове и без SVG");
});

test("галактиката: цял документ с връщане към агентите", () => {
  const doc = galaxyDocument("<style>x{}</style><div id=g></div>");
  assert.match(doc, /^<!doctype html>/i);
  assert.match(doc, /<meta name="viewport"/);
  assert.match(doc, /<a href="index\.html"[\s\S]*?>← Агентите<\/a>/);
  assert.match(doc, /<div id=g><\/div>/);
});
