// nav.test.ts — менюто: роли, одиторски профил, активен елемент, търсачка.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NAV_GROUPS, activeHref, flatNav, matchNav, visibleNav } from "../nav";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "(app)");
const hrefs = (role: "CASHIER" | "MANAGER" | "ADMIN", ro = false) =>
  flatNav(visibleNav(role, ro)).map((i) => i.href);

test("всеки елемент сочи към съществуваща страница и е уникален", () => {
  const all = flatNav(NAV_GROUPS).map((i) => i.href);
  assert.equal(new Set(all).size, all.length, "дублиран href в менюто");
  for (const h of all) {
    assert.ok(existsSync(join(APP, h.slice(1), "page.tsx")), `липсва страница за ${h}`);
  }
});

test("касиерът вижда само каса и смяна", () => {
  assert.deepEqual(hrefs("CASHIER"), ["/pos", "/check", "/shifts"]);
});

test("администраторът вижда всичко, настройките — само той", () => {
  assert.equal(hrefs("ADMIN").length, flatNav(NAV_GROUPS).length);
  assert.ok(!hrefs("MANAGER").includes("/settings"));
});

test("одиторът (readOnly) не вижда пишещите екрани, но вижда дневника и справките", () => {
  const h = hrefs("MANAGER", true);
  assert.ok(!h.includes("/pos"), "одиторът не продава");
  assert.ok(!h.includes("/shifts"), "одиторът не открива смени");
  assert.ok(h.includes("/journal") && h.includes("/reports"));
});

test("празните групи отпадат (касиерът не вижда заглавие „Контрол“)", () => {
  assert.deepEqual(
    visibleNav("CASHIER", false).map((g) => g.id),
    ["till", "money"]
  );
});

test("activeHref — най-дългият префикс, без фалшиви съвпадения", () => {
  const items = flatNav(NAV_GROUPS);
  assert.equal(activeHref("/products", items), "/products");
  assert.equal(activeHref("/products/42", items), "/products");
  assert.equal(activeHref("/posx", items), null, "„/posx“ не е „/pos“");
  assert.equal(activeHref("/login", items), null);
});

test("matchNav — без значение от главни букви, името тежи повече от ключовите думи", () => {
  const items = flatNav(NAV_GROUPS);
  assert.equal(matchNav("ПРОД", items)[0]?.href, "/pos");
  assert.equal(matchNav("нап", items)[0]?.href, "/reports");
  assert.equal(matchNav("годност", items)[0]?.href, "/inventory");
  assert.equal(matchNav("", items).length, items.length);
  assert.deepEqual(matchNav("несъществуващо", items), []);
});
