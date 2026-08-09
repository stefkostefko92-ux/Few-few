// backend/src/routes/topgg.js
// top.gg vote webhook — приема гласове за бота от bot листинга.
// Активира се при листване: top.gg → Edit → Webhooks → URL:
//   https://supremebot.carbonstealth.eu/api/topgg/webhook
// + Authorization secret (същият в env TOPGG_WEBHOOK_AUTH).
//
// Засега само ЗАПИСВАМЕ гласа (audit trail + брояч за социално доказателство).
// Перк за гласувалите (напр. 12-24h Premium за сървър на гласувалия) е
// продуктово решение на собственика — TODO маркиран по-долу; данните вече
// се събират, така че перкът може да е ретроактивен.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { timingSafeEqual } from "crypto";

const router = Router();

const voteSchema = z.object({
  bot: z.string().optional(),
  user: z.string().min(1),
  type: z.enum(["upvote", "test"]),
  isWeekend: z.boolean().optional(),
  query: z.union([z.string(), z.record(z.string())]).optional(),
});


/** Constant-time сравнение на два низа (различната дължина също не изтича). */
function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Сравняваме bb със себе си, за да отнеме сравнимо време, и връщаме false.
    timingSafeEqual(bb, bb);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

// ─── POST /api/topgg/webhook ─────────────────────────────────────────────────
router.post("/webhook", async (req, res, next) => {
  const secret = process.env.TOPGG_WEBHOOK_AUTH;
  if (!secret) return res.status(503).json({ error: "top.gg webhook is not configured." });
  // top.gg праща тайната в Authorization header-а точно както е въведена.
  // Сравнението е constant-time: наивното `!==` изтича дължина и позиция на
  // първото разминаване по време, а тайната е познаваема отвън (webhook се
  // вика от чужд хост). Същият модел като requireBotSecret.
  if (!timingSafeEqualStr(req.headers.authorization, secret)) {
    return res.status(403).json({ error: "Invalid authorization" });
  }

  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid vote payload" });
  const vote = parsed.data;

  try {
    await prisma.auditLog.create({
      data: {
        actorId: null, // гласувалият може да не е наш User — пазим ID-то в metadata
        actorTag: "TOPGG",
        action: vote.type === "test" ? "TOPGG_VOTE_TEST" : "TOPGG_VOTE",
        targetId: vote.user,
        metadata: {
          userId: vote.user,
          isWeekend: vote.isWeekend ?? false,
          votedAt: new Date().toISOString(),
        },
      },
    });

    // TODO(owner): перк за гласувалия — напр. временен Premium на сървър,
    // където гласувалият е админ, или козметичен badge. Гласовете вече се
    // записват, така че решението може да е ретроактивно.

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/topgg/votes/count ──────────────────────────────────────────────
// Публичен брояч (за социално доказателство на landing-а при желание).
router.get("/votes/count", async (_req, res, next) => {
  try {
    const count = await prisma.auditLog.count({ where: { action: "TOPGG_VOTE" } });
    res.json({ votes: count });
  } catch (err) {
    next(err);
  }
});

export default router;
