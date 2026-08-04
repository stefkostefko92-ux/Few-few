import assert from "node:assert/strict";
import { test } from "node:test";

import { can, capabilitiesOf, type Capability } from "../permissions";
import type { Role } from "../session";

const ALL: Capability[] = ["lookup", "probe", "freeze", "readAudit"];

test("заявителят работи оперативно, но не чете дневника", () => {
  assert.ok(can("operator", "lookup"));
  assert.ok(can("operator", "probe"));
  assert.ok(can("operator", "freeze"));
  // Дневникът показва кой какво разследва — той е за надзор, не за работа.
  assert.ok(!can("operator", "readAudit"));
});

test("одиторът САМО надзирава — не прави справки", () => {
  // Най-важното правило тук: който проверява законосъобразността на чуждите
  // справки, не бива да е и източник на такива, иначе проверява себе си.
  assert.ok(can("auditor", "readAudit"));
  assert.ok(!can("auditor", "lookup"));
  assert.ok(!can("auditor", "probe"));
  assert.ok(!can("auditor", "freeze"));
});

test("ръководителят може и двете — самоконтролът е негово задължение", () => {
  for (const capability of ALL) {
    assert.ok(can("supervisor", capability), `ръководителят трябва да може ${capability}`);
  }
});

test("никоя роля няма права извън матрицата", () => {
  for (const role of ["operator", "supervisor", "auditor"] as Role[]) {
    for (const capability of capabilitiesOf(role)) {
      assert.ok(ALL.includes(capability), `непозната възможност: ${capability}`);
    }
  }
});

test("непозната роля няма никакви права", () => {
  assert.ok(!can("админ" as Role, "lookup"));
  assert.ok(!can("админ" as Role, "readAudit"));
  assert.deepEqual(capabilitiesOf("админ" as Role), []);
});

test("непозната възможност се отказва, не се приема тихо", () => {
  assert.ok(!can("supervisor", "изтриване" as Capability));
});
