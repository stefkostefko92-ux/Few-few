import { Router } from "express";
import { prisma } from "@aso/db";
import {
  responsibleSettingsSchema,
  selfExcludeSchema,
  selfExclusionActive,
  selfExclusionEnd,
  type ResponsibleSettingsView,
} from "@aso/shared";
import { asyncHandler, unauthorized } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { clearAuthCookies } from "../auth/tokens.js";
import { eraseUser } from "../account/erase.js";

export const accountRouter: Router = Router();

accountRouter.use(requireAuth);

/**
 * GET /api/account/export — GDPR data portability. Returns everything we hold
 * about the signed-in player as a downloadable JSON document.
 */
accountRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const id = req.user!.sub;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        ratings: true,
        inventory: true,
        quests: true,
        purchases: { include: { product: { select: { sku: true, priceCents: true } } } },
        oauth: { select: { provider: true, createdAt: true } },
        matches: { select: { matchId: true, seat: true, result: true, mmrDelta: true } },
        notifications: { select: { type: true, data: true, createdAt: true } },
        friendsSent: { select: { addresseeId: true, status: true, createdAt: true } },
        friendsReceived: { select: { requesterId: true, status: true, createdAt: true } },
        achievements: { select: { key: true, unlockedAt: true } },
      },
    });
    if (!user || user.deletedAt) throw unauthorized();

    const { passwordHash: _pw, ...rest } = user;
    const data = {
      exportedAt: new Date().toISOString(),
      account: { ...rest, chips: user.chips.toString() },
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="aso-data-${id}.json"`);
    res.end(JSON.stringify(data, null, 2));
  }),
);

/**
 * POST /api/account/delete — GDPR right to erasure. We anonymize the account
 * (rather than hard-delete) so financial purchase records survive in
 * unidentifiable form; the row is then unusable for login. Cookies are cleared.
 * Самата анонимизация живее в `eraseUser` (обща с админското изтриване).
 */
accountRouter.post(
  "/delete",
  asyncHandler(async (req, res) => {
    const id = req.user!.sub;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw unauthorized();

    await eraseUser(id);
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

const RESPONSIBLE_SELECT = {
  deletedAt: true,
  realityCheckMinutes: true,
  dailyLimitMinutes: true,
  selfExcludedUntil: true,
} as const;

function toResponsibleView(u: {
  realityCheckMinutes: number;
  dailyLimitMinutes: number | null;
  selfExcludedUntil: Date | null;
}): ResponsibleSettingsView {
  return {
    realityCheckMinutes: u.realityCheckMinutes,
    dailyLimitMinutes: u.dailyLimitMinutes,
    // Изтеклото самоизключване се показва като „няма“ (лениво, без cron).
    selfExcludedUntil: selfExclusionActive(u.selfExcludedUntil) ? u.selfExcludedUntil!.toISOString() : null,
  };
}

/** GET /api/account/responsible — инструментите за отговорна игра на играча. */
accountRouter.get(
  "/responsible",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: RESPONSIBLE_SELECT });
    if (!user || user.deletedAt) throw unauthorized();
    res.json(toResponsibleView(user));
  }),
);

/**
 * PUT /api/account/responsible — напомняне за време (0/30/60/120 мин) и дневен
 * лимит на сесията (null = без). Само позволените стойности (Zod, strict).
 */
accountRouter.put(
  "/responsible",
  asyncHandler(async (req, res) => {
    const input = responsibleSettingsSchema.parse(req.body);
    const id = req.user!.sub;
    const user = await prisma.user.findUnique({ where: { id }, select: RESPONSIBLE_SELECT });
    if (!user || user.deletedAt) throw unauthorized();
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.realityCheckMinutes !== undefined ? { realityCheckMinutes: input.realityCheckMinutes } : {}),
        ...(input.dailyLimitMinutes !== undefined ? { dailyLimitMinutes: input.dailyLimitMinutes } : {}),
      },
      select: RESPONSIBLE_SELECT,
    });
    res.json(toResponsibleView(updated));
  }),
);

/**
 * POST /api/account/self-exclude — самоизключване за 24 ч / 7 дни / 30 дни /
 * 6 месеца. Не може да се отмени или съкрати преди изтичане: нов период само
 * удължава вече активното (никога не го скъсява). Докато трае, realtime отказва
 * маси и опашки, а магазинът — покупки.
 */
accountRouter.post(
  "/self-exclude",
  asyncHandler(async (req, res) => {
    const { period } = selfExcludeSchema.parse(req.body);
    const id = req.user!.sub;
    const user = await prisma.user.findUnique({ where: { id }, select: RESPONSIBLE_SELECT });
    if (!user || user.deletedAt) throw unauthorized();
    const current = selfExclusionActive(user.selfExcludedUntil) ? user.selfExcludedUntil : null;
    const until = selfExclusionEnd(period, current);
    const updated = await prisma.user.update({
      where: { id },
      data: { selfExcludedUntil: until, selfExcludedAt: new Date() },
      select: RESPONSIBLE_SELECT,
    });
    res.json(toResponsibleView(updated));
  }),
);
