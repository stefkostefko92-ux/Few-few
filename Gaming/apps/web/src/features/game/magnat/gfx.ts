import type { GfxParams } from "../gl/gfxRegistry";

/**
 * Картината на Магнат върху класа на устройството: собствена експозиция и праг
 * на bloom, но GTAO (най-скъпият пас) само за висок клас, а bloom — без слабите
 * устройства, както при останалите 3D маси (gfxRegistry). Преди Магнат включваше
 * и двете за всеки клас: телефонът и софтуерният WebGL рисуваха кадър за
 * секунди, страницата замръзваше и часовникът на хода изтичаше.
 */
export function magnatGfx(base: GfxParams): GfxParams {
  return {
    ...base,
    exposure: 1.08,
    // 1.35 sits just above the lit ivory tiles' HDR luminance (~1.3) — below it
    // the whole ring washes out. Windows at emissive 2.2 still burn through.
    bloom: { enabled: base.tier !== "low", strength: 0.06, radius: 0.45, threshold: 1.35 },
    ao: { enabled: base.tier === "high", radius: 0.6, intensity: 1.0 },
  };
}
