// backend/src/routes/honeypot.js
// v52 — канал-стръв за спам ботове (/bait), таблото (Discord OAuth + права в
// сървъра). Името „honeypot“ на пътя и таблицата е вътрешно, от миграция v52.
// Безплатно за всички планове: защитата от спам не е Premium.
import { Router } from "express";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { getHoneypot, saveHoneypot, publicHoneypot, honeypotSchema } from "../lib/honeypot.js";
import { writeAudit } from "../lib/auditLog.js";
import { notifyBot } from "../services/botNotifier.js";

const router = Router();
router.use(requireAuth, loadUser);

const ERRORS = {
  CHANNEL_REQUIRED: "Pick the bait channel before turning the bait on.",
  LOG_IS_TRAP: "The log channel can't be the bait channel itself.",
};

router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try { res.json(publicHoneypot(await getHoneypot(req.params.serverId))); } catch (err) { next(err); }
});

router.put("/:serverId", requireServerAdmin, async (req, res, next) => {
  const { serverId } = req.params;
  const parsed = honeypotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const out = await saveHoneypot(serverId, parsed.data);
    if (!out.ok) return res.status(400).json({ error: ERRORS[out.code], code: out.code });
    await writeAudit({ actorId: req.user.id, action: "HONEYPOT_UPDATED", serverId, targetId: serverId, metadata: { keys: Object.keys(parsed.data), via: "dashboard" } });
    // Ботът кешира настройките и пази предупреждението в канала — кажи му.
    notifyBot("HONEYPOT_CHANGED", {
      serverId,
      previous: { channelId: out.previous.channelId || null, warningMessageId: out.previous.warningMessageId || null },
    }).catch(() => {});
    res.json(publicHoneypot(out.config));
  } catch (err) { next(err); }
});

export default router;
