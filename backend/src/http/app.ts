import { timingSafeEqual } from "node:crypto";
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
import type { LiveOpsStore } from "../config/liveOpsStore.js";
import { verifyWebhookSignature } from "../monetization/receipts.js";

export interface AppDeps {
  game: GameService;
  auth: AuthService;
  tokens: TokenService;
  iap: IapService;
  catalog: Catalog;
  clan: ClanService;
  /** Live-tunable LiveOps config store, mutated by the admin endpoints (§6.2). */
  liveOps: LiveOpsStore;
  /** Admin API key for /admin/* routes. Omit to disable the admin surface. */
  adminKey?: string;
  /** HMAC secret for the IAP webhook (RevenueCat-style, §8.1). */
  webhookSecret: string;
  /** Allowed CORS origins for the external web-shop/demo (§8.1). Omit for same-origin only. */
  corsOrigins?: string[];
  /**
   * DEV ONLY: when set, exposes GET /iap/dev-receipt to mint a sandbox receipt
   * so the web demo can exercise the purchase flow without store integration.
   * Never enable in production — it would let anyone forge purchases.
   */
  devReceipt?: (productId: string) => string;
  /** Express `trust proxy` hop count, so req.ip is the real client behind an LB. */
  trustProxy?: number;
  /** Readiness probe: checks backing stores (Postgres/Redis) for /readyz. */
  readiness?: () => Promise<{ ok: boolean; checks: Record<string, boolean> }>;
}

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * CORS for the external web-shop/demo (§8.1, §11.3 — "CORS whitelist, никога *
 * на prod"). Reflects only whitelisted origins and allows credentials so the
 * httpOnly auth cookie works cross-origin.
 */
function corsMiddleware(origins: string[]) {
  const allowed = new Set(origins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (origin && allowed.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "authorization, content-type, x-admin-key");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

/**
 * Baseline HTTP security headers (no external dependency). Covers the essentials
 * helmet would set: no MIME sniffing, deny framing, conservative referrer, and
 * HSTS so browsers pin TLS. Set on every response.
 */
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

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
  const { game, auth, tokens, iap, catalog, clan, liveOps, webhookSecret } = deps;
  const app = express();
  app.disable("x-powered-by");
  if (deps.trustProxy && deps.trustProxy > 0) app.set("trust proxy", deps.trustProxy);
  app.use(securityHeaders);
  if (deps.corsOrigins && deps.corsOrigins.length > 0) {
    app.use(corsMiddleware(deps.corsOrigins));
  }
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

  // Liveness: process is up (cheap, no dependency checks). /health kept as alias.
  const liveness = (_req: Request, res: Response) => res.json({ status: "ok", time: new Date().toISOString() });
  app.get("/healthz", liveness);
  app.get("/health", liveness);

  // Readiness: backing stores reachable. Returns 503 so a load balancer drains
  // a replica that can't serve (and during shutdown once stores are closed).
  app.get("/readyz", (_req, res) => {
    if (!deps.readiness) return void res.json({ status: "ready", checks: {} });
    void deps.readiness().then(
      (r) => res.status(r.ok ? 200 : 503).json({ status: r.ok ? "ready" : "not_ready", checks: r.checks }),
      () => res.status(503).json({ status: "not_ready" }),
    );
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

  // DEV ONLY sandbox receipt minter (gated by deps.devReceipt).
  if (deps.devReceipt) {
    const mint = deps.devReceipt;
    app.get(
      "/iap/dev-receipt",
      h((req, res) => {
        const productId = String(req.query.productId ?? "");
        if (!catalog.get(productId)) throw new GameError("UNKNOWN_PRODUCT", "no such product", 404);
        res.json({ receipt: mint(productId) });
      }),
    );
  }

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

  // ---- Admin / LiveOps (§6.2, §11.2) -----------------------------------
  // Gated by a shared admin key; lets ops retune the economy without a release.
  const requireAdmin = (req: Request): void => {
    const provided = req.header("x-admin-key") ?? "";
    const expected = deps.adminKey ?? "";
    const ok =
      expected.length > 0 &&
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) throw new GameError("FORBIDDEN", "admin key required", 403);
  };

  app.get(
    "/admin/liveops",
    h((req, res) => {
      requireAdmin(req);
      res.json({ config: liveOps.get() });
    }),
  );

  app.put(
    "/admin/liveops",
    h(async (req, res) => {
      requireAdmin(req);
      // replace() validates with the LiveOps zod schema; invalid → ZodError → 400.
      const config = await liveOps.replace(req.body);
      res.json({ config });
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

  // Error handler — maps domain, validation, and known Prisma errors to clean
  // JSON. Unmapped errors are logged server-side and returned as a generic 500,
  // never echoing internal messages (which can leak schema/query details).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path, message: i.message }));
      res.status(400).json({ error: { code: "VALIDATION", message: "invalid request", issues } });
      return;
    }
    if (err instanceof GameError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    // Domain "not found" repos throw *NotFoundError — map by name, not message.
    if (err instanceof Error && err.name.endsWith("NotFoundError")) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "resource not found" } });
      return;
    }
    // Known Prisma error codes (duck-typed to avoid importing the client here).
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : undefined;
    if (code === "P2002") {
      res.status(409).json({ error: { code: "CONFLICT", message: "resource already exists" } });
      return;
    }
    if (code === "P2025") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "resource not found" } });
      return;
    }
    if (code === "P2024" || code === "P2028" || code === "P2034") {
      res.status(503).json({ error: { code: "UNAVAILABLE", message: "service busy, please retry" } });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("unhandled error:", err);
    res.status(500).json({ error: { code: "INTERNAL", message: "internal server error" } });
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
