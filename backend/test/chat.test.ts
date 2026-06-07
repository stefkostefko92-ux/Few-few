import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { defaultLiveOps } from "../src/config/liveops.js";
import { MemoryLiveOpsStore } from "../src/config/liveOpsStore.js";
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

function makeStack() {
  const repo = new MemoryPlayerRepository();
  const game = new GameService({ repo, ledger: new MemoryLedger(), liveOps: new MemoryLiveOpsStore(defaultLiveOps) });
  const tokens = new TokenService("test-secret-0123456789abcdef");
  const auth = new AuthService({
    authRepo: new MemoryAuthRepository(),
    tokens,
    createPlayer: (name) => game.createPlayer(name),
  });
  const catalog = new Catalog();
  const iap = new IapService({
    catalog,
    validator: new StubReceiptValidator("rs"),
    purchases: new MemoryPurchaseRepository(),
    game,
  });
  const clan = new ClanService({ clanRepo: new MemoryClanRepository(), playerRepo: repo });
  const app = createApp({ game, auth, tokens, iap, catalog, clan, liveOps: new MemoryLiveOpsStore(defaultLiveOps), webhookSecret: "wh" });
  return { app, game, tokens, auth, clan };
}

function once<T>(ws: WebSocket, predicate: (msg: any) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    // Generous timeout: under parallel test load the ws handshake + JWT verify
    // can be starved by CPU-heavy suites running in sibling workers.
    const timer = setTimeout(() => reject(new Error("timeout waiting for ws message")), 12_000);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on("error", reject);
  });
}

function open(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

describe("clan chat over WebSocket", () => {
  let server: Server | undefined;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const ws of sockets) ws.close();
    sockets.length = 0;
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  });

  it("broadcasts a message to clan-mates and rejects outsiders", { timeout: 30_000 }, async () => {
    const { app, auth, clan, game } = makeStack();

    // Two clan-mates + one player without a clan.
    const a = await auth.register("Aoi", "device-a-00000000");
    const b = await auth.register("Ben", "device-b-00000000");
    const lone = await auth.register("Lone", "device-c-00000000");
    const c = await clan.createClan(a.player.id, "Sky Foxes", "FOX");
    await clan.joinClan(b.player.id, c.id);

    server = app.listen(0);
    new ChatHub(
      new TokenService("test-secret-0123456789abcdef"),
      (id) => game.getPlayer(id),
    ).attach(server);
    const port = (server.address() as AddressInfo).port;
    const url = (token: string) => `ws://127.0.0.1:${port}/ws?token=${token}`;

    const wsA = new WebSocket(url(a.accessToken));
    const wsB = new WebSocket(url(b.accessToken));
    sockets.push(wsA, wsB);
    await Promise.all([open(wsA), open(wsB)]);

    // Wait for each server-side join to complete (it sends `history` on join),
    // so the broadcast room is populated before A sends — avoids a race.
    await Promise.all([
      once(wsA, (m) => m.type === "history"),
      once(wsB, (m) => m.type === "history"),
    ]);

    // B waits for a chat; A sends one.
    const received = once<{ type: string; text: string; from: string }>(wsB, (m) => m.type === "chat");
    wsA.send(JSON.stringify({ type: "chat", text: "Konnichiwa!" }));
    const msg = await received;
    expect(msg.text).toBe("Konnichiwa!");
    expect(msg.from).toBe(a.player.id);

    // A player with no clan is rejected (socket closes with policy code).
    const wsLone = new WebSocket(url(lone.accessToken));
    sockets.push(wsLone);
    const closeCode = await new Promise<number>((resolve, reject) => {
      wsLone.on("close", (code) => resolve(code));
      wsLone.on("error", reject);
      setTimeout(() => reject(new Error("no close")), 12_000);
    });
    expect(closeCode).toBe(1008);
  });
});
