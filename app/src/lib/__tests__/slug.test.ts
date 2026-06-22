import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, uniqueSlug } from "../slug";

test("транслитерира кирилица към латиница", () => {
  assert.equal(slugify("Дежурна аптека"), "dezhurna-apteka");
  assert.equal(slugify("Услуги и телефони"), "uslugi-i-telefoni");
});

test("чисти разделители и регистър", () => {
  assert.equal(slugify("  Здраве / Аптеки  "), "zdrave-apteki");
  assert.equal(slugify("ВиК Дупница"), "vik-dupnitsa");
});

test("връща резервен slug за празен вход", () => {
  assert.equal(slugify(""), "elem");
  assert.equal(slugify("!!!"), "elem");
});

test("uniqueSlug добавя наставка при сблъсък", () => {
  const taken = new Set<string>(["apteka"]);
  assert.equal(uniqueSlug("Аптека", taken), "apteka-2");
  taken.add("apteka-2");
  assert.equal(uniqueSlug("Аптека", taken), "apteka-3");
});
