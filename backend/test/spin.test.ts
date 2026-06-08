import { describe, expect, it } from "vitest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { resolveSpin } from "../src/domain/spin.js";

const cfg = defaultLiveOps;

describe("resolveSpin", () => {
  it("3× coin is a jackpot scaled by bet and village multiplier", () => {
    const out = resolveSpin(["coin", "coin", "coin"], 2, 1.55, cfg);
    expect(out.type).toBe("JACKPOT");
    const expected = Math.round(cfg.payouts.baseCoinValue * cfg.payouts.jackpotMultiplier * 2 * 1.55);
    expect(out.coins).toBe(expected);
  });

  it("3× ward grants shields, no coins", () => {
    const out = resolveSpin(["ward", "ward", "ward"], 1, 1, cfg);
    expect(out.type).toBe("SHIELDS");
    expect(out.shields).toBe(cfg.payouts.wardShieldsOnTriple);
    expect(out.coins).toBe(0);
  });

  it("3× strike triggers an attack action with bonus coins", () => {
    const out = resolveSpin(["strike", "strike", "strike"], 1, 1, cfg);
    expect(out.type).toBe("ATTACK");
    expect(out.action).toBe("ATTACK");
    expect(out.coins).toBe(cfg.payouts.strikeBonusCoins);
  });

  it("3× raid triggers a raid action and grants nothing inline", () => {
    const out = resolveSpin(["raid", "raid", "raid"], 1, 1, cfg);
    expect(out.type).toBe("RAID");
    expect(out.action).toBe("RAID");
    expect(out.coins).toBe(0);
  });

  it("3× spirit grants spirit tokens", () => {
    const out = resolveSpin(["spirit", "spirit", "spirit"], 1, 1, cfg);
    expect(out.type).toBe("SPIRIT");
    expect(out.spiritTokens).toBe(cfg.payouts.spiritTokensOnTriple);
  });

  it("a pair never fires an action — it is a scaled consolation", () => {
    const out = resolveSpin(["strike", "strike", "coin"], 1, 1, cfg);
    expect(out.action).toBeUndefined();
    expect(out.type).not.toBe("ATTACK");
  });

  it("a coin pair pays half the jackpot", () => {
    const out = resolveSpin(["coin", "coin", "ward"], 1, 1, cfg);
    expect(out.type).toBe("JACKPOT");
    expect(out.coins).toBe(Math.floor((cfg.payouts.baseCoinValue * cfg.payouts.jackpotMultiplier) / 2));
  });

  it("all distinct pays coins per coin symbol present", () => {
    const out = resolveSpin(["coin", "ward", "strike"], 1, 1, cfg);
    expect(out.type).toBe("MIX");
    expect(out.coins).toBe(cfg.payouts.baseCoinValue);
  });

  it("all distinct with no coin symbol pays nothing", () => {
    const out = resolveSpin(["ward", "strike", "raid"], 1, 1, cfg);
    expect(out.coins).toBe(0);
  });
});
