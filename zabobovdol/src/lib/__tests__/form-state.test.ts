import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_RE,
  failState,
  fieldErrorsOf,
  honeypotFilled,
  nextAttempt,
  readValues,
} from "../form-state";

test("readValues: само изброените текстови полета, липсващото е празно", () => {
  const fd = new FormData();
  fd.set("title", "Продавам колело");
  fd.set("website", "spam");
  fd.set("photo", new Blob(["x"]), "a.jpg");
  const v = readValues(fd, ["title", "description", "photo"]);
  assert.deepEqual(v, { title: "Продавам колело", description: "", photo: "" });
  assert.equal("website" in v, false);
});

test("readValues: много дълъг текст се реже при връщането", () => {
  const fd = new FormData();
  fd.set("message", "а".repeat(20_000));
  assert.equal(readValues(fd, ["message"]).message.length, 10_000);
});

test("honeypotFilled", () => {
  const fd = new FormData();
  assert.equal(honeypotFilled(fd), false);
  fd.set("website", "");
  assert.equal(honeypotFilled(fd), false);
  fd.set("website", "http://spam");
  assert.equal(honeypotFilled(fd), true);
});

test("nextAttempt брои от 1", () => {
  assert.equal(nextAttempt(undefined), 1);
  assert.equal(nextAttempt({}), 1);
  assert.equal(nextAttempt({ attempt: 2 }), 3);
});

test("fieldErrorsOf: първата грешка за всяко поле, без поле → „_“", () => {
  const e = fieldErrorsOf([
    { path: ["title"], message: "Кратко заглавие" },
    { path: ["title"], message: "Втора грешка" },
    { path: ["email"], message: "Имейл" },
    { path: [], message: "Общо" },
  ]);
  assert.deepEqual(e, { title: "Кратко заглавие", email: "Имейл", _: "Общо" });
});

test("failState: стойностите и опитът винаги, празните грешки — не", () => {
  const s = failState({ a: "1" }, 2, undefined, {});
  assert.deepEqual(s, { ok: false, values: { a: "1" }, attempt: 2 });
  const t = failState({}, 1, "Лимит", { a: "x" });
  assert.equal(t.error, "Лимит");
  assert.deepEqual(t.fieldErrors, { a: "x" });
});

test("EMAIL_RE", () => {
  assert.ok(EMAIL_RE.test("ime@primer.bg"));
  assert.ok(!EMAIL_RE.test("ime@primer"));
  assert.ok(!EMAIL_RE.test("ime primer@x.bg"));
});

test("eurText: цели без десетични, иначе с два знака; неразделящ интервал", async () => {
  const { eurText } = await import("../eur-text");
  assert.equal(eurText(20), "20 €");
  assert.equal(eurText(19.5), "19,50 €");
});
