// bot/src/__tests__/regexWorkerCap.test.js
// Проверката на формат не бива да става DoS вектор по ПАМЕТ.
//
// ДЕФЕКТЪТ (одит сигурност, 16.08.2026): изолацията в worker реши правилния
// проблем — катастрофичен regex вече не блокира event loop-а. Но worker се
// раждаше при ВСЕКИ отговор, без таван. Измерено на живо:
//      20 едновременни → RSS  44 →  250 MB   (~10 MB/worker)
//     100 едновременни → RSS  44 →  882 MB
//     300 едновременни → RSS  44 → 1800 MB, пускането отне 9.5s
//
// Катастрофичен шаблон държи своя worker цяла секунда, значи припокриването е
// максимално точно когато най-боли. Тоест защитата срещу ReDoS се беше
// превърнала в нов DoS — по памет вместо по процесор.
//
// Гейтът е ПОВЕДЕНЧЕСКИ: пуска много едновременни проверки с катастрофичен
// шаблон и гледа реалния брояч. Не проверява константата — число в код не
// доказва, че броенето е вярно (напр. изпуснат decrement при грешка).
import { describe, it, expect, vi } from "vitest";

vi.mock("../utils/api.js", () => ({ default: {}, api: {} }));

const { validateAnswerAgainstRegex, _activeRegexWorkers } =
  await import("../utils/formSession.js");

const CATASTROPHIC = { id: "q-cat", validationRegex: "^(a+)+$" };
const BAD_INPUT = "a".repeat(48) + "!";

describe("таван на едновременните regex worker-и", () => {
  it("броячът НИКОГА не надхвърля тавана при наплив", async () => {
    let peak = 0;
    const sampler = setInterval(() => {
      peak = Math.max(peak, _activeRegexWorkers());
    }, 5);

    // 60 наведнъж — трикратно над тавана, все катастрофични, тоест всеки
    // би държал своя worker до таймаута, ако изобщо се пуснеше.
    const all = Array.from({ length: 60 }, () =>
      validateAnswerAgainstRegex(CATASTROPHIC, BAD_INPUT));
    const results = await Promise.all(all);
    clearInterval(sampler);

    expect(peak, `едновременни worker-и стигнаха ${peak}`).toBeLessThanOrEqual(8);
    expect(results).toHaveLength(60);
    // На тавана ПРИЕМАМЕ: отказът би дал на нападателя точно това, което търси —
    // чужди кандидатури да падат, докато той държи нишките заети.
    expect(results.every((r) => r.ok === true)).toBe(true);
  }, 30_000);

  it("броячът се връща на нула — няма изтичане на слотове", async () => {
    // Изпуснат decrement е коварен: работи, докато не запуши тавана завинаги.
    await validateAnswerAgainstRegex({ id: "q1", validationRegex: "^\\d{4}$" }, "1234");
    await validateAnswerAgainstRegex({ id: "q2", validationRegex: "^\\d{4}$" }, "не-число");
    await validateAnswerAgainstRegex({ id: "q3", validationRegex: "[" }, "каквото и да е"); // счупен шаблон
    await new Promise((r) => setTimeout(r, 300));
    expect(_activeRegexWorkers()).toBe(0);
  }, 20_000);

  it("нормалната валидация продължава да работи", async () => {
    // Таванът не бива да превърне гарда в „приемай всичко".
    const q = { id: "q4", validationRegex: "^\\d{4}$" };
    expect((await validateAnswerAgainstRegex(q, "1234")).ok).toBe(true);
    expect((await validateAnswerAgainstRegex(q, "abcd")).ok).toBe(false);
  }, 20_000);
});
