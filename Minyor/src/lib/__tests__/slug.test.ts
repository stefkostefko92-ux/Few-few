// Тестове за slugify — транслитерация на кирилица в URL-приятелски slug.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../slug";

describe("slugify", () => {
  test("транслитерира българска кирилица", () => {
    assert.equal(slugify("Миньор Бобов дол"), "minyor-bobov-dol");
  });

  test("многознакови съответствия: ж, ц, ч, ш, щ, ю, я", () => {
    assert.equal(slugify("жцчшщюя"), "zhtschshshtyuya");
  });

  test("ъ → a, ь → y", () => {
    assert.equal(slugify("път"), "pat");
    assert.equal(slugify("ьо"), "yo");
  });

  test("главни букви се свеждат до малки", () => {
    assert.equal(slugify("ПОБЕДА Над ЛОКОМОТИВ"), "pobeda-nad-lokomotiv");
  });

  test("латиница и цифри се запазват", () => {
    assert.equal(slugify("Round 12 Final"), "round-12-final");
  });

  test("интервали, _ . / - стават тире; повторенията се слепват", () => {
    assert.equal(slugify("а_б.в/г  д--е"), "a-b-v-g-d-e");
  });

  test("тирета в краищата се махат", () => {
    assert.equal(slugify("  -Мач-  "), "mach");
  });

  test("непознати знаци (пунктуация, емоджи, друга писменост) се пропускат", () => {
    assert.equal(slugify("Гол!!! ⚽ 90+3'"), "gol-903");
    assert.equal(slugify("日本"), "elem");
  });

  test("празен вход и само непознати знаци → „elem“", () => {
    assert.equal(slugify(""), "elem");
    assert.equal(slugify("   "), "elem");
    assert.equal(slugify("!!!"), "elem");
  });

  test("null/undefined не хвърлят", () => {
    assert.equal(slugify(null as unknown as string), "elem");
    assert.equal(slugify(undefined as unknown as string), "elem");
  });

  test("дължината е най-много 80 знака", () => {
    assert.equal(slugify("а".repeat(200)).length, 80);
  });

  test("резултатът съдържа само [a-z0-9-]", () => {
    assert.match(slugify("Ёж, ЩЪРКЕЛ & Ко: №7 (финал)"), /^[a-z0-9-]+$/);
  });

  // ПОПРАВЕН 21.11.2026 (беше todo): .slice(0, 80) идваше СЛЕД махането на крайното тире, затова
  // отрязването точно след тире оставя slug, завършващ на „-“.
  test(
    "отрязване на 80 знака не оставя тире накрая",
    () => {
      const s = slugify("a".repeat(79) + " b");
      assert.ok(!s.endsWith("-"), s);
    },
  );
});
