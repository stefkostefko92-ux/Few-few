import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUnp, isValidUnp } from "../unp";

test("УНП формат: 8 знака ФУ - 4 знака оператор - 7 цифри пореден (Прил. 29 т. 9)", () => {
  assert.equal(buildUnp("DT518315", 1, 123), "DT518315-0001-0000123");
  assert.equal(buildUnp("DM000001", 42, 1), "DM000001-0042-0000001");
});

test("къс сериен номер се допълва, дълъг се реже", () => {
  assert.equal(buildUnp("AB12", 1, 1), "0000AB12-0001-0000001");
  assert.equal(buildUnp("ABCDEFGH123", 1, 1), "ABCDEFGH-0001-0000001");
});

test("пореден номер над 7 цифри запазва последните 7", () => {
  assert.equal(buildUnp("DM000001", 1, 12345678), "DM000001-0001-2345678");
});

test("валидация", () => {
  assert.ok(isValidUnp("DT518315-0001-0000123"));
  assert.ok(!isValidUnp("DT518315-1-123"));
  assert.ok(!isValidUnp("нещо друго"));
});
