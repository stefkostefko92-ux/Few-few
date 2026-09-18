// tools/agents/invariant-check.test.mjs — регресия за детерминистичния слой на behavioral evals.
//
// Пази, че критичните method/safety котви на домейн-собствениците НЕ изчезват тихо от материала
// (проксито, което лови поведенческа регресия ПРЕДИ merge, без LLM).

import { test } from "node:test";
import assert from "node:assert/strict";
import { missingInvariants, loadInvariants, agentMaterial } from "./invariant-check.mjs";

test("missingInvariants: липсваща котва се хваща; наличната минава", () => {
  // razbivacha реално носи „оторизац"; „ZZ_НЯМА_ГО" го няма.
  const inv = { razbivacha: [
    { any: ["оторизац"], label: "оторизация" },
    { any: ["ZZ_НЯМА_ГО_QQ"], label: "измислена котва" },
  ] };
  const m = missingInvariants(inv);
  assert.equal(m.length, 1);
  assert.equal(m[0].label, "измислена котва");
});

test("missingInvariants: синоними — ≥1 съвпадение стига", () => {
  const inv = { goladjiyata: [{ any: ["НЯМА_ТАКОВА", "Kelly"], label: "Kelly или нищо" }] };
  assert.equal(missingInvariants(inv).length, 0, "второто съвпадение (Kelly) прави инварианта наличен");
});

test("missingInvariants: несъществуващ агент → нарушение", () => {
  const inv = { "ghost-agent-xyz": [{ any: ["каквото и да е"], label: "x" }] };
  const m = missingInvariants(inv);
  assert.equal(m.length, 1);
  assert.match(m[0].missing, /няма материал/);
});

test("agentMaterial обединява дефиниция + памет", () => {
  const mat = agentMaterial("kasadjiyata");
  assert.ok(mat.includes("1.95583"), "фиксираният курс е в материала");
});

test("реалният invariants.json: всички котви присъстват (регресионна база)", () => {
  const inv = loadInvariants();
  assert.ok(Object.keys(inv).length >= 6);
  assert.deepEqual(missingInvariants(inv), [], "нула липсващи — базата е зелена");
});
