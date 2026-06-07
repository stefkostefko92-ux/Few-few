import { describe, expect, it } from "vitest";
import { clampInc, regenSpins } from "../src/domain/economy.js";
import { MemoryLedger, LedgerImbalanceError, playerAccount, SYSTEM_FAUCET } from "../src/data/ledger.js";

describe("economy helpers", () => {
  it("clampInc never exceeds the cap or goes below zero", () => {
    expect(clampInc(4, 3, 5)).toBe(5);
    expect(clampInc(0, -2, 5)).toBe(0);
    expect(clampInc(2, 2, 5)).toBe(4);
  });

  it("regenSpins accrues whole spins and carries the remainder", () => {
    const start = 0;
    const t0 = 1_000_000;
    // 5/hr → 1 spin per 12 min. After 30 min → 2 spins, 6 min carried.
    const r = regenSpins(start, t0, t0 + 30 * 60_000, 5, 50);
    expect(r.spins).toBe(2);
    // updatedAt advanced by exactly 2 spins worth of time (24 min), not 30.
    expect(r.spinsUpdatedAt).toBe(t0 + 24 * 60_000);
  });

  it("regenSpins stops at the cap", () => {
    const t0 = 0;
    const r = regenSpins(49, t0, t0 + 10 * 3_600_000, 5, 50);
    expect(r.spins).toBe(50);
  });

  it("regenSpins holds steady when already over cap (IAP balances)", () => {
    const t0 = 0;
    const r = regenSpins(75, t0, t0 + 10 * 3_600_000, 5, 50);
    expect(r.spins).toBe(75);
  });
});

describe("double-entry ledger", () => {
  it("rejects an unbalanced transaction", async () => {
    const ledger = new MemoryLedger();
    await expect(
      ledger.post("BAD", [
        { account: playerAccount("p1"), currency: "coins", delta: 100 },
        { account: SYSTEM_FAUCET, currency: "coins", delta: -50 },
      ]),
    ).rejects.toThrow(LedgerImbalanceError);
  });

  it("mint/burn/transfer keep the net for each currency at zero", async () => {
    const ledger = new MemoryLedger();
    await ledger.mint("p1", "coins", 1000, "SPIN");
    await ledger.burn("p1", "coins", 240, "BUILD");
    await ledger.mint("p2", "coins", 500, "SPIN");
    await ledger.transfer("p2", "p1", "coins", 120, "RAID");

    expect(await ledger.netForCurrency("coins")).toBe(0);
    expect(await ledger.balanceOf(playerAccount("p1"), "coins")).toBe(1000 - 240 + 120);
    expect(await ledger.balanceOf(playerAccount("p2"), "coins")).toBe(500 - 120);
  });
});
