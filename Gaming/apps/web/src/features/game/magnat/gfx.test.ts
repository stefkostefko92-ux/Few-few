import { describe, expect, it } from "vitest";
import { defaultGfxParams, type QualityTier } from "../gl/gfxRegistry";
import { magnatGfx } from "./gfx";

const at = (tier: QualityTier) => magnatGfx({ ...defaultGfxParams(), tier });

describe("magnatGfx — картината на Магнат спазва класа на устройството", () => {
  it("GTAO (най-скъпият пас) само за висок клас", () => {
    expect(at("high").ao.enabled).toBe(true);
    expect(at("mid").ao.enabled).toBe(false);
    expect(at("low").ao.enabled).toBe(false);
  });

  it("bloom без слабите устройства, със собствения праг на Магнат", () => {
    expect(at("low").bloom.enabled).toBe(false);
    expect(at("mid").bloom).toMatchObject({ enabled: true, threshold: 1.35 });
    expect(at("high").exposure).toBe(1.08);
  });

  it("не пипа общите настройки на класа (резолюция, сенки)", () => {
    const base = { ...defaultGfxParams(), tier: "low" as const, pixelRatio: 1.25, shadowSize: 1024 };
    expect(magnatGfx(base)).toMatchObject({ pixelRatio: 1.25, shadowSize: 1024, tier: "low" });
  });
});
