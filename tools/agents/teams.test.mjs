// tools/agents/teams.test.mjs — екипите: истинските данни минават, а всяко правило хваща своята мутация.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTeams, validate, route, cardFor, render, definedAgents, TEAMS_MD } from "./teams.mjs";
import { staticPrefixParts } from "../../.claude/hooks/memory-preload.mjs";

const clone = () => structuredClone(loadTeams());

test("истинските екипи минават всички правила", () => {
  assert.deepEqual(validate(), []);
});

test("всеки дефиниран агент е в точно един екип", () => {
  const T = loadTeams();
  const all = T.teams.flatMap((t) => t.members).sort();
  assert.deepEqual(all, definedAgents());
});

test("агент в два екипа → грешка", () => {
  const T = clone();
  T.teams[1].members.push(T.teams[2].members[0]);
  assert.ok(validate(T).some((e) => e.includes("в два екипа")));
});

test("агент без екип → грешка", () => {
  const T = clone();
  const t = T.teams.find((x) => x.members.length > 1);
  const gone = t.members.find((m) => m !== t.lead);
  t.members = t.members.filter((m) => m !== gone);
  assert.ok(validate(T).some((e) => e.includes("няма домашен екип")));
});

test("водач извън екипа, поток над 3 стъпки и без човек → грешки", () => {
  const T = clone();
  T.teams[0].lead = "seo";
  T.teams[1].workflow.steps.push(...T.teams[1].workflow.steps);
  delete T.teams[2].workflow.human;
  const errs = validate(T);
  assert.ok(errs.some((e) => e.includes("не е член")));
  assert.ok(errs.some((e) => e.includes("над 3 стъпки")));
  assert.ok(errs.some((e) => e.includes("човешка точка")));
});

test("тестова задача, която отива другаде → грешка", () => {
  const T = clone();
  T.teams[1].tests[0] = { task: "деплойни piuma на сървъра", team: T.teams[1].id, agent: T.teams[1].lead };
  assert.ok(validate(T).some((e) => e.startsWith("рутинг")));
});

test("метрика към несъществуващ скрипт → грешка", () => {
  const T = clone();
  T.teams[0].metrics[0].cmd = "node tools/agents/няма-такъв.mjs";
  assert.ok(validate(T).some((e) => e.includes("несъществуващ")));
});

test("рутинг: ключът е начало на дума, не подниз", () => {
  // „ci“ не бива да хване „decision“; „деплой“ хваща „деплойни“.
  assert.equal(route("decision tree for the docs").fallback, true);
  assert.equal(route("деплойни medqr").team, "pusk");
});

test("рутинг: нищо не хвана → водачът на флота", () => {
  const r = route("направи ми кафе");
  assert.equal(r.fallback, true);
  assert.equal(r.agent, loadTeams().fallback);
});

test("картата е рамката на промпта по шаблона; празна за непознат агент", () => {
  const c = cardFor("kasadjiyata");
  for (const s of ["ТВОЯТА КАРТА", "Парите", "Отговаряш за", "Получаваш", "Решения", "Инструменти", "Изход", "Готово е, когато", "Ескалация", "решение на човек", "При провал"]) assert.ok(c.includes(s), s);
  assert.equal(cardFor("няма-такъв"), "");
});

test("картата не влиза в статичния (кеширан) префикс", () => {
  assert.ok(!staticPrefixParts().join("\n").includes("ТВОЯТА КАРТА"));
});

test("_teams.md е свеж спрямо _teams.json", () => {
  assert.equal(readFileSync(TEAMS_MD, "utf8"), render());
});

test("инструмент в картата, който не съществува, и план не за 7 дни → грешки", () => {
  const T = clone();
  T.agents.seo.tools = ["tools/seo/няма.mjs"];
  T.agents.seo.rules = ["само едно"];
  T.launchPlan = T.launchPlan.slice(0, 5);
  const errs = validate(T);
  assert.ok(errs.some((e) => e.includes("tools/seo/няма.mjs")));
  assert.ok(errs.some((e) => e.includes("под 2 решения")));
  assert.ok(errs.some((e) => e.includes("не 7")));
});
