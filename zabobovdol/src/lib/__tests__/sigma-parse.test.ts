import test from "node:test";
import assert from "node:assert/strict";
import { parseSigmaHtml, clean, SIGMA_AUTHORITY_ID } from "@/lib/sigma-parse";

// Малък фрагмент, който възпроизвежда структурата на страницата в СИГМА.
const FIXTURE = `
<dl class="facts">
  <div class="row"><dt>Обща стойност</dt><dd>23,6 млн. €</dd></div>
  <div class="row"><dt>Брой договори</dt><dd>108</dd></div>
  <div class="row"><dt>Период</dt><dd>януари 2021 — юни 2026</dd></div>
</dl>
<table>
  <tr><th>#</th><th>Изпълнител</th><th>Спечелено</th><th>Договори</th><th>Дял</th></tr>
  <tr><td>1</td><td>БУЛПЛАН ИНВЕСТ ООД</td><td class="money">3,7 млн. €</td><td>7</td><td>15,8%</td></tr>
  <tr><td>2</td><td>МАРБЪЛ СТРОЙ ЕООД</td><td class="money">1,8 млн. €</td><td>3</td><td>7,6%</td></tr>
</table>`;

test("clean маха таговете и нормализира интервалите", () => {
  assert.equal(clean("<b>  Бобов   дол </b>"), "Бобов дол");
  assert.equal(clean("A &amp; B"), "A & B");
});

test("parseSigmaHtml извлича ключовите показатели", () => {
  const r = parseSigmaHtml(FIXTURE);
  assert.equal(r.totalValue, "23,6 млн. €");
  assert.equal(r.contractsCount, 108);
  assert.equal(r.period, "януари 2021 — юни 2026");
  assert.equal(r.authorityId, SIGMA_AUTHORITY_ID);
});

test("parseSigmaHtml извлича топ изпълнителите подредени", () => {
  const r = parseSigmaHtml(FIXTURE);
  assert.equal(r.topSuppliers.length, 2);
  assert.deepEqual(r.topSuppliers[0], {
    rank: 1,
    name: "БУЛПЛАН ИНВЕСТ ООД",
    amount: "3,7 млн. €",
    contracts: "7",
    share: "15,8%",
  });
});

test("parseSigmaHtml пропуска редовете без парична стойност (заглавния ред)", () => {
  const r = parseSigmaHtml(FIXTURE);
  // заглавният <th> ред не се брои за изпълнител
  assert.ok(r.topSuppliers.every((s) => s.amount.includes("€")));
});

test("parseSigmaHtml връща празни данни при непознат HTML (не хвърля)", () => {
  const r = parseSigmaHtml("<p>нищо полезно</p>");
  assert.equal(r.contractsCount, 0);
  assert.equal(r.totalValue, "");
  assert.deepEqual(r.topSuppliers, []);
});
