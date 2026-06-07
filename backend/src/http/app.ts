import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { GameError } from "../errors.js";
import type { Player } from "../domain/types.js";
import type { GameService } from "../services/gameService.js";
import type { AuthService, AuthTokens } from "../auth/authService.js";
import type { TokenService } from "../auth/tokens.js";
import type { IapService } from "../services/iapService.js";
import type { ClanService } from "../services/clanService.js";
import type { Catalog } from "../monetization/catalog.js";
import { verifyWebhookSignature } from "../monetization/receipts.js";

export interface AppDeps {
  game: GameService;
  auth: AuthService;
  tokens: TokenService;
  iap: IapService;
  catalog: Catalog;
  clan: ClanService;
  /** HMAC secret for the IAP webhook (RevenueCat-style, §8.1). */
  webhookSecret: string;
}

type RawBodyRequest = Request & { rawBody?: Buffer };

const ACCESS_COOKIE = "kg_at";
const REFRESH_COOKIE = "kg_rt";
const ACCESS_MAX_AGE = 15 * 60_000;
const REFRESH_MAX_AGE = 30 * 24 * 3_600_000;

/** Minimal fixed-window rate limiter (per IP). Real infra uses Redis (§11.3). */
function rateLimiter(maxPerWindow: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || rec.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    rec.count += 1;
    if (rec.count > maxPerWindow) {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "too many requests" } });
      return;
    }
    next();
  };
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

function setAuthCookies(res: Response, tokens: AuthTokens): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: ACCESS_MAX_AGE,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/auth",
    maxAge: REFRESH_MAX_AGE,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE);
  res.clearCookie(REFRESH_COOKIE, { path: "/auth" });
}

/**
 * Authenticate via a JWT access token, taken from the Authorization: Bearer
 * header (native clients) or the httpOnly cookie (web, §11.2). Stateless: the
 * signature + expiry are enough; revocation rides on the short TTL + refresh.
 */
async function authenticate(req: Request, tokens: TokenService): Promise<string> {
  const auth = req.header("authorization");
  let token: string | undefined;
  if (auth?.startsWith("Bearer ")) token = auth.slice(7).trim();
  token ??= readCookie(req, ACCESS_COOKIE);
  if (!token) throw new GameError("UNAUTHENTICATED", "missing access token", 401);
  const claims = await tokens.verifyAccess(token);
  return claims.playerId;
}

/** Wrap an async handler so rejections reach the error middleware. */
function h(fn: (req: Request, res: Response) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

const spinBody = z.object({ betMultiplier: z.number().int().min(1).default(1) });
const buildBody = z.object({ buildingIndex: z.number().int().min(0) });
const attackBody = z.object({ targetId: z.string().min(1), buildingIndex: z.number().int().min(0) });
const raidBody = z.object({ picks: z.array(z.number().int().min(0)).min(1) });
const registerBody = z.object({
  name: z.string().min(1).max(40).default("Kannushi"),
  deviceId: z.string().min(8).max(128),
});
const loginBody = z.object({ deviceId: z.string().min(8).max(128), deviceSecret: z.string().min(1) });
const refreshBody = z.object({ refreshToken: z.string().min(1).optional() });
const redeemBody = z.object({
  platform: z.enum(["ios", "android", "stripe"]),
  productId: z.string().min(1),
  receipt: z.string().min(1),
});
const createClanBody = z.object({
  name: z.string().min(2).max(32),
  tag: z.string().min(2).max(5),
});
const webhookBody = z.object({
  app_user_id: z.string().min(1),
  product_id: z.string().min(1),
  transaction_id: z.string().min(1),
  type: z.string().min(1),
  store: z.enum(["ios", "android", "stripe", "app_store", "play_store"]).optional(),
});

export function createApp(deps: AppDeps): Express {
  const { game, auth, tokens, iap, catalog, clan, webhookSecret } = deps;
  const app = express();
  // Capture the raw body so the IAP webhook can verify its HMAC signature.
  app.use(
    express.json({
      limit: "16kb",
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(rateLimiter(120, 60_000));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Published gacha drop rates — regulatory transparency requirement (§12.2).
  app.get("/gacha/rates", (_req, res) => {
    const cfg = game.getConfig().gacha;
    const { mythic, epic, rare } = cfg.rates;
    res.json({
      rates: { mythic, epic, rare, common: Math.max(0, 1 - mythic - epic - rare) },
      pity: { epic: cfg.epicPity, mythic: cfg.mythicPity },
      costSpiritTokens: cfg.costSpiritTokens,
    });
  });

  // ---- Auth (§11.2) ----------------------------------------------------

  app.post(
    "/auth/register",
    h(async (req, res) => {
      const { name, deviceId } = registerBody.parse(req.body ?? {});
      const result = await auth.register(name, deviceId);
      setAuthCookies(res, result);
      res.status(201).json({
        player: publicPlayer(result.player),
        deviceSecret: result.deviceSecret,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    }),
  );

  app.post(
    "/auth/login",
    h(async (req, res) => {
      const { deviceId, deviceSecret } = loginBody.parse(req.body ?? {});
      const result = await auth.login(deviceId, deviceSecret);
      setAuthCookies(res, result);
      res.json({ playerId: result.playerId, accessToken: result.accessToken, refreshToken: result.refreshToken });
    }),
  );

  app.post(
    "/auth/refresh",
    h(async (req, res) => {
      const body = refreshBody.parse(req.body ?? {});
      const token = body.refreshToken ?? readCookie(req, REFRESH_COOKIE);
      if (!token) throw new GameError("UNAUTHENTICATED", "missing refresh token", 401);
      const result = await auth.refresh(token);
      setAuthCookies(res, result);
      res.json({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    }),
  );

  app.post(
    "/auth/logout",
    h(async (req, res) => {
      const playerId = await authenticate(req, tokens);
      await auth.logout(playerId);
      clearAuthCookies(res);
      res.json({ ok: true });
    }),
  );

  // ---- Game ------------------------------------------------------------

  app.get(
    "/me",
    h(async (req, res) => {
      const player = await game.getPlayer(await authenticate(req, tokens));
      res.json({ player: publicPlayer(player) });
    }),
  );

  app.post(
    "/spin",
    h(async (req, res) => {
      const { betMultiplier } = spinBody.parse(req.body ?? {});
      const { outcome, player } = await game.spin(await authenticate(req, tokens), betMultiplier);
      res.json({ outcome, player: publicPlayer(player) });
    }),
  );

  app.post(
    "/build",
    h(async (req, res) => {
      const { buildingIndex } = buildBody.parse(req.body ?? {});
      const result = await game.build(await authenticate(req, tokens), buildingIndex);
      res.json({ ...result, player: publicPlayer(result.player) });
    }),
  );

  app.get(
    "/attack/candidates",
    h(async (req, res) => {
      res.json({ candidates: await game.attackCandidates(await authenticate(req, tokens)) });
    }),
  );

  app.post(
    "/attack",
    h(async (req, res) => {
      const { targetId, buildingIndex } = attackBody.parse(req.body ?? {});
      const result = await game.attack(await authenticate(req, tokens), targetId, buildingIndex);
      res.json({ ...result, player: publicPlayer(result.player) });
    }),
  );

  app.post(
    "/raid",
    h(async (req, res) => {
      const { picks } = raidBody.parse(req.body ?? {});
      const result = await game.raidDig(await authenticate(req, tokens), picks);
      res.json({ ...result, player: publicPlayer(result.player) });
    }),
  );

  app.post(
    "/gacha/pull",
    h(async (req, res) => {
      const result = await game.summon(await authenticate(req, tokens));
      res.json(result);
    }),
  );

  // ---- Monetization (§8) ----------------------------------------------

  // Shop catalog — what each product grants is server-defined.
  app.get("/shop", (_req, res) => {
    res.json({ products: catalog.list() });
  });

  // Client-driven redemption: validate the store receipt, then grant once.
  app.post(
    "/iap/redeem",
    h(async (req, res) => {
      const playerId = await authenticate(req, tokens);
      const { platform, productId, receipt } = redeemBody.parse(req.body ?? {});
      const result = await iap.redeem(playerId, platform, productId, receipt);
      const player = await game.getPlayer(playerId);
      res.json({ ...result, player: publicPlayer(player) });
    }),
  );

  // Server-to-server webhook (RevenueCat-style, §8.1). HMAC-verified, idempotent.
  app.post(
    "/iap/webhook",
    h(async (req, res) => {
      const sig = req.header("x-webhook-signature");
      const raw = (req as RawBodyRequest).rawBody;
      if (!sig || !raw || !verifyWebhookSignature(raw, sig, webhookSecret)) {
        throw new GameError("BAD_SIGNATURE", "invalid webhook signature", 401);
      }
      const body = webhookBody.parse(req.body ?? {});
      const purchaseTypes = ["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE", "RENEWAL"];
      if (!purchaseTypes.includes(body.type)) {
        res.json({ ignored: true, type: body.type });
        return;
      }
      const result = await iap.fulfil(body.app_user_id, storeToPlatform(body.store), body.product_id, body.transaction_id);
      res.json({ ok: true, ...result });
    }),
  );

  // ---- Clans (§7.2) ----------------------------------------------------

  app.get(
    "/clans",
    h(async (_req, res) => {
      res.json({ clans: await clan.listClans() });
    }),
  );

  app.post(
    "/clans",
    h(async (req, res) => {
      const playerId = await authenticate(req, tokens);
      const { name, tag } = createClanBody.parse(req.body ?? {});
      res.status(201).json({ clan: await clan.createClan(playerId, name, tag) });
    }),
  );

  app.post(
    "/clans/leave",
    h(async (req, res) => {
      const playerId = await authenticate(req, tokens);
      await clan.leaveClan(playerId);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/clans/war/declare",
    h(async (req, res) => {
      const playerId = await authenticate(req, tokens);
      res.json({ war: await clan.declareWar(playerId) });
    }),
  );

  app.get(
    "/clans/war",
    h(async (req, res) => {
      const playerId = await authenticate(req, tokens);
      res.json({ war: await clan.warStatus(playerId) });
    }),
  );

  app.get(
    "/clans/:id",
    h(async (req, res) => {
      res.json({ clan: await clan.getClan(String(req.params.id)) });
    }),
  );

  app.post(
    "/clans/:id/join",
    h(async (req, res) => {
      const playerId = await authenticate(req, tokens);
      res.json({ clan: await clan.joinClan(playerId, String(req.params.id)) });
    }),
  );

  // Global leaderboard (§7.2) — Redis sorted set when configured.
  app.get(
    "/leaderboard",
    h(async (req, res) => {
      const top = Math.min(100, Math.max(1, Number(req.query.top ?? 10) || 10));
      res.json({ leaderboard: await game.leaderboardTop(top) });
    }),
  );

  app.get(
    "/leaderboard/me",
    h(async (req, res) => {
      res.json({ rank: await game.leaderboardRank(await authenticate(req, tokens)) });
    }),
  );

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "no such route" } });
  });

  // Error handler — maps domain & validation errors to clean JSON.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION", message: "invalid request", issues: err.issues } });
      return;
    }
    if (err instanceof GameError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    const message = err instanceof Error ? err.message : "unknown error";
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: { code: "ERROR", message } });
  });

  return app;
}

/** Map a RevenueCat/store identifier to our Platform union. */
function storeToPlatform(store: string | undefined): "ios" | "android" | "stripe" {
  switch (store) {
    case "play_store":
    case "android":
      return "android";
    case "stripe":
      return "stripe";
    default:
      return "ios";
  }
}

/** Strip server-only fields (predetermined raid spots!) before sending to the client. */
function publicPlayer(p: Player) {
  return {
    id: p.id,
    name: p.name,
    spins: p.spins,
    coins: p.coins,
    spiritTokens: p.spiritTokens,
    gems: p.gems,
    shields: p.shields,
    currentIsland: p.currentIsland,
    islands: p.islands,
    companions: p.companions,
    clanId: p.clanId,
    pendingAttack: p.pendingAttack ? { expiresAt: p.pendingAttack.expiresAt } : null,
    pendingRaid: p.pendingRaid
      ? {
          targetId: p.pendingRaid.targetId,
          picks: p.pendingRaid.picks,
          spots: p.pendingRaid.spots.length,
          expiresAt: p.pendingRaid.expiresAt,
        }
      : null,
  };
}
