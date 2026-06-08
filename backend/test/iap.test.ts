import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { MemoryLedger, playerAccount } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import { Catalog } from "../src/monetization/catalog.js";
import { StubReceiptValidator } from "../src/monetization/receipts.js";
import { GameService } from "../src/services/gameService.js";
import { IapService } from "../src/services/iapService.js";
import { FakeClock } from "../src/services/clock.js";

const RECEIPT_SECRET = "receipt-secret";

describe("IapService", () => {
  let repo: MemoryPlayerRepository;
  let ledger: MemoryLedger;
  let validator: StubReceiptValidator;
  let game: GameService;
  let iap: IapService;

  beforeEach(() => {
    repo = new MemoryPlayerRepository();
    ledger = new MemoryLedger();
    validator = new StubReceiptValidator(RECEIPT_SECRET);
    game = new GameService({ repo, ledger, config: defaultLiveOps, clock: new FakeClock(1_000) });
    iap = new IapService({ catalog: new Catalog(), validator, game, clock: new FakeClock(1_000) });
  });

  it("grants the product's currencies on a valid receipt, through the ledger", async () => {
    const p = await game.createPlayer("Hana");
    const before = p.spins;
    const receipt = validator.sign("tx-1", "spin_m");

    const result = await iap.redeem(p.id, "ios", "spin_m", receipt);
    expect(result.granted).toBe(true);

    const after = await game.getPlayer(p.id);
    expect(after.spins).toBe(before + 180); // spin_m grants 180
    // Granted through the ledger → balance equals the sum of legs.
    expect(await ledger.balanceOf(playerAccount(p.id), "spins")).toBe(after.spins);
    expect(await ledger.netForCurrency("spins")).toBe(0);
  });

  it("is idempotent — the same transactionId never double-grants", async () => {
    const p = await game.createPlayer("Hana");
    const receipt = validator.sign("tx-dup", "gem_s");

    const first = await iap.redeem(p.id, "ios", "gem_s", receipt);
    const second = await iap.redeem(p.id, "ios", "gem_s", receipt);

    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect((await game.getPlayer(p.id)).gems).toBe(80); // granted exactly once
  });

  it("rejects a forged receipt", async () => {
    const p = await game.createPlayer("Hana");
    await expect(iap.redeem(p.id, "ios", "spin_s", "tx-x.spin_s.deadbeef")).rejects.toThrow(/signature/i);
    expect((await game.getPlayer(p.id)).spins).toBe(defaultLiveOps.spins.startingBonus);
  });

  it("rejects a receipt whose product doesn't match the requested product", async () => {
    const p = await game.createPlayer("Hana");
    const receipt = validator.sign("tx-2", "spin_s"); // signed for spin_s
    await expect(iap.redeem(p.id, "ios", "spin_l", receipt)).rejects.toThrow(/mismatch/i);
  });

  it("blocks a second purchase of a one-time product", async () => {
    const p = await game.createPlayer("Hana");
    await iap.redeem(p.id, "ios", "starter_bundle", validator.sign("tx-a", "starter_bundle"));
    await expect(
      iap.redeem(p.id, "ios", "starter_bundle", validator.sign("tx-b", "starter_bundle")),
    ).rejects.toThrow(/already owned/i);
  });

  it("fulfils a webhook delivery idempotently", async () => {
    const p = await game.createPlayer("Hana");
    const r1 = await iap.fulfil(p.id, "android", "coin_s", "wh-tx-1");
    const r2 = await iap.fulfil(p.id, "android", "coin_s", "wh-tx-1");
    expect(r1.granted).toBe(true);
    expect(r2.granted).toBe(false);
    expect((await game.getPlayer(p.id)).coins).toBe(40_000);
  });
});

describe("webhook signature", () => {
  it("HMAC verification accepts a correctly signed body and rejects tampering", async () => {
    const { verifyWebhookSignature } = await import("../src/monetization/receipts.js");
    const secret = "wh-secret";
    const body = Buffer.from(JSON.stringify({ transaction_id: "x" }));
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from("tampered"), sig, secret)).toBe(false);
  });
});
