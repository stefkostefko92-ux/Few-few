// flow-cost.test.mjs — цената на КОЛАБОРАЦИЯТА (верига), не на един старт.
//
// Двата дефекта, които този файл пази да не се върнат — и двата са „тих отпад": инструментът
// покриваше част от документа и мълчеше за останалото, а изходът изглеждаше пълен.
//   1) `_orchestration.md` ползва ДВА формата (изричен „Pipeline:" и инлайн верига след „Lead:").
//      Първата версия четеше само първия → 15 от 24 потока.
//   2) Сегментите се режеха по „/", за да се хванат алтернативи → потоците, чиито ИМЕНА съдържат
//      наклонена черта („Кампания/видео", „AI/LLM интеграция"), изчезваха → 22 от 24.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePipeline, flowBlocks, nameToId, computeFlowCosts, TAX_WARN } from "./flow-cost.mjs";
import { canonicalFlows } from "./trajectory-audit.mjs";
import { computeBudget } from "./token-budget.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MD = readFileSync(join(ROOT, ".claude", "agents", "_orchestration.md"), "utf8");
const AJ = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
const NAMES = nameToId(AJ);

test("nameToId покрива целия флот (потоците са писани с имена, не с id-та)", () => {
  assert.equal(NAMES.size, AJ.agents.length);
  assert.equal(NAMES.get("Кодаджията"), "kodadjiyata");
});

test("изричният формат „Pipeline: A → B → C“ се чете", () => {
  const b = "- **Тест.** Lead: **Продавача**.\n  Pipeline: Продавача (stripe) → Кодаджията (ревю) → Изпитателят (e2e). Ескалация: пари → човек.";
  assert.deepEqual(parsePipeline(b, NAMES), ["prodavacha", "kodadjiyata", "izpitatelya"]);
});

test("инлайн формат без „Pipeline:“ СЪЩО се чете (9 потока бяха невидими)", () => {
  const b = "- **Трейдинг бот.** Lead: **Трейдъра** (`trader-lint`) →\n  Кодаджията (ревю) → VPS-аджията (ключове). Ескалация: реални поръчки → човек.";
  assert.deepEqual(parsePipeline(b, NAMES), ["treydara", "kodadjiyata", "vps-adjiyata"]);
});

test("името на потока може да съдържа „/“ без да го изяде (Кампания/видео, AI/LLM)", () => {
  const a = "- **Кампания/видео.** Lead: **Социалджията**. Clip/repurpose → C2PA → draft.";
  assert.deepEqual(parsePipeline(a, NAMES), ["socialdjiyata"]);
  const b = "- **AI/LLM интеграция.** Lead: **AI-джията**. Провери докове → ключ на сървъра.";
  assert.deepEqual(parsePipeline(b, NAMES), ["ai-djiyata"]);
});

test("„Ескалация:“ НЕ влиза във веригата (тя е изключението, не главният път)", () => {
  const b = "- **Х.** Lead: **Хромаджията** (MV3). Ескалация: стор-съответствие → Тайният агент.";
  assert.deepEqual(parsePipeline(b, NAMES), ["hromadjiyata"], "Тайният агент е ескалация, не стъпка");
});

test("алтернативи в един сегмент → взима се ПЪРВАТА по ред", () => {
  const b = "- **Х.** Lead: **Разбивача**.\n  Pipeline: Разбивача → Кодаджията / Касаджията (парично).";
  assert.deepEqual(parsePipeline(b, NAMES), ["razbivacha", "kodadjiyata"]);
});

test("последователно повторение на агент не е нова стъпка", () => {
  const b = "- **Х.** Lead: **SEO**.\n  Pipeline: SEO → SEO → Кодаджията.";
  assert.deepEqual(parsePipeline(b, NAMES), ["seo", "kodadjiyata"]);
});

test("ВСЕКИ каноничен поток има разчетена верига (нула тихи отпадания)", () => {
  const declared = canonicalFlows(MD).map((f) => f.name);
  const blocks = flowBlocks(MD);
  assert.equal(blocks.length, declared.length, "блок за всеки деклариран поток");
  const без = [];
  for (const name of declared) {
    const b = blocks.find((x) => x.name === name);
    if (!b || parsePipeline(b.block, NAMES).length === 0) без.push(name);
  }
  assert.deepEqual(без, [], "поток без разчетена верига = тих отпад в измерването");
});

test("цената на поток расте с дължината на веригата и данъкът е дял от нея", () => {
  const budget = { STATIC_PREFIX_TOKENS: 1000, rows: [
    { id: "prodavacha", perStartCold: 3000 }, { id: "kodadjiyata", perStartCold: 3000 },
  ] };
  const md = "## Чести потоци\n\n- **Само двама.** Lead: **Продавача**.\n  Pipeline: Продавача → Кодаджията.\n";
  const { flows } = computeFlowCosts({ md, agentsJson: AJ, budget });
  assert.equal(flows.length, 1);
  assert.equal(flows[0].steps, 2);
  assert.equal(flows[0].total, 6000);
  assert.equal(flows[0].repeated, 2000, "префиксът се плаща веднъж на стъпка");
  assert.equal(flows[0].work, 4000);
  assert.equal(flows[0].tax, 2000 / 6000);
  assert.equal(flows[0].ifSharedPrefix, 5000, "ако префиксът се делеше: работа + един префикс");
  assert.equal(flows[0].savedIfShared, 1000);
});

test("реалните потоци дават смислени числа и данъкът е под тавана", () => {
  const { flows, totals } = computeFlowCosts({ md: MD, agentsJson: AJ, budget: computeBudget() });
  assert.ok(flows.length >= 20, `очаквам почти всички потоци, намерих ${flows.length}`);
  for (const f of flows) {
    assert.ok(f.total > 0 && f.repeated > 0);
    assert.ok(f.tax > 0 && f.tax < 1, `${f.name}: данъкът е дял, не абсолютно число`);
    // Данъкът върху колаборацията съществува само когато ИМА колаборация: при поток от една
    // стъпка споделеният префикс не спестява нищо (плаща се веднъж и без това). Икономията расте
    // с дължината на веригата — точно това прави дългите обзорни потоци скъпи.
    if (f.steps === 1) assert.equal(f.ifSharedPrefix, f.total, `${f.name}: соло поток не печели от споделяне`);
    else assert.ok(f.ifSharedPrefix < f.total, `${f.name}: верига от ${f.steps} стъпки трябва да печели`);
    assert.equal(f.savedIfShared, f.repeated - (f.repeated / f.steps), `${f.name}: спестеното е (стъпки−1)×префикс`);
  }
  assert.ok(totals.taxShare > 0.2, "повторението е реален дял, не шум");
  assert.ok(totals.taxShare < TAX_WARN + 0.2, "но не абсурдно високо");
});
