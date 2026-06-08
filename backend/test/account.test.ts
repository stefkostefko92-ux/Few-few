import { beforeEach, describe, expect, it } from "vitest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { MemoryLiveOpsStore } from "../src/config/liveOpsStore.js";
import { AuthService } from "../src/auth/authService.js";
import { TokenService } from "../src/auth/tokens.js";
import { MemoryAuthRepository } from "../src/data/authRepository.js";
import { MemoryClanRepository } from "../src/data/clanRepository.js";
import { MemoryLedger } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import { MemoryPurchaseRepository } from "../src/data/purchaseRepository.js";
import { MemoryStore } from "../src/data/store.js";
import { Catalog } from "../src/monetization/catalog.js";
import { StubReceiptValidator } from "../src/monetization/receipts.js";
import { AccountService } from "../src/services/accountService.js";
import { ClanService } from "../src/services/clanService.js";
import { GameService } from "../src/services/gameService.js";
import { IapService } from "../src/services/iapService.js";
import { FakeClock } from "../src/services/clock.js";

describe("AccountService — GDPR export & erasure", () => {
  let repo: MemoryPlayerRepository;
  let authRepo: MemoryAuthRepository;
  let purchases: MemoryPurchaseRepository;
  let clans: MemoryClanRepository;
  let validator: StubReceiptValidator;
  let auth: AuthService;
  let iap: IapService;
  let clan: ClanService;
  let account: AccountService;

  beforeEach(() => {
    const clock = new FakeClock(1_000);
    repo = new MemoryPlayerRepository();
    authRepo = new MemoryAuthRepository();
    purchases = new MemoryPurchaseRepository();
    clans = new MemoryClanRepository();
    const store = new MemoryStore(repo, new MemoryLedger(), purchases, clans);
    const liveOps = new MemoryLiveOpsStore(defaultLiveOps);
    const game = new GameService({ store, liveOps, clock });
    clan = new ClanService({ clanRepo: clans, playerRepo: repo, store, clock });
    validator = new StubReceiptValidator("rs");
    iap = new IapService({ catalog: new Catalog(), validator, game, clock });
    auth = new AuthService({ authRepo, tokens: new TokenService("secret-0123456789abcd"), createPlayer: (n) => game.createPlayer(n), clock });
    account = new AccountService({ store, playerRepo: repo, authRepo, purchaseRepo: purchases, clan });
  });

  it("exports the player, device metadata, and purchase history (no secret hash)", async () => {
    const reg = await auth.register("Hana", "device-aaaa1111");
    await iap.redeem(reg.player.id, "ios", "gem_s", validator.sign("tx-export-1", "gem_s"));

    const data = await account.exportData(reg.player.id);

    expect(data.player.id).toBe(reg.player.id);
    expect(data.player.name).toBe("Hana");
    expect(data.account).toMatchObject({ deviceId: "device-aaaa1111" });
    expect(data.purchases).toHaveLength(1);
    expect(data.purchases[0]).toMatchObject({ productId: "gem_s", transactionId: "tx-export-1" });
    // The credential secret hash must never be exported.
    expect(JSON.stringify(data)).not.toContain("secretHash");
  });

  it("erases the account: player, credential, purchases, and clan membership", async () => {
    const reg = await auth.register("Mei", "device-bbbb2222");
    const founder = await auth.register("Leader", "device-cccc3333");
    const c = await clan.createClan(founder.player.id, "Sky Foxes", "FOX");
    await clan.joinClan(reg.player.id, c.id);
    await iap.redeem(reg.player.id, "ios", "gem_s", validator.sign("tx-erase-1", "gem_s"));

    await account.eraseData(reg.player.id);

    expect(await repo.get(reg.player.id)).toBeUndefined();
    expect(await authRepo.getByPlayer(reg.player.id)).toBeUndefined();
    expect(await purchases.listByPlayer(reg.player.id)).toHaveLength(0);
    expect((await clan.getClan(c.id)).memberIds).not.toContain(reg.player.id);
    // Login is no longer possible (credential gone).
    await expect(auth.login("device-bbbb2222", "whatever")).rejects.toThrow(/invalid device or secret/i);
  });

  it("erasure is idempotent", async () => {
    const reg = await auth.register("Yuki", "device-dddd4444");
    await account.eraseData(reg.player.id);
    await expect(account.eraseData(reg.player.id)).resolves.toBeUndefined();
  });
});
