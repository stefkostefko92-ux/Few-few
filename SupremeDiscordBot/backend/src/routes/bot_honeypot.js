// backend/src/routes/bot_honeypot.js
// v52 — капан за спам ботове, endpoint-ите за бота (x-bot-secret). Правата на
// човека (Manage Server за /honeypot) се проверяват в бота; правилата за
// записа — в lib/honeypot.js, същите като за таблото.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { getHoneypot, saveHoneypot, publicHoneypot, honeypotSchema } from "../lib/honeypot.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use("/honeypot", requireBotSecret);
const SNOWFLAKE = /^\d{17,20}$/;
const badServer = (req, res) => !SNOWFLAKE.test(String(req.params.serverId)) && res.status(400).json({ error: "invalid serverId" });

router.get("/honeypot/:serverId", async (req, res, next) => {
  if (badServer(req, res)) return;
  try { res.json(publicHoneypot(await getHoneypot(req.params.serverId))); } catch (err) { next(err); }
});

// /honeypot setup и /honeypot disable от Discord.
router.put("/honeypot/:serverId", async (req, res, next) => {
  if (badServer(req, res)) return;
  const { actorId, ...body } = req.body || {};
  const parsed = honeypotSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const out = await saveHoneypot(req.params.serverId, parsed.data);
    if (!out.ok) return res.status(400).json({ error: out.code });
    await writeAudit({
      actorId: SNOWFLAKE.test(String(actorId)) ? String(actorId) : null,
      action: "HONEYPOT_UPDATED", serverId: req.params.serverId, targetId: req.params.serverId,
      metadata: { keys: Object.keys(parsed.data), via: "discord" },
    });
    res.json({ config: publicHoneypot(out.config), previous: publicHoneypot(out.previous) });
  } catch (err) { next(err); }
});

// Ботът публикува/махна предупреждението в канала.
router.patch("/honeypot/:serverId/warning", async (req, res, next) => {
  if (badServer(req, res)) return;
  const { messageId, channelId } = req.body || {};
  if (messageId !== null && !SNOWFLAKE.test(String(messageId))) return res.status(400).json({ error: "messageId must be a snowflake or null" });
  try {
    // Само ако каналът още е същият — иначе закъснял отговор за стария канал
    // би записал чуждо съобщение върху новия.
    const where = { serverId: req.params.serverId, ...(SNOWFLAKE.test(String(channelId)) ? { channelId: String(channelId) } : {}) };
    const r = await prisma.honeypotConfig.updateMany({ where, data: { warningMessageId: messageId } });
    res.json({ ok: r.count > 0 });
  } catch (err) { next(err); }
});

// Някой падна в капана и действието мина → брояч (за предупреждението и таблото).
router.post("/honeypot/:serverId/caught", async (req, res, next) => {
  if (badServer(req, res)) return;
  try {
    const r = await prisma.honeypotConfig.update({
      where: { serverId: req.params.serverId },
      data: { caughtCount: { increment: 1 }, lastCaughtAt: new Date() },
      select: { caughtCount: true },
    });
    res.json({ caughtCount: r.caughtCount });
  } catch (err) {
    if (err?.code === "P2025") return res.status(404).json({ error: "NOT_CONFIGURED" });
    next(err);
  }
});

export default router;
