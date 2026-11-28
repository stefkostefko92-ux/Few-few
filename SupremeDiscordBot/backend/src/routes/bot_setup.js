// backend/src/routes/bot_setup.js
// `/setup wizard` → чернова на тикет панел (28.11.2026). Досега съветникът само показваше
// избраното и пращаше към таблото — нищо не се пазеше. Сега последната стъпка прави
// панел с избраните роли, категория и лог канал. Панелът НЕ се публикува: текстът се
// оправя в таблото, а публикуването е там или с `/panel spawn`.
//
// Ботът проверява Manage Server на човека, преди да стигне дотук; тук е само записът.
// Лимитът на плана е същият като в таблото (routes/panels.js) и е атомарен.
import { Router } from "express";
import { z } from "zod/v3";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { getServerTier } from "../lib/premium.js";
import { createWithinLimit } from "../lib/withinLimit.js";
import { writeAudit } from "../lib/auditLog.js";
import { BASE_PANEL_LIMIT, PREMIUM_PANEL_LIMIT } from "./panels.js";

const router = Router();
const SNOWFLAKE = /^\d{17,20}$/;
const snowflake = z.string().regex(SNOWFLAKE);

const wizardSchema = z.object({
  userId: snowflake,
  roleIds: z.array(snowflake).max(5).default([]),
  categoryId: snowflake.nullable().optional(),
  logChannelId: snowflake.nullable().optional(),
  // Текстовете идват от бота на езика на сървъра; дължините са като в таблото.
  name: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(256),
  description: z.string().max(4096).optional(),
  buttonLabel: z.string().trim().min(1).max(80),
});

router.post("/setup-wizard/:serverId", requireBotSecret, async (req, res, next) => {
  try {
    const { serverId } = req.params;
    if (!SNOWFLAKE.test(serverId)) return res.status(400).json({ error: "Invalid server id" });
    const parsed = wizardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const d = parsed.data;

    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { id: true, botRemovedAt: true } });
    if (!server || server.botRemovedAt) return res.status(404).json({ error: "Server not found" });

    // @everyone има ID-то на сървъра. Като роля за поддръжка би отворил ВСИЧКИ тикети за всички.
    const supportRoleIds = [...new Set(d.roleIds)].filter((id) => id !== serverId);

    const { isPremium } = await getServerTier(serverId);
    const limit = isPremium ? PREMIUM_PANEL_LIMIT : BASE_PANEL_LIMIT;
    const created = await createWithinLimit({
      model: "panel",
      where: { serverId },
      limit,
      create: (tx) => tx.panel.create({
        data: {
          serverId,
          name: d.name,
          title: d.title,
          description: d.description,
          supportRoleIds,
          categoryOpenId: d.categoryId ?? null,
          logChannelId: d.logChannelId ?? null,
          buttons: { create: [{ label: d.buttonLabel, style: "PRIMARY" }] },
        },
        select: { id: true, name: true },
      }),
    });
    if (!created.ok) return res.status(403).json({ error: `Panel limit reached (${limit})`, code: "LIMIT_REACHED", limit });

    await writeAudit({
      actorId: d.userId,
      serverId,
      action: "PANEL_CREATED",
      targetId: created.row.id,
      metadata: { name: created.row.name, via: "setup-wizard" },
    });
    res.status(201).json({ id: created.row.id, name: created.row.name });
  } catch (err) {
    next(err);
  }
});

export default router;
