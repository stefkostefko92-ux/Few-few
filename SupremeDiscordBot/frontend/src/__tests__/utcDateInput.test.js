// frontend/src/__tests__/utcDateInput.test.js
// Сезоните се редактират в UTC: стойността от datetime-local трябва да се чете
// като UTC, не като локално време (иначе сезонът се мести с offset-а на браузъра).
import { describe, it, expect } from "vitest";
import { toUtcInput, fromUtcInput } from "../utils/utcDateInput";

describe("datetime-local в UTC", () => {
  it("кръгово: ISO → поле → ISO без отместване, каквато и да е зоната на процеса", () => {
    const iso = "2026-09-21T00:00:00.000Z";
    const field = toUtcInput(iso);
    expect(field).toBe("2026-09-21T00:00");
    expect(fromUtcInput(field)).toBe(iso);
  });
  it("приема и стойност със секунди / със Z; празно и невалидно → undefined/празно", () => {
    expect(fromUtcInput("2026-12-14T04:23:00")).toBe("2026-12-14T04:23:00.000Z");
    expect(fromUtcInput("2026-12-14T04:23:00Z")).toBe("2026-12-14T04:23:00.000Z");
    expect(fromUtcInput("")).toBeUndefined();
    expect(fromUtcInput("not-a-date")).toBeUndefined();
    expect(toUtcInput(null)).toBe("");
    expect(toUtcInput("nope")).toBe("");
  });
  it("не зависи от локалната зона (доказано, не предположено)", () => {
    // Наивното `new Date("2026-09-21T00:00")` дава локално време — в зона ≠ UTC се
    // разминава с очакваното; нашата функция закотвя UTC изрично.
    const naive = new Date("2026-09-21T00:00");
    const ours = new Date(fromUtcInput("2026-09-21T00:00"));
    // Math.abs: при TZ=UTC разликата е -0, а Object.is(-0, 0) е false.
    expect(Math.abs((ours.getTime() - naive.getTime()) + naive.getTimezoneOffset() * 60_000)).toBe(0);
    expect(ours.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});
