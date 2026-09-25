// regexGuard.test.js — validateAnswerAgainstRegex е ReDoS-безопасна.
// Заплаха: злонамерен админ слага катастрофичен validationRegex; всяко
// подаване би замразило СПОДЕЛЕНИЯ бот процес за всички наематели. Гардът
// изпълнява недоверения regex в worker с timeout — катастрофичен шаблон се
// ограничава по време, не виси главния loop.
import { describe, it, expect } from "vitest";
import { validateAnswerAgainstRegex } from "../utils/formSession.js";

describe("validateAnswerAgainstRegex — ReDoS-безопасна", () => {
  it("нормален шаблон, който съвпада → ok", async () => {
    const r = await validateAnswerAgainstRegex({ id: "q1", validationRegex: "^[a-z]+$" }, "hello");
    expect(r.ok).toBe(true);
  });

  it("нормален шаблон, който НЕ съвпада → not ok", async () => {
    const r = await validateAnswerAgainstRegex({ id: "q2", validationRegex: "^\\d+$" }, "abc");
    expect(r.ok).toBe(false);
  });

  it("катастрофичен шаблон (nested quantifier) се ограничава по време, не виси", async () => {
    const evil = "^(a+)+$";
    const payload = "a".repeat(60) + "!"; // класически catastrophic backtracking вход
    const t0 = Date.now();
    const r = await validateAnswerAgainstRegex({ id: "q3", validationRegex: evil }, payload);
    const elapsed = Date.now() - t0;
    expect(r.ok).toBe(true);        // timeout → приема (не наказва потребителя)
    expect(elapsed).toBeLessThan(2000); // ограничено, НЕ виси главния loop
  });

  it("катастрофичен alternation-overlap (заобикаля blocklist) също се ограничава", async () => {
    const evil = "^(a|a)*$"; // NESTED_QUANTIFIER regex-ът НЕ го хваща — timeout-ът да
    const payload = "a".repeat(60) + "!";
    const t0 = Date.now();
    const r = await validateAnswerAgainstRegex({ id: "q4", validationRegex: evil }, payload);
    expect(r.ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("малформиран шаблон → приема (не наказва за конфиг грешка)", async () => {
    const r = await validateAnswerAgainstRegex({ id: "q5", validationRegex: "(unclosed" }, "x");
    expect(r.ok).toBe(true);
  });

  it("вход над тавана → отхвърля без да пуска worker", async () => {
    const r = await validateAnswerAgainstRegex({ id: "q6", validationRegex: "^.*$" }, "x".repeat(600));
    expect(r.ok).toBe(false);
  });

  it("без validationRegex → ok", async () => {
    const r = await validateAnswerAgainstRegex({ id: "q7" }, "anything");
    expect(r.ok).toBe(true);
  });
});
