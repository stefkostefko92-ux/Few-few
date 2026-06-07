import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket as NodeWebSocket } from "ws";
import { defaultLiveOps } from "../src/config/liveops.js";
import { AuthService } from "../src/auth/authService.js";
import { TokenService } from "../src/auth/tokens.js";
import { MemoryAuthRepository } from "../src/data/authRepository.js";
import { MemoryClanRepository } from "../src/data/clanRepository.js";
import { MemoryLedger } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import { MemoryPurchaseRepository } from "../src/data/purchaseRepository.js";
import { createApp } from "../src/http/app.js";
import { Catalog } from "../src/monetization/catalog.js";
import { StubReceiptValidator } from "../src/monetization/receipts.js";
import { ChatHub } from "../src/realtime/chatHub.js";
import { ClanService } from "../src/services/clanService.js";
import { GameService } from "../src/services/gameService.js";
import { IapService } from "../src/services/iapService.js";
// The SDK under test (the published client package, zero-dependency).
import { KaguraClient, generateDeviceId, type ChatEvent } from "../../client/src/index.js";

// Node's global WebSocket may be absent depending on flags; the SDK uses the
// global, so provide ws as a shim for the test environment.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = NodeWebSocket;
}

const SECRET = "test-secret-0123456789abcdef";

describe("KaguraClient SDK (over real HTTP/WS)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const repo = new MemoryPlayerRepository();
    const game = new GameService({ repo, ledger: new MemoryLedger(), config: defaultLiveOps });
    const tokens = new TokenService(SECRET);
    const auth = new AuthService({ authRepo: new MemoryAuthRepository(), tokens, createPlayer: (n) => game.createPlayer(n) });
    const catalog = new Catalog();
    const iap = new IapService({ catalog, validator: new StubReceiptValidator("rs"), purchases: new MemoryPurchaseRepository(), game });
    const clan = new ClanService({ clanRepo: new MemoryClanRepository(), playerRepo: repo });
    const app = createApp({ game, auth, tokens, iap, catalog, clan, webhookSecret: "wh" });
    server = app.listen(0);
    new ChatHub(tokens, (id) => game.getPlayer(id)).attach(server);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("registers, reads /me, and stores the session", async () => {
    const c = new KaguraClient({ baseUrl });
    const { player } = await c.register("Hana", generateDeviceId());
    expect(player.spins).toBe(defaultLiveOps.spins.startingBonus);
    expect(c.getSession()?.accessToken).toBeTruthy();

    const me = await c.me();
    expect(me.player.id).toBe(player.id);
  });

  it("spins and reflects the new balance", async () => {
    const c = new KaguraClient({ baseUrl });
    const { player } = await c.register("Yuki", generateDeviceId());
    const res = await c.spin(1);
    expect(res.outcome.reels).toHaveLength(3);
    expect(res.player.spins).toBe(player.spins - 1);
  });

  it("reads the public shop and gacha rates without auth", async () => {
    const c = new KaguraClient({ baseUrl });
    const { products } = await c.shop();
    expect(products.length).toBeGreaterThan(0);
    const { rates } = await c.gachaRates();
    expect(rates.common + rates.rare + rates.epic + rates.mythic).toBeCloseTo(1, 6);
  });

  it("redeems a (sandbox) purchase and credits the player", async () => {
    const c = new KaguraClient({ baseUrl });
    await c.register("Mei", generateDeviceId());
    const before = (await c.me()).player.spins;
    // Reproduce the sandbox receipt signature the server expects.
    const validator = new StubReceiptValidator("rs");
    const receipt = validator.sign("sdk-tx-1", "spin_s");
    const res = await c.redeem("ios", "spin_s", receipt);
    expect(res.granted).toBe(true);
    expect(res.player.spins).toBe(before + 60);
  });

  it("surfaces server errors as KaguraError", async () => {
    const c = new KaguraClient({ baseUrl });
    await c.register("Err", generateDeviceId());
    await expect(c.spin(0)).rejects.toMatchObject({ name: "KaguraError", status: 400 });
  });

  it("creates a clan and exchanges a chat message over WebSocket", async () => {
    const c = new KaguraClient({ baseUrl });
    await c.register("Leader", generateDeviceId());
    await c.createClan("Sky Foxes", "FOX");
    const { clans } = await c.listClans();
    expect(clans.some((cl) => cl.tag === "FOX")).toBe(true);

    const got = new Promise<ChatEvent>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no chat")), 12_000);
      const conn = c.connectChat((e) => {
        if (e.type === "history") conn.send("Ohayou!");
        if (e.type === "chat") {
          clearTimeout(timer);
          conn.close();
          resolve(e);
        }
      });
    });
    const chat = await got;
    expect(chat.text).toBe("Ohayou!");
  }, 30_000);
});
