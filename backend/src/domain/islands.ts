import type { LiveOpsConfig } from "../config/liveops.js";
import type { Island } from "./types.js";

/**
 * Village multiplier for an island (§5.5). Geometric growth per island index:
 * index 0 → ×1, and each subsequent island scales rewards and costs upward so
 * progression never hits a ceiling.
 */
export function villageMultiplier(cfg: LiveOpsConfig, islandIndex: number): number {
  return cfg.islands.villageMultiplierGrowth ** islandIndex;
}

/** A fresh island with all buildings at level 0. */
export function makeIsland(cfg: LiveOpsConfig, index: number): Island {
  return {
    index,
    buildings: Array.from({ length: cfg.islands.buildingsPerIsland }, () => ({ level: 0 })),
    completed: false,
  };
}

/**
 * Cost to take a building from its current level to the next.
 *
 * GDD §5.5: cost = baseCost * costGrowth^globalLevel, where globalLevel is a
 * monotonically increasing index across all islands/buildings/levels so the
 * curve grows smoothly forever. Spin yield grows slower than this → the
 * controlled gap monetisation fills.
 */
export function buildingCost(
  cfg: LiveOpsConfig,
  islandIndex: number,
  buildingIndex: number,
  currentLevel: number,
): number {
  const perIsland = cfg.islands.buildingsPerIsland * cfg.islands.levelsPerBuilding;
  const globalLevel =
    islandIndex * perIsland + buildingIndex * cfg.islands.levelsPerBuilding + currentLevel;
  return Math.round(cfg.islands.baseCost * cfg.islands.costGrowth ** globalLevel);
}

export function islandIsComplete(cfg: LiveOpsConfig, island: Island): boolean {
  return island.buildings.every((b) => b.level >= cfg.islands.levelsPerBuilding);
}
