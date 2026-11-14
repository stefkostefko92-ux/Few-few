import { describe, expect, it } from "vitest";
import { isRotateKey, isTyping } from "./keys";

const key = (k: string, target: unknown = { tagName: "DIV" }, mods: Partial<KeyboardEvent> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target, ...mods }) as unknown as KeyboardEvent;

describe("Морски бой — клавиш „Завърти“", () => {
  it("R/р върти кораба, когато фокусът е върху масата", () => {
    for (const k of ["r", "R", "р", "Р"]) expect(isRotateKey(key(k))).toBe(true);
  });

  it("не върти, докато пишеш в чата или в друго поле", () => {
    expect(isRotateKey(key("р", { tagName: "INPUT" }))).toBe(false);
    expect(isRotateKey(key("r", { tagName: "TEXTAREA" }))).toBe(false);
    expect(isRotateKey(key("r", { tagName: "DIV", isContentEditable: true }))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });

  it("Ctrl+R (презареждане) и други клавиши не въртят", () => {
    expect(isRotateKey(key("r", undefined, { ctrlKey: true }))).toBe(false);
    expect(isRotateKey(key("t"))).toBe(false);
  });
});
