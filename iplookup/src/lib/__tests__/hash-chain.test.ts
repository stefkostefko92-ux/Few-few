import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalize,
  GENESIS,
  hashRecord,
  link,
  sha256,
  tipOf,
  verifyChain,
  type ChainedRecord,
} from "../hash-chain";

test("канонизацията не зависи от реда на ключовете", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.equal(canonicalize({ a: 2, b: 1 }), '{"a":2,"b":1}');
});

test("канонизацията пази null, изхвърля undefined", () => {
  assert.equal(canonicalize({ a: null, b: undefined, c: 1 }), '{"a":null,"c":1}');
  // В масив липсата не може да се изхвърли, без да мръднат индексите.
  assert.equal(canonicalize([1, undefined, 3]), "[1,null,3]");
});

test("канонизацията е рекурсивна", () => {
  assert.equal(
    canonicalize({ z: { y: [1, { b: 2, a: 1 }] }, a: "х" }),
    '{"a":"х","z":{"y":[1,{"a":1,"b":2}]}}',
  );
});

test("нечислови и невъзможни стойности се отхвърлят, вместо да минат тихо", () => {
  assert.throws(() => canonicalize({ a: NaN }));
  assert.throws(() => canonicalize({ a: Infinity }));
  assert.throws(() => canonicalize({ a: () => 1 }));
});

test("sha256 дава познатата стойност", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("хешът НЕ зависи от полетата на самата верига", () => {
  const payload = { action: "справка", ip: "8.8.8.8" };
  const a = hashRecord(payload, GENESIS);
  const b = hashRecord({ ...payload, prev: "друго", hash: "друго" }, GENESIS);
  assert.equal(a, b, "иначе хешът би зависел от себе си");
});

test("хешът зависи от предишното звено", () => {
  const payload = { action: "справка" };
  assert.notEqual(hashRecord(payload, GENESIS), hashRecord(payload, sha256("нещо")));
});

/** Строи валидна верига от дадените полезни товари. */
function chain(payloads: Record<string, unknown>[]) {
  const out: (Record<string, unknown> & ChainedRecord)[] = [];
  let prev = GENESIS;
  for (const payload of payloads) {
    const record = link(payload, prev);
    out.push(record);
    prev = record.hash;
  }
  return out;
}

test("валидна верига няма проблеми", () => {
  const records = chain([{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.deepEqual(verifyChain(records), []);
  assert.equal(tipOf(records), records[2]?.hash);
});

test("празната верига е валидна и започва от GENESIS", () => {
  assert.deepEqual(verifyChain([]), []);
  assert.equal(tipOf([]), GENESIS);
});

test("тиха промяна на един ред се хваща", () => {
  const records = chain([{ n: 1 }, { n: 2 }, { n: 3 }]);
  // Някой е редактирал средния запис, но е оставил хеша непокътнат.
  (records[1] as Record<string, unknown>).n = 999;

  const problems = verifyChain(records);
  assert.ok(problems.some((p) => p.index === 1 && p.kind === "променено-съдържание"));
  // И следващият ред се къса, защото сочи към стария хеш — точно това прави
  // веригата: една поправка не остава локална.
  assert.ok(problems.some((p) => p.index === 2 && p.kind === "прекъсната-връзка"));
});

test("изтрит ред в средата се хваща", () => {
  const records = chain([{ n: 1 }, { n: 2 }, { n: 3 }]);
  records.splice(1, 1);
  const problems = verifyChain(records);
  assert.ok(problems.some((p) => p.kind === "прекъсната-връзка"));
});

test("вмъкнат ред се хваща", () => {
  const records = chain([{ n: 1 }, { n: 2 }]);
  records.splice(1, 0, link({ n: 99 } as Record<string, unknown>, GENESIS));
  assert.ok(verifyChain(records).length > 0);
});

test("проверката връща ВСИЧКИ проблеми, не само първия", () => {
  const records = chain([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]);
  (records[1] as Record<string, unknown>).n = 111;
  (records[3] as Record<string, unknown>).n = 333;
  const problems = verifyChain(records);
  // При инцидент е важно докъде стига повредата, а не само откъде тръгва.
  assert.ok(problems.length >= 3, `очаквах няколко проблема, получих ${problems.length}`);
});

test("пренаредени редове се хващат", () => {
  const records = chain([{ n: 1 }, { n: 2 }, { n: 3 }]);
  const swapped = [records[0]!, records[2]!, records[1]!];
  assert.ok(verifyChain(swapped).length > 0);
});
