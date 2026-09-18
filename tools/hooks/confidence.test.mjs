// confidence.test.mjs — регресия за ТИХИЯ провал, който изяде 22 поуки в една вълна.
//
// `PROCEDURE.md` (red line 3) учи всеки агент на етикети „Сигурно / Вероятно / Несигурно",
// а memory-capture приемаше само английското `verified`. Резултат: поука, писана точно по
// нашата собствена процедура, мълчаливо падаше в Карантина — hook-ът връщаше успех, файлът
// се пишеше, версията просто не мърдаше. Никакъв сигнал.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfidence } from "../../.claude/hooks/memory-capture.mjs";

test("каноничните английски стойности минават непроменени", () => {
  for (const v of ["verified", "probable", "unverified"]) assert.equal(normalizeConfidence(v), v);
});

test("българските етикети от PROCEDURE.md се разпознават (иначе процедурата ни си противоречи)", () => {
  assert.equal(normalizeConfidence("сигурно"), "verified");
  assert.equal(normalizeConfidence("Сигурно"), "verified", "регистърът не бива да има значение");
  assert.equal(normalizeConfidence("вероятно"), "probable");
  assert.equal(normalizeConfidence("несигурно"), "unverified");
});

test("нестандартните стойности падат към unverified, не към verified", () => {
  // Реално подадени в тази вълна от 3d-maniac / printadjiyata.
  for (const v of ["hypothesis", "incertain", "quarantine", "uncertain"])
    assert.equal(normalizeConfidence(v), "unverified", v);
});

test("непозната стойност НИКОГА не се промотира до verified (безопасната посока)", () => {
  for (const v of ["измислено", "maybe", "42", "", null, undefined])
    assert.equal(normalizeConfidence(v), "unverified");
});

test("кавичките около стойността не чупят разпознаването", () => {
  assert.equal(normalizeConfidence('"сигурно"'), "verified");
  assert.equal(normalizeConfidence("'verified'"), "verified");
});
