import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { GameError } from "../errors.js";
import type { GameService } from "../services/gameService.js";

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

/** Resolves the acting player from the x-player-id header (prototype auth). */
function requirePlayerId(req: Request): string {
  const id = req.header("x-player-id");
  if (!id) throw new GameError("UNAUTHENTICATED", "missing x-player-id header", 401);
  return id;
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
const createPlayerBody = z.object({ name: z.string().min(1).max(40).default("Kannushi") });

export function createApp(game: GameService): Express {
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

  app.post(
    "/players",
    h((req, res) => {
      const { name } = createPlayerBody.parse(req.body ?? {});
      const player = game.createPlayer(name);
      res.status(201).json({ player: publicPlayer(player) });
    }),
  );

  app.get(
    "/me",
    h((req, res) => {
      const player = game.getPlayer(requirePlayerId(req));
      res.json({ player: publicPlayer(player) });
    }),
  );

  app.post(
    "/spin",
    h((req, res) => {
      const { betMultiplier } = spinBody.parse(req.body ?? {});
      const { outcome, player } = game.spin(requirePlayerId(req), betMultiplier);
      res.json({ outcome, player: publicPlayer(player) });
    }),
  );

  app.post(
    "/build",
    h((req, res) => {
      const { buildingIndex } = buildBody.parse(req.body ?? {});
      const result = game.build(requirePlayerId(req), buildingIndex);
      res.json({ ...result, player: publicPlayer(result.player) });
    }),
  );

  app.get(
    "/attack/candidates",
    h((req, res) => {
      res.json({ candidates: game.attackCandidates(requirePlayerId(req)) });
    }),
  );

  app.post(
    "/attack",
    h((req, res) => {
      const { targetId, buildingIndex } = attackBody.parse(req.body ?? {});
      const result = game.attack(requirePlayerId(req), targetId, buildingIndex);
      res.json({ ...result, player: publicPlayer(result.player) });
    }),
  );

  app.post(
    "/raid",
    h((req, res) => {
      const { picks } = raidBody.parse(req.body ?? {});
      const result = game.raidDig(requirePlayerId(req), picks);
      res.json({ ...result, player: publicPlayer(result.player) });
    }),
  );

  app.post(
    "/gacha/pull",
    h((req, res) => {
      const result = game.summon(requirePlayerId(req));
      res.json(result);
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
    // PlayerNotFound and similar surface as 404/400; default to 400 to avoid leaking 500s in the prototype.
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: { code: "ERROR", message } });
  });

  return app;
}

/** Strip server-only fields (predetermined raid spots!) before sending to the client. */
function publicPlayer(p: ReturnType<GameService["getPlayer"]>) {
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
    // Never expose predetermined spot values — only that a raid is open and how many picks.
    pendingRaid: p.pendingRaid
      ? { targetId: p.pendingRaid.targetId, picks: p.pendingRaid.picks, spots: p.pendingRaid.spots.length, expiresAt: p.pendingRaid.expiresAt }
      : null,
  };
}
