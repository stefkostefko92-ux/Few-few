import { describe, expect, it } from "vitest";
import { reloadOnControllerChange } from "./pwa";

describe("reloadOnControllerChange (service worker поема страницата)", () => {
  it("първо посещение: SW поема страницата без контролер → НЕ презарежда", () => {
    expect(reloadOnControllerChange(false, false)).toBe(false);
  });

  it("връщащ се играч, нова версия на SW → презарежда веднъж", () => {
    expect(reloadOnControllerChange(true, false)).toBe(true);
    expect(reloadOnControllerChange(true, true)).toBe(false);
  });
});
