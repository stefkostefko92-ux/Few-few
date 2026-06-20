import test from "node:test";
import assert from "node:assert/strict";
import { buildTermGroups } from "@/lib/search";

const flat = (q: string) => buildTermGroups(q).flat();

test("разговорна дума намира официалния термин (доктор → лекар)", () => {
  assert.ok(flat("доктор").includes("лекар"));
});

test("израз от няколко думи активира понятие (няма ток → електричество)", () => {
  const terms = flat("няма ток вкъщи");
  assert.ok(terms.includes("електричество"));
});

test("членувана форма се разпознава (боклука → смет/отпадъци)", () => {
  const terms = flat("кога вдигат боклука");
  assert.ok(terms.includes("смет") || terms.includes("отпадъци"));
});

test("израз-понятие се добавя само веднъж (без дублиране на групи)", () => {
  const groups = buildTermGroups("плащане на данък мпс");
  const carGroups = groups.filter((g) => g.includes("данък мпс"));
  assert.equal(carGroups.length, 1);
});

test("дума извън понятията запазва вариантите си за стемване", () => {
  const groups = buildTermGroups("компостиране");
  const g = groups.find((x) => x.includes("компостиране"));
  assert.ok(g);
  assert.ok(g!.length > 1, "трябва да има поне един стем-вариант");
});

test("празна заявка не връща групи", () => {
  assert.equal(buildTermGroups("   ").length, 0);
});
