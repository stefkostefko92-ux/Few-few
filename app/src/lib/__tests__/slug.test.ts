import test from "node:test";
import assert from "node:assert/strict";
import { slugify, uniqueSlug } from "@/lib/slug";

test("slugify транслитерира кирилица към латиница", () => {
  assert.equal(slugify("Дупница"), "dupnitsa");
  assert.equal(slugify("Как да платя данък"), "kak-da-platya-danak");
});

test("slugify нормализира разделители и регистър", () => {
  assert.equal(slugify("  Hello  World  "), "hello-world");
  assert.equal(slugify("a/b_c.d"), "a-b-c-d");
  assert.equal(slugify("--x--"), "x");
});

test("slugify връща резервен slug при празно/несмислено", () => {
  assert.equal(slugify(""), "elem");
  assert.equal(slugify("@#$%"), "elem");
});

test("slugify ограничава дължината до 80 знака", () => {
  assert.ok(slugify("a".repeat(200)).length <= 80);
});

test("uniqueSlug добавя суфикс при сблъсък", () => {
  const taken = new Set(["dupnitsa", "dupnitsa-2"]);
  assert.equal(uniqueSlug("Дупница", taken), "dupnitsa-3");
  assert.equal(uniqueSlug("Ново", new Set()), "novo");
});
