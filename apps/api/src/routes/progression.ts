import { Router } from "express";
import { z } from "zod";
import { isGameKey } from "@aso/shared";
import { asyncHandler, badRequest, forbidden, unauthorized } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { env } from "../env.js";
import {
  claimDaily,
  ensureQuests,
  leaderboard,
  profileProgress,
  recordMatchResult,
} from "../progression/service.js";
import { prisma } from "@aso/db";

export const progressionRouter: Router = Router();

/** GET /api/progression/leaderboard/:game — public top-N. */
progressionRouter.get(
  "/leaderboard/:game",
  asyncHandler(async (req, res) => {
    const game = String(req.params.game ?? "").toUpperCase();
    if (!isGameKey(game)) throw badRequest("unknown_game", "Непозната игра");
    res.json({ game, entries: await leaderboard(game) });
  }),
);

/**
 * POST /api/progression/internal/match — called by the realtime server after a
 * match to advance quests + leaderboards. Authenticated by a shared secret, not
 * a user JWT (service-to-service).
 */
const matchSchema = z.object({
  userId: z.string().min(1),
  game: z.string(),
  won: z.boolean(),
  rating: z.number().int(),
  displayName: z.string().min(1),
});

progressionRouter.post(
  "/internal/match",
  asyncHandler(async (req, res) => {
    const provided = req.headers["x-internal-secret"];
    if (provided !== env.INTERNAL_API_SECRET) throw forbidden("Bad internal secret");
    const input = matchSchema.parse(req.body);
    if (!isGameKey(input.game)) throw badRequest("unknown_game", "Непозната игра");
    await recordMatchResult({ ...input, game: input.game });
    res.json({ ok: true });
  }),
);

// Everything below requires a signed-in user.
progressionRouter.use(requireAuth);

/** POST /api/progression/daily — claim the daily login reward. */
progressionRouter.post(
  "/daily",
  asyncHandler(async (req, res) => {
    res.json(await claimDaily(req.user!.sub));
  }),
);

/** GET /api/progression/quests — this period's quests for the user. */
progressionRouter.get(
  "/quests",
  asyncHandler(async (req, res) => {
    res.json({ quests: await ensureQuests(req.user!.sub) });
  }),
);

/** GET /api/progression/me — level/XP progress summary. */
progressionRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw unauthorized();
    const progress = profileProgress(user.xp);
    res.json({ xp: user.xp, ...progress });
  }),
);
