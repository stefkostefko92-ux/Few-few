// backend/src/routes/canned.js
// Готовите отговори (v29) — ТАБЛОТО.
//
// ЗАЩО (одит 09.08.2026): функцията беше 2/3 — ботът я ползва (/tag),
// bot_v18 маршрутите я сервират НА БОТА, а собственикът нямаше НИКАКЪВ изглед:
// не вижда какви текстове ботът праща от негово име, не може да ги поправи или
// изтрие без Discord staff достъп. Купена, но недоставена.
//
// Валидациите повтарят ботските (kebab-case ≤32, съдържание ≤1500) — правилото
// е едно, повърхностите са две, и двете го налагат server-side.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { getServerTier } from "../lib/premium.js";

const router = Router();
router.use(requireAuth, loadUser);

const TAG_LIMIT_FREE = 50;
const TAG_LIMIT_PREMIUM = 200;

const tagSchema = z.object({
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,32}$/,
    "Name must be kebab-case, ≤32 chars (a-z, 0-9, -)."),
  content: z.string().trim().min(1).max(1500),
});

router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const tags = await prisma.cannedResponse.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { name: "asc" },
    });
    res.json(tags);
  } catch (err) { next(err); }
});

router.post("/:serverId", requireServerAdmin, async (req, res, next) => {
  const parsed = tagSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const count = await prisma.cannedResponse.count({ where: { serverId: req.params.serverId } });
    const { isPremium } = await getServerTier(req.params.serverId);
    const limit = isPremium ? TAG_LIMIT_PREMIUM : TAG_LIMIT_FREE;
    if (count >= limit) {
      return res.status(400).json({ error: `Tag limit reached (${limit}). Delete an existing tag first.` });
    }
    const tag = await prisma.cannedResponse.create({
      data: {
        serverId: req.params.serverId,
        name: parsed.data.name,
        content: parsed.data.content,
        createdBy: req.user.id,
      },
    });
    res.status(201).json(tag);
  } catch (err) {
    if (err?.code === "P2002") return res.status(400).json({ error: "A tag with that name already exists." });
    next(err);
  }
});

router.put("/:serverId/:id", requireServerAdmin, async (req, res, next) => {
  const parsed = tagSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    // updateMany + serverId в where: мултинаемният гард е в САМАТА заявка,
    // не в отделна проверка преди нея (иначе TOCTOU + чужд ред по id).
    const r = await prisma.cannedResponse.updateMany({
      where: { id: req.params.id, serverId: req.params.serverId },
      data: parsed.data,
    });
    if (r.count === 0) return res.status(404).json({ error: "Tag not found" });
    res.json(await prisma.cannedResponse.findUnique({ where: { id: req.params.id } }));
  } catch (err) {
    if (err?.code === "P2002") return res.status(400).json({ error: "A tag with that name already exists." });
    next(err);
  }
});

router.delete("/:serverId/:id", requireServerAdmin, async (req, res, next) => {
  try {
    const r = await prisma.cannedResponse.deleteMany({
      where: { id: req.params.id, serverId: req.params.serverId },
    });
    if (r.count === 0) return res.status(404).json({ error: "Tag not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
