import { describe, expect, it, vi } from "vitest";
import { takeoverReloader } from "./pwa";

describe("service-worker takeover never reloads a page the player did not ask to refresh", () => {
  it("first install / silent update: controllerchange does NOT reload", () => {
    const reload = vi.fn();
    const onChange = takeoverReloader(() => false, reload);
    onChange();
    onChange();
    expect(reload).not.toHaveBeenCalled();
  });

  it("after „Обнови“: the takeover reloads exactly once", () => {
    const reload = vi.fn();
    let asked = false;
    const onChange = takeoverReloader(() => asked, reload);
    onChange();
    asked = true;
    onChange();
    onChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
