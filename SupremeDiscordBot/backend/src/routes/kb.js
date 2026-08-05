// backend/src/routes/kb.js
// v32 — Knowledge Base dashboard CRUD (session-authed). Staff write short
// articles with keywords; the bot suggests the best match on new tickets via
// the bot-secret endpoints in routes/bot_v18.js (GET .../suggest, POST
// .../feedback) — those are the ONLY endpoints the bot calls; everything
// here is dashboard-only and scoped to req.params.serverId (IDOR guard via
// requireServerAdmin + explicit serverId filters on every query).

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { getServerTier } from "../lib/premium.js";

const TITLE_MAX = 120;
const CONTENT_MAX = 4000;
const KEYWORDS_MAX = 10;
const KEYWORD_LEN_MAX = 40;

const keywordsSchema = z
  .array(z.string().min(1).max(KEYWORD_LEN_MAX))
  .max(KEYWORDS_MAX)
  .default([])
  .transform((arr) =>
    // Normalize + de-dupe — lowercase, trimmed, unique. Keeps the KbArticle.keywords
    // invariant (≤10, lowercase) true regardless of what the client sends.
    [...new Set(arr.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, KEYWORDS_MAX)
  );

const createArticleSchema = z.object({
  title: z.string().min(1).max(TITLE_MAX),
  content: z.string().min(1).max(CONTENT_MAX),
  keywords: keywordsSchema,
  enabled: z.boolean().default(true),
});

const updateArticleSchema = createArticleSchema.partial();

const router = Router();
router.use(requireAuth, loadUser);

// GET /api/kb/:serverId — list all articles for a server
router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const articles = await prisma.kbArticle.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { updatedAt: "desc" },
    });
    res.json(articles);
  } catch (err) { next(err); }
});

// POST /api/kb/:serverId — create (gated by plan limit: Free 3 / Premium 50)
router.post("/:serverId", requireServerAdmin, async (req, res, next) => {
  const parsed = createArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  const serverId = req.params.serverId;
  try {
    const { limits } = await getServerTier(serverId);
    const count = await prisma.kbArticle.count({ where: { serverId } });
    if (count >= limits.kbArticles) {
      return res.status(403).json({
        error: `Knowledge Base article limit reached (${limits.kbArticles}). Upgrade to Premium for more.`,
        code: "LIMIT_REACHED",
      });
    }
    const article = await prisma.kbArticle.create({
      data: { ...parsed.data, serverId, createdBy: req.user.id },
    });
    res.status(201).json(article);
  } catch (err) { next(err); }
});

// PUT /api/kb/:serverId/:id — update
router.put("/:serverId/:id", requireServerAdmin, async (req, res, next) => {
  const parsed = updateArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  try {
    const { count } = await prisma.kbArticle.updateMany({
      where: { id: req.params.id, serverId: req.params.serverId },
      data: parsed.data,
    });
    if (!count) return res.status(404).json({ error: "Article not found" });
    const article = await prisma.kbArticle.findUnique({ where: { id: req.params.id } });
    res.json(article);
  } catch (err) { next(err); }
});

// POST /api/kb/:serverId/:id/toggle — flip enabled without a full edit round-trip
router.post("/:serverId/:id/toggle", requireServerAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.kbArticle.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      select: { id: true, enabled: true },
    });
    if (!existing) return res.status(404).json({ error: "Article not found" });
    const article = await prisma.kbArticle.update({
      where: { id: existing.id },
      data: { enabled: !existing.enabled },
    });
    res.json(article);
  } catch (err) { next(err); }
});

// DELETE /api/kb/:serverId/:id
router.delete("/:serverId/:id", requireServerAdmin, async (req, res, next) => {
  try {
    const { count } = await prisma.kbArticle.deleteMany({
      where: { id: req.params.id, serverId: req.params.serverId },
    });
    if (!count) return res.status(404).json({ error: "Article not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
