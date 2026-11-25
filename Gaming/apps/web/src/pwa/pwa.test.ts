import { describe, expect, it, vi } from "vitest";
import { createReloadGate, shouldReloadForStaleChunk } from "./pwa";

describe("createReloadGate — презареждане само по желание на играча", () => {
  it("първо посещение: claim() на новия SW (controllerchange) НЕ презарежда страницата", () => {
    const reload = vi.fn();
    const gate = createReloadGate(reload);
    gate.controllerChanged();
    gate.controllerChanged();
    expect(reload).not.toHaveBeenCalled();
  });

  it("„Обнови“ с чакащ SW: презарежда при поемането — веднъж", () => {
    const reload = vi.fn();
    const gate = createReloadGate(reload);
    gate.request(false);
    expect(reload).not.toHaveBeenCalled();
    gate.controllerChanged();
    gate.controllerChanged();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("„Обнови“, когато новата версия вече е поела страницата: презарежда веднага", () => {
    const reload = vi.fn();
    const gate = createReloadGate(reload);
    gate.request(true);
    gate.controllerChanged();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("shouldReloadForStaleChunk — липсващ стар chunk след деплой", () => {
  it("първият път презарежда, повторно до минута — не (без цикъл)", () => {
    expect(shouldReloadForStaleChunk(null, 1_000)).toBe(true);
    expect(shouldReloadForStaleChunk(1_000, 30_000)).toBe(false);
    expect(shouldReloadForStaleChunk(1_000, 62_000)).toBe(true);
  });
});
