import test from "node:test";
import assert from "node:assert/strict";
import { prevNext, relatedGuides, relatedScore, titleWords } from "@/lib/related";

type G = {
  id: string;
  slug: string;
  question: string;
  category: string;
  tags: string;
  order: number;
};

const g = (id: string, question: string, category: string, tags = "", order = 0): G => ({
  id,
  slug: `s-${id}`,
  question,
  category,
  tags,
  order,
});

const DOCS = "Документи и плащания";
const SAFE = "Безопасност и измами";
const FUN = "Забавление";

const pool: G[] = [
  g("1", "Как да проверя пенсията си онлайн (НОИ)?", DOCS, "нои, пенсия", 10),
  g("2", "Какво е ПИК на НОИ и откъде да го взема?", DOCS, "нои, пик", 20),
  g("3", "Как да проверя глоби от КАТ онлайн?", DOCS, "кат, глоби", 30),
  g("4", "Как да сменя личната си карта?", DOCS, "лична карта, мвр", 40),
  g("5", "Обаждат ми се „от НОИ“ за пенсията — измама ли е?", SAFE, "нои, измама, пенсия", 10),
  g("6", "Как да гледам телевизия онлайн?", FUN, "телевизия", 10),
  g("7", "Как да платя данък онлайн?", DOCS, "нап, данъци", 50),
  g("8", "Как да проверя здравното си досие?", DOCS, "здраве", 60),
];

test("titleWords маха служебните думи и съкращава до общо „стъбло“", () => {
  const w = titleWords("Как да проверя пенсията си онлайн?");
  assert.ok(!w.has("как") && !w.has("онлайн"));
  assert.ok(w.has("пенси"));
  // „пенсия“, „пенсията“, „пенсии“ се срещат
  assert.ok(titleWords("Кога идва пенсия").has("пенси"));
});

test("relatedScore: тема + общи етикети + общи думи", () => {
  const a = pool[0];
  assert.ok(relatedScore(a, pool[1]) > relatedScore(a, pool[3]), "общ етикет „нои“ тежи");
  assert.equal(relatedScore(a, pool[5]), 0, "друга тема и нищо общо");
});

test("relatedGuides е детерминистичен, без себе си и с 4–6 връзки", () => {
  const cur = pool[0];
  const r1 = relatedGuides(cur, pool);
  const r2 = relatedGuides(cur, [...pool].reverse());
  assert.deepEqual(
    r1.map((x) => x.id),
    r2.map((x) => x.id),
    "редът на входа не променя изхода",
  );
  assert.ok(!r1.some((x) => x.id === cur.id));
  assert.ok(r1.length >= 4 && r1.length <= 6, `дължина ${r1.length}`);
  // Най-силните връзки са отпред: ПИК на НОИ (тема+етикет) и измамата „от НОИ“ (етикети+думи).
  assert.deepEqual(new Set(r1.slice(0, 2).map((x) => x.id)), new Set(["2", "5"]));
  // Несвързаното от друга тема не влиза.
  assert.ok(!r1.some((x) => x.id === "6"));
});

test("relatedGuides допълва от своята тема по близост на подредбата", () => {
  const lonely = g("9", "Как да подредя нещо специално?", DOCS, "", 35);
  const r = relatedGuides(lonely, pool);
  assert.equal(r.length, 4);
  assert.ok(r.every((x) => x.category === DOCS));
  // Най-близките по order (30 и 40) са първи.
  assert.deepEqual(r.slice(0, 2).map((x) => x.order).sort(), [30, 40]);
});

test("relatedGuides връща по-малко, когато няма достатъчно подходящи", () => {
  const solo = [g("a", "Как да рисувам?", FUN, "", 1), g("b", "Как да готвя боб?", "Кухня", "", 1)];
  assert.deepEqual(relatedGuides(solo[0], solo), []);
});

test("prevNext дава съседите в темата по order", () => {
  const docs = pool.filter((x) => x.category === DOCS);
  const { prev, next } = prevNext(pool[2], docs);
  assert.equal(prev?.id, "2");
  assert.equal(next?.id, "4");
  const first = prevNext(pool[0], docs);
  assert.equal(first.prev, null);
  assert.equal(first.next?.id, "2");
  assert.deepEqual(prevNext(g("x", "?", DOCS), docs), { prev: null, next: null });
});
