// quality.js — адаптивно качество: EMA на кадровото време решава кога да падне/качи tier
// (виж config.js QUALITY_TIERS). Чист JS, без GPU — тестваем детерминистично с фиксирани dt.
import { QUALITY_TIERS, FPS_LOW, FPS_HIGH, FPS_HYSTERESIS_MS, FPS_EMA_ALPHA } from "./config.js";

export function createQualityController(initialTier = 0) {
  const state = { tier: clampTier(initialTier), fpsEma: 60, tierT: 0, historyValid: false };

  function clampTier(t) {
    return Math.max(0, Math.min(QUALITY_TIERS.length - 1, t | 0));
  }

  /** Подава кадровото време (ms); връща true ако tier-ът се е сменил (извикващият да пресъздаде FBO-та). */
  function tick(dt) {
    state.fpsEma = state.fpsEma * (1 - FPS_EMA_ALPHA) + (1000 / Math.max(1, dt)) * FPS_EMA_ALPHA;
    state.tierT += dt;
    if (state.tierT < FPS_HYSTERESIS_MS) return false;
    state.tierT = 0;
    if (state.fpsEma < FPS_LOW && state.tier < QUALITY_TIERS.length - 1) {
      state.tier++;
      state.historyValid = false;
      return true;
    }
    if (state.fpsEma > FPS_HIGH && state.tier > 0) {
      state.tier--;
      state.historyValid = false;
      return true;
    }
    return false;
  }

  function current() {
    return QUALITY_TIERS[state.tier];
  }

  /** История (TAA-подобно натрупване) е невалидна веднага след resize/смяна на tier — един кадър
   *  с uHistoryMix=0, после се позволява натрупване; предпазва от ghosting при рязка смяна. */
  function invalidateHistory() {
    state.historyValid = false;
  }
  function historyMix(reducedMotion) {
    if (reducedMotion || !current().history) return 0;
    if (!state.historyValid) {
      state.historyValid = true;
      return 0;
    }
    return 0.35;
  }

  return { tick, current, invalidateHistory, historyMix, state };
}
