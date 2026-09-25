// index.js — публичен вход на пакета. index.html вика само това (през галактика.js, вижте build.mjs).
// createGalaxy(nebCanvas) връща манипулатор за WebGL HDR слоя (bloom/ACES/CA/зърно/TAA-натрупване);
// createBackdrop() връща чисти помощници за 2D фоновия слой (снимка, мъглявини, прах, метеори) —
// index.html си държи собствения `#sky` контекст и агент-звездите непроменени.
import { createPipeline, resizePipeline, drawFrame, uploadSky } from "./pipeline.js";
import { createQualityController } from "./quality.js";
import { QUALITY_TIERS } from "./config.js";
import { buildDustField, buildAmbientNebulae } from "./backdrop-field.js";
import { drawGalaxyPhoto, drawAmbientNebulae, drawFineDust } from "./backdrop-draw.js";
import { spawnMeteor, stepAndDrawMeteors } from "./meteors.js";
import { separateLabels } from "./hash.js";

export function createGalaxy(canvas) {
  const pipeline = createPipeline(canvas);
  if (!pipeline.ready) return { ready: false };
  const quality = createQualityController(0);
  let skyFrame = 0;

  function resize(cssW, cssH, dpr) {
    resizePipeline(pipeline, cssW, cssH, dpr, quality.current().resScale);
    quality.invalidateHistory();
  }

  /** Извиква се веднъж/кадър; captureFromCanvas е #sky елементът (текстурата се презарежда на
   *  всеки 2-ри кадър при пълно качество, по-рядко при по-нисък tier — вижте bloomSkip). */
  function render({ time, gx, gy, reducedMotion, captureFromCanvas, bloomSkip = 1 }) {
    if (skyFrame++ % bloomSkip === 0) uploadSky(pipeline, captureFromCanvas);
    const tier = quality.current();
    const historyMix = quality.historyMix(reducedMotion);
    drawFrame(pipeline, {
      time,
      gx: reducedMotion ? 0 : gx,
      gy: reducedMotion ? 0 : gy,
      oct: tier.oct,
      stars: tier.stars,
      historyMix,
      grainSeed: reducedMotion ? 7.0 : time,
    });
  }

  /** dt в ms; връща true ако е сменен tier-ът (resize вече е извикан вътрешно). */
  function adaptQuality(dt, cssW, cssH, dpr) {
    const changed = quality.tick(dt);
    if (changed) resize(cssW, cssH, dpr);
    return changed;
  }

  return { ready: true, resize, render, adaptQuality, quality, tiers: QUALITY_TIERS };
}

/** Фонов 2D слой (снимка + амбиентни мъглявини + фин прах + метеори). Не пипа звездите-агенти/
 *  нишките/warp-а — index.html ги рисува отгоре, непроменени. */
export function createBackdrop(seed = 1) {
  const dust = buildDustField(seed);
  const nebulae = buildAmbientNebulae();
  let meteors = [];
  let meteorCooldown = 2 + Math.random() * 3;

  function drawPhoto(ctx, W, H, cx, cy, R, img, cleanImg, ready, opts) {
    drawGalaxyPhoto(ctx, W, H, cx, cy, R, img, cleanImg, ready, opts);
  }
  function drawDust() {} // историческа кука (виж index.html) — фината прах е в drawStructure по-долу
  function drawStructure(ctx, cx, cy, R, t, opts) {
    drawAmbientNebulae(ctx, nebulae, cx, cy, R, t, opts.reducedMotion, opts.gx, opts.gy);
    drawFineDust(ctx, dust, cx, cy, R, t, opts.gx, opts.gy, opts.reducedMotion);
  }
  function stepMeteors(ctx, W, H, reducedMotion) {
    if (!reducedMotion) {
      meteorCooldown -= 0.016;
      if (meteorCooldown <= 0) { meteors.push(spawnMeteor(W, H)); meteorCooldown = 2.4 + Math.random() * 4; }
    }
    stepAndDrawMeteors(ctx, meteors, W, H);
  }

  return { drawPhoto, drawDust, drawStructure, stepMeteors };
}

export { separateLabels };
