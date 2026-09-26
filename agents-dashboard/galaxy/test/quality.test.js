import { test } from "node:test";
import assert from "node:assert/strict";
import { createQualityController } from "../src/quality.js";
import { QUALITY_TIERS, FPS_HYSTERESIS_MS } from "../src/config.js";

function feed(ctl, dtMs, count) {
  let changed = false;
  for (let i = 0; i < count; i++) changed = ctl.tick(dtMs) || changed;
  return changed;
}

test("устойчиво бавни кадри качват tier (по-олекотено качество)", () => {
  const ctl = createQualityController(0);
  // 25fps ~ 40ms/кадър, достатъчно кадри за да мине FPS_HYSTERESIS_MS няколко пъти
  const changed = feed(ctl, 40, Math.ceil((FPS_HYSTERESIS_MS * 3) / 40));
  assert.ok(changed);
  assert.ok(ctl.state.tier > 0, "tier трябва да е паднал под пълно качество");
});

test("устойчиво бързи кадри свалят tier обратно към пълно качество", () => {
  const ctl = createQualityController(QUALITY_TIERS.length - 1);
  feed(ctl, 8, Math.ceil((FPS_HYSTERESIS_MS * 6) / 8)); // ~125fps
  assert.equal(ctl.state.tier, 0);
});

test("tier никога не излиза извън диапазона на QUALITY_TIERS", () => {
  const ctl = createQualityController(0);
  feed(ctl, 40, Math.ceil((FPS_HYSTERESIS_MS * 20) / 40));
  assert.ok(ctl.state.tier >= 0 && ctl.state.tier < QUALITY_TIERS.length);
});

test("хистерезис: смяна не се случва преди FPS_HYSTERESIS_MS да мине", () => {
  const ctl = createQualityController(0);
  const changed = ctl.tick(40); // само 40ms — далеч под прага
  assert.equal(changed, false);
  assert.equal(ctl.state.tier, 0);
});

test("historyMix е 0 веднага след resize/смяна на tier (без ghosting)", () => {
  const ctl = createQualityController(0);
  assert.equal(ctl.historyMix(false), 0, "първо изчитане след създаване трябва да е 0");
  assert.ok(ctl.historyMix(false) > 0, "следващото изчитане може да натрупва");
});

test("historyMix е винаги 0 под reduced-motion", () => {
  const ctl = createQualityController(0);
  ctl.historyMix(false);
  assert.equal(ctl.historyMix(true), 0);
});

test("invalidateHistory връща 0 на следващото изчитане", () => {
  const ctl = createQualityController(0);
  ctl.historyMix(false);
  ctl.invalidateHistory();
  assert.equal(ctl.historyMix(false), 0);
});
