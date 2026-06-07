import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { GameError } from "../errors.js";
import type { Player } from "../domain/types.js";
import type { GameService } from "../services/gameService.js";
import type { AuthService, AuthTokens } from "../auth/authService.js";
import type { TokenService } from "../auth/tokens.js";

export interface AppDeps {
  game: GameService;
  auth: AuthService;
  tokens: TokenService;
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

export function createApp(deps: AppDeps): Express {
  const { game, auth, tokens } = deps;
  const app = express();
  app.use(express.json({ limit: "16kb" }));
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
