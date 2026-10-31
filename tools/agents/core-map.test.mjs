// core-map.test.mjs — ядро: пари, фискал, вход, медицински данни, схема; листа: изгледи, стилове, тестове.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCore, coreReport } from "./core-map.mjs";

test("ядро в реалните продукти", () => {
  for (const f of ["CSPos/src/lib/fiscal/erpnet.ts", "CSPos/src/app/api/sales/[id]/storno/route.ts", "linketto/src/app/api/stripe/webhook/route.ts",
    "medqr/src/routes/emergency.js", "medqr/src/webauthn.js", "treydar/src/risk.js", "zabobovdol/prisma/schema.prisma", "CSPos/src/lib/money.ts"]) assert.ok(isCore(f), f);
});

test("листа: изгледи, страници, стилове, тестове, агентският слой", () => {
  for (const f of ["medqr/src/views/emergency.ejs", "CSPos/src/app/login/page.tsx", "linketto/src/components/Checkout.css", "CSPos/src/lib/fiscal/erpnet.test.ts",
    "medqr/public/webauthn.js", ".claude/hooks/session-dod.mjs", "tools/commerce/stripe-lint.mjs", "zabobovdol/README.md"]) assert.equal(isCore(f), false, f);
});

test("ядро без тест в същия продукт се вижда; тест в същия продукт го покрива", () => {
  const a = coreReport(["CSPos/src/lib/fiscal/erpnet.ts", "CSPos/src/app/(app)/page.tsx"]);
  assert.deepEqual(a.coreWithoutTest, ["CSPos/src/lib/fiscal/erpnet.ts"]);
  const b = coreReport(["CSPos/src/lib/fiscal/erpnet.ts", "CSPos/src/lib/__tests__/fiscal.test.ts"]);
  assert.deepEqual(b.coreWithoutTest, []);
  const c = coreReport(["CSPos/src/lib/fiscal/erpnet.ts", "medqr/src/routes/emergency.test.js"]);
  assert.equal(c.coreWithoutTest.length, 1, "тест в друг продукт не покрива");
});
