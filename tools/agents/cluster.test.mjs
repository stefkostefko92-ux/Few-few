// tools/agents/cluster.test.mjs — индексираната клъстеризация трябва да дава ТОЧНО същия резултат
// като наивния двоен цикъл, само че без O(n²).
//
// Защо съществува: `shared-candidates.mjs` тичаше 250 секунди в CI при всеки agents-layer PR
// (3559 поуки × ~3559 клъстера × токенизация на всяко сравнение) и извеждаше „няма кандидати".
// Оптимизацията е безсмислена, ако промени и един клъстер — затова тестът сравнява дума по дума
// с референтната имплементация върху случайни, но ДЕТЕРМИНИСТИЧНИ данни.

import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterByJaccard, jaccard, jaccardSets, toks, MERGE_THRESHOLD } from "./oversee-lib.mjs";

// Референтна (наивна) имплементация — точно старият алгоритъм от shared-candidates.mjs.
function naiveCluster(texts, t = MERGE_THRESHOLD) {
  const clusters = [];
  for (let i = 0; i < texts.length; i++) {
    let hit = -1;
    for (let c = 0; c < clusters.length; c++) if (jaccard(clusters[c].rep, texts[i]) >= t) { hit = c; break; }
    if (hit >= 0) clusters[hit].members.push(i);
    else clusters.push({ rep: texts[i], members: [i] });
  }
  return clusters.map((c) => ({ rep: c.rep, members: c.members }));
}

// Детерминистичен генератор (без Math.random — тестът трябва да е възпроизводим).
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); }

function corpus(n, seed) {
  const rnd = lcg(seed);
  const vocab = Array.from({ length: 60 }, (_, i) => `дума${i}блок`);
  const out = [];
  for (let i = 0; i < n; i++) {
    const len = 6 + Math.floor(rnd() * 14);
    const words = [];
    for (let j = 0; j < len; j++) words.push(vocab[Math.floor(rnd() * vocab.length)]);
    out.push("- " + words.join(" "));
    // Всеки трети път вкарай почти-дубъл на предишна поука (иначе клъстери няма да се образуват).
    if (i > 2 && rnd() < 0.33) out.push(out[Math.floor(rnd() * out.length)].replace(/дума0блок/g, "дума1блок"));
  }
  return out;
}

test("jaccardSets дава същото като jaccard над същите низове", () => {
  const a = "- Прескочи проверката на подписа при webhook", b = "- Прескочи проверката на подписа при webhook-а";
  assert.equal(jaccardSets(toks(a), toks(b)), jaccard(a, b));
  assert.equal(jaccardSets(new Set(), toks(b)), 0, "празно множество → 0, без деление на нула");
});

test("индексираната клъстеризация е ИДЕНТИЧНА с наивната (5 различни корпуса)", () => {
  for (const seed of [1, 7, 42, 1337, 90210]) {
    const texts = corpus(120, seed);
    const fast = clusterByJaccard(texts);
    const slow = naiveCluster(texts);
    assert.deepEqual(fast, slow, `корпус seed=${seed} се разминава`);
  }
});

test("точни дубли влизат в ЕДИН клъстер, а не всеки за себе си", () => {
  const l = "- Никога не вярвай на сумата от клиента; остойностявай на сървъра";
  const c = clusterByJaccard([l, l, l]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].members, [0, 1, 2]);
});

test("несвързани поуки НЕ се сливат", () => {
  const c = clusterByJaccard([
    "- Фискалният бон носи УНП на продажбата, не на документа",
    "- Core Web Vitals: LCP под 2.5 секунди на мобилно устройство",
    "- Ключът за доставчика живее само на сървъра, режим 600",
  ]);
  assert.equal(c.length, 3);
});

test("първият съвпаднал клъстер печели (ред на създаване, не ред на индекса)", () => {
  // Нагласено така, че B да съвпада И с A, И с C, но A и C да НЕ съвпадат помежду си:
  //   J(A,C) = 8/10 = 0.80 < 0.82 → два отделни клъстера;
  //   J(A,B) = J(C,B) = 9/10 = 0.90 ≥ 0.82 → B пасва и на двата, но трябва да иде при по-ранния (A).
  const base = "адин двая трия четири петка шеста седма осма";
  const A = `- ${base} деветка`;
  const C = `- ${base} десетка`;
  const B = `- ${base} деветка десетка`;
  const c = clusterByJaccard([A, C, B]);
  assert.equal(c.length, 2, "A и C не бива да се слеят (J=0.80)");
  assert.deepEqual(c[0].members, [0, 2], "B трябва да е при A, не при C");
  assert.deepEqual(naiveCluster([A, C, B])[0].members, [0, 2], "наивното прави същото");
});

test("празни/безтокенни поуки не чупят индекса", () => {
  const c = clusterByJaccard(["- ", "", "- ок да", "- истинска дълга поука с достатъчно думи вътре"]);
  assert.equal(c.length, 4, "без общи токени → всяка е свой клъстер");
});

test("бърза е: 4000 поуки под 3 секунди (наивното е минути)", () => {
  const texts = corpus(4000, 2026);
  const t0 = process.hrtime.bigint();
  const c = clusterByJaccard(texts);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(c.length > 0);
  assert.ok(ms < 3000, `клъстеризацията отне ${Math.round(ms)}ms — регресия в сложността`);
});
