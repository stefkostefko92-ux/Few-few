// contact-schema.test.ts — общите полета за контакт на публичните формуляри (обяви, пътуване, зов за помощ).
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { contactFields } from "@/lib/contact-schema";
import { MSG } from "@/lib/form-state";

const schema = (emailMax: number) => z.object(contactFields({ emailMax }));
const errs = (r: { success: boolean; error?: z.ZodError }) => (r.success ? [] : r.error!.issues.map((i) => `${i.path.join(".")}:${i.message}`));

test("празните полета стават празни низове", () => {
  const r = schema(160).safeParse({});
  assert.ok(r.success);
  assert.deepEqual(r.data, { contactName: "", contactPhone: "", contactEmail: "" });
});

test("телефонът се допълва и проверява; непълният номер дава съобщението за телефон", () => {
  const ok = schema(160).safeParse({ contactPhone: " 0888 123 456 " });
  assert.ok(ok.success, JSON.stringify(errs(ok)));
  const bad = schema(160).safeParse({ contactPhone: "0888" });
  assert.deepEqual(errs(bad), [`contactPhone:${MSG.phone}`]);
});

test("имейлът: формат и таван по формуляр (120 за обявите, 160 за останалите)", () => {
  assert.deepEqual(errs(schema(160).safeParse({ contactEmail: "ne-e-imeyl" })), [`contactEmail:${MSG.email}`]);
  const long = `${"a".repeat(130)}@primer.bg`;
  assert.equal(schema(160).safeParse({ contactEmail: long }).success, true);
  assert.equal(schema(120).safeParse({ contactEmail: long }).success, false);
});

test("името се реже до 80 и се подрязва", () => {
  assert.equal(schema(160).safeParse({ contactName: "  Иван  " }).data?.contactName, "Иван");
  assert.equal(schema(160).safeParse({ contactName: "я".repeat(81) }).success, false);
});
