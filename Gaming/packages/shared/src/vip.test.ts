import { describe, expect, it } from "vitest";
import {
  ROTATING_DAILY_COUNT,
  VIP_PERKS,
  activeQuests,
  applyXpMultiplier,
  dailyReward,
  effectiveVipTier,
  extraQuestSlots,
  vipDailyReward,
  vipPerksFor,
} from "./index.js";

const NOW = new Date("2026-09-26T12:00:00Z");
const FUTURE = new Date("2026-10-26T12:00:00Z");
const PAST = new Date("2026-09-01T12:00:00Z");

describe("активно VIP ниво", () => {
  it("активен абонамент дава нивото си", () => {
    expect(effectiveVipTier("GOLD", FUTURE, NOW)).toBe("GOLD");
    expect(effectiveVipTier("SILVER", FUTURE.toISOString(), NOW)).toBe("SILVER");
  });

  it("изтекъл абонамент не дава нищо", () => {
    expect(effectiveVipTier("PLATINUM", PAST, NOW)).toBe("NONE");
    expect(vipPerksFor("PLATINUM", PAST, NOW)).toEqual(VIP_PERKS.NONE);
  });

  it("безсрочно (админско) присвояване остава в сила; непознато ниво = NONE", () => {
    expect(effectiveVipTier("BRONZE", null, NOW)).toBe("BRONZE");
    expect(effectiveVipTier("HACKER", FUTURE, NOW)).toBe("NONE");
    expect(effectiveVipTier(undefined, undefined, NOW)).toBe("NONE");
  });
});

describe("VIP множители", () => {
  it("опитът се умножава по нивото и никога не пада под базовия", () => {
    expect(applyXpMultiplier(10, VIP_PERKS.NONE)).toBe(10);
    expect(applyXpMultiplier(10, VIP_PERKS.BRONZE)).toBe(11);
    expect(applyXpMultiplier(40, VIP_PERKS.GOLD)).toBe(54);
    expect(applyXpMultiplier(30, VIP_PERKS.PLATINUM)).toBe(45);
    expect(applyXpMultiplier(3, VIP_PERKS.BRONZE)).toBe(3);
  });

  it("дневният бонус умножава чиповете, не камъните", () => {
    expect(vipDailyReward(1, VIP_PERKS.NONE)).toEqual(dailyReward(1));
    expect(vipDailyReward(1, VIP_PERKS.BRONZE)).toEqual({ chips: 120, gems: 0 });
    expect(vipDailyReward(7, VIP_PERKS.PLATINUM)).toEqual({ chips: 1400, gems: 5 });
  });
});

describe("слотове за задачи", () => {
  const day = "2026-09-26";

  it("безплатният профил има базовите ротиращи дневни задачи", () => {
    expect(VIP_PERKS.NONE.questSlots).toBe(ROTATING_DAILY_COUNT);
    expect(activeQuests(day, VIP_PERKS.NONE.questSlots)).toEqual(activeQuests(day));
    expect(extraQuestSlots(VIP_PERKS.NONE)).toBe(0);
  });

  it("VIP добавя ротиращи задачи, без да сменя базовите", () => {
    const base = activeQuests(day);
    const gold = activeQuests(day, VIP_PERKS.GOLD.questSlots);
    expect(gold.length).toBe(base.length + extraQuestSlots(VIP_PERKS.GOLD));
    expect(gold.slice(0, base.length)).toEqual(base);
    expect(new Set(gold.map((q) => q.key)).size).toBe(gold.length);
  });

  it("слотовете са ограничени до наличните ротиращи задачи", () => {
    const all = activeQuests(day, 999);
    expect(new Set(all.map((q) => q.key)).size).toBe(all.length);
    expect(activeQuests(day, 0).every((q) => q.core)).toBe(true);
  });
});
