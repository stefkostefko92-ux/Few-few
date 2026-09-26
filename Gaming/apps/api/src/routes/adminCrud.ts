import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "@aso/db";
import {
  ACHIEVEMENT_DEFS,
  GAME_KEYS,
  cosmeticById,
  leaderboardKey,
  type GameKey,
} from "@aso/shared";
import { asyncHandler, badRequest, conflict, forbidden } from "../http.js";
import { requireRole } from "../middleware/requireAuth.js";
import { eraseUser } from "../account/erase.js";
import { redis } from "../redis.js";
import { logger } from "../logger.js";
import { audit, notFoundError, resolveActorName, roleRank } from "./adminShared.js";

/**
 * Разширен админски CRUD (§14). Монтира се ВЪТРЕ в `adminRouter`, затова
 * наследява `requireAuth` + четене за целия персонал (MODERATOR/SUPPORT/ADMIN/
 * OWNER). Всеки запис е гейтнат тук: ADMIN+ (`STAFF_WRITE`), изтриването на
 * акаунт — само OWNER. Всеки вход минава през Zod; липсващ обект → 404; всяка
 * мутация оставя одит запис (AdminAudit + Discord).
 */
export const adminCrudRouter: Router = Router();

const STAFF_WRITE = requireRole("ADMIN", "OWNER");
const OWNER_ONLY = requireRole("OWNER");

/** Стандартна пагинация с курсор (като останалите опашки в admin.ts). */
const takeSchema = z.coerce.number().int().min(1).max(100).default(50);
const idParam = (req: Request, name: string): string => String(req.params[name] ?? "");

/**
 * Зарежда целевия играч за мутация и налага защитите:
 * 404 при липса; 403 за собствения акаунт (без само-обогатяване/само-редакция
 * през тези инструменти); 403 при равен/по-висок ранг (като в admin.ts).
 */
async function loadMutableTarget(req: Request, id: string) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFoundError("Няма такъв играч");
  if (id === req.user!.sub) throw forbidden("Не можеш да променяш собствения си акаунт оттук");
  if (roleRank(target.role) >= roleRank(req.user!.role)) {
    throw forbidden("Не може да променяш акаунт с равен или по-висок ранг");
  }
  return target;
}

/** За четене: само 404 при липсващ играч. */
async function requireUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, displayName: true } });
  if (!user) throw notFoundError("Няма такъв играч");
  return user;
}

async function auditAs(req: Request, action: string, targetId: string | null, detail: Record<string, unknown>) {
  const actorName = await resolveActorName(req.user!.sub);
  await audit(req.user!, actorName, action, targetId, detail);
}

// ── Сезони (четене: персонал; запис: ADMIN+) ────────────────────────────────

/** GET /api/admin/seasons — всички сезони, най-новите първо. */
adminCrudRouter.get(
  "/seasons",
  asyncHandler(async (_req, res) => {
    const items = await prisma.season.findMany({ orderBy: { index: "desc" }, take: 200 });
    res.json({ items });
  }),
);

const seasonCreateSchema = z
  .object({
    index: z.number().int().min(1).max(100_000),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(), {
    message: "Краят трябва да е след началото",
    path: ["endsAt"],
  });

/** POST /api/admin/seasons — нов (неактивен) сезон. Активира се отделно. */
adminCrudRouter.post(
  "/seasons",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const input = seasonCreateSchema.parse(req.body);
    const dup = await prisma.season.findUnique({ where: { index: input.index } });
    if (dup) throw conflict("season_index_taken", "Вече има сезон с този номер");
    const season = await prisma.season.create({
      data: {
        index: input.index,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        active: false,
      },
    });
    await auditAs(req, "season_create", season.id, {
      index: season.index,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    res.json({ season });
  }),
);

const seasonPatchSchema = z
  .object({
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .refine((v) => v.startsAt !== undefined || v.endsAt !== undefined, { message: "Няма промени" });

/** PATCH /api/admin/seasons/:id — смяна на датите (краят остава след началото). */
adminCrudRouter.patch(
  "/seasons/:id",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const input = seasonPatchSchema.parse(req.body);
    const existing = await prisma.season.findUnique({ where: { id } });
    if (!existing) throw notFoundError("Няма такъв сезон");
    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw badRequest("season_dates_invalid", "Краят трябва да е след началото");
    }
    const season = await prisma.season.update({ where: { id }, data: { startsAt, endsAt } });
    await auditAs(req, "season_update", id, { index: season.index, ...input });
    res.json({ season });
  }),
);

/**
 * POST /api/admin/seasons/:id/activate — прави сезона ЕДИНСТВЕНИЯ активен
 * (транзакция: спира всички други, пуска този). Сезон с изминал край не се
 * активира — worker-ът (`rolloverSeasons`) веднага би го затворил и отворил нов.
 */
adminCrudRouter.post(
  "/seasons/:id/activate",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const existing = await prisma.season.findUnique({ where: { id } });
    if (!existing) throw notFoundError("Няма такъв сезон");
    if (existing.endsAt.getTime() <= Date.now()) {
      throw badRequest("season_ended", "Сезонът е приключил — смени датите, преди да го активираш");
    }
    const [, season] = await prisma.$transaction([
      prisma.season.updateMany({ where: { active: true, id: { not: id } }, data: { active: false } }),
      prisma.season.update({ where: { id }, data: { active: true } }),
    ]);
    await auditAs(req, "season_activate", id, { index: season.index });
    res.json({ season });
  }),
);

/** DELETE /api/admin/seasons/:id — само неактивен сезон, който не тече в момента. */
adminCrudRouter.delete(
  "/seasons/:id",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const existing = await prisma.season.findUnique({ where: { id } });
    if (!existing) throw notFoundError("Няма такъв сезон");
    if (existing.active) throw conflict("season_active", "Активен сезон не може да се изтрие");
    const now = Date.now();
    if (existing.startsAt.getTime() <= now && existing.endsAt.getTime() > now) {
      throw conflict("season_current", "Текущ сезон не може да се изтрие");
    }
    await prisma.season.delete({ where: { id } });
    await auditAs(req, "season_delete", id, { index: existing.index });
    res.json({ ok: true });
  }),
);

// ── Мачове (четене: персонал) ───────────────────────────────────────────────

const matchesQuerySchema = z.object({
  game: z.enum(GAME_KEYS).optional(),
  userId: z.string().trim().min(1).max(64).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  take: takeSchema,
  cursor: z.string().trim().min(1).max(64).optional(),
});

/** GET /api/admin/matches?game=&userId=&from=&to=&take=&cursor= — всички мачове. */
adminCrudRouter.get(
  "/matches",
  asyncHandler(async (req, res) => {
    const q = matchesQuerySchema.parse(req.query);
    const where = {
      ...(q.game ? { game: q.game } : {}),
      ...(q.userId ? { players: { some: { userId: q.userId } } } : {}),
      ...(q.from || q.to
        ? {
            startedAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const rows = await prisma.match.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: q.take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { _count: { select: { players: true } } },
    });
    const hasMore = rows.length > q.take;
    const items = (hasMore ? rows.slice(0, q.take) : rows).map((m) => ({
      id: m.id,
      game: m.game,
      mode: m.mode,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      players: m._count.players,
    }));
    res.json({ items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null });
  }),
);

/**
 * GET /api/admin/matches/:id — детайл с играчите. Сървърният seed (commit-reveal,
 * §13.2) се показва САМО за приключил мач: докато тече, той е тайна, която би
 * позволила на персонал да предвиди раздаването.
 */
adminCrudRouter.get(
  "/matches/:id",
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        players: {
          orderBy: { seat: "asc" },
          include: { user: { select: { displayName: true } } },
        },
      },
    });
    if (!match) throw notFoundError("Няма такъв мач");
    const ended = match.endedAt !== null;
    res.json({
      match: {
        id: match.id,
        game: match.game,
        mode: match.mode,
        seed: ended ? match.seed : null,
        seedHidden: !ended,
        startedAt: match.startedAt,
        endedAt: match.endedAt,
        players: match.players.map((p) => ({
          id: p.id,
          userId: p.userId,
          displayName: p.user?.displayName ?? null,
          seat: p.seat,
          result: p.result,
          mmrDelta: p.mmrDelta,
          chipsDelta: p.chipsDelta.toString(),
        })),
      },
    });
  }),
);

// ── Инвентар на играч (четене: персонал; запис: ADMIN+) ─────────────────────

/** GET /api/admin/users/:id/inventory — притежавани козметики. */
adminCrudRouter.get(
  "/users/:id/inventory",
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    await requireUser(id);
    const rows = await prisma.inventoryItem.findMany({ where: { userId: id }, orderBy: { cosmeticId: "asc" } });
    res.json({
      items: rows.map((r) => {
        const c = cosmeticById(r.cosmeticId);
        return {
          id: r.id,
          cosmeticId: r.cosmeticId,
          equipped: r.equipped,
          name: c?.name ?? null,
          game: c?.game ?? null,
          type: c?.type ?? null,
        };
      }),
    });
  }),
);

const inventoryGrantSchema = z.object({
  cosmeticId: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .refine((v) => cosmeticById(v) !== undefined, { message: "Непознат козметичен ID" }),
});

/** POST /api/admin/users/:id/inventory — даряване на козметика от каталога. */
adminCrudRouter.post(
  "/users/:id/inventory",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const { cosmeticId } = inventoryGrantSchema.parse(req.body);
    const target = await loadMutableTarget(req, id);
    const dup = await prisma.inventoryItem.findUnique({
      where: { userId_cosmeticId: { userId: id, cosmeticId } },
    });
    if (dup) throw conflict("already_owned", "Играчът вече притежава тази козметика");
    const item = await prisma.inventoryItem.create({ data: { userId: id, cosmeticId } });
    await auditAs(req, "inventory_grant", id, { target: target.displayName, cosmeticId });
    res.json({ item });
  }),
);

/** DELETE /api/admin/users/:id/inventory/:itemId — отнемане на козметика. */
adminCrudRouter.delete(
  "/users/:id/inventory/:itemId",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const itemId = idParam(req, "itemId");
    const target = await loadMutableTarget(req, id);
    const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, userId: id } });
    if (!item) throw notFoundError("Няма такъв предмет в инвентара");
    await prisma.inventoryItem.delete({ where: { id: itemId } });
    await auditAs(req, "inventory_revoke", id, { target: target.displayName, cosmeticId: item.cosmeticId });
    res.json({ ok: true });
  }),
);

// ── Постижения на играч (четене: персонал; запис: ADMIN+) ───────────────────

const ACHIEVEMENT_KEYS = new Set(ACHIEVEMENT_DEFS.map((d) => d.key));

/** GET /api/admin/users/:id/achievements — отключени постижения. */
adminCrudRouter.get(
  "/users/:id/achievements",
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    await requireUser(id);
    const rows = await prisma.achievement.findMany({ where: { userId: id }, orderBy: { unlockedAt: "desc" } });
    res.json({
      items: rows.map((r) => {
        const def = ACHIEVEMENT_DEFS.find((d) => d.key === r.key);
        return { key: r.key, unlockedAt: r.unlockedAt, title: def?.title ?? null, icon: def?.icon ?? null };
      }),
    });
  }),
);

const achievementGrantSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((v) => ACHIEVEMENT_KEYS.has(v), { message: "Непознато постижение" }),
});

/**
 * POST /api/admin/users/:id/achievements — ръчно отключване. Само значката:
 * наградата в скъпоценни камъни НЕ се начислява (при нужда — през „Даряване“).
 */
adminCrudRouter.post(
  "/users/:id/achievements",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const { key } = achievementGrantSchema.parse(req.body);
    const target = await loadMutableTarget(req, id);
    const dup = await prisma.achievement.findUnique({ where: { userId_key: { userId: id, key } } });
    if (dup) throw conflict("already_unlocked", "Постижението вече е отключено");
    const achievement = await prisma.achievement.create({ data: { userId: id, key } });
    await auditAs(req, "achievement_grant", id, { target: target.displayName, key });
    res.json({ achievement });
  }),
);

/**
 * DELETE /api/admin/users/:id/achievements/:key — отнемане. Внимание: ако
 * условието още е изпълнено, следващият мач ще го отключи отново (с наградата).
 */
adminCrudRouter.delete(
  "/users/:id/achievements/:key",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const key = idParam(req, "key");
    const target = await loadMutableTarget(req, id);
    const row = await prisma.achievement.findUnique({ where: { userId_key: { userId: id, key } } });
    if (!row) throw notFoundError("Постижението не е отключено");
    await prisma.achievement.delete({ where: { id: row.id } });
    await auditAs(req, "achievement_revoke", id, { target: target.displayName, key });
    res.json({ ok: true });
  }),
);

// ── Мисии на играч (четене: персонал; нулиране: ADMIN+) ─────────────────────

/** GET /api/admin/users/:id/quests — редовете на мисиите (последните периоди). */
adminCrudRouter.get(
  "/users/:id/quests",
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    await requireUser(id);
    const items = await prisma.quest.findMany({
      where: { userId: id },
      orderBy: [{ period: "desc" }, { key: "asc" }],
      take: 100,
    });
    res.json({ items });
  }),
);

/**
 * DELETE /api/admin/users/:id/quests/:questId — нулира мисия. Безопасно:
 * `ensureQuests` прави upsert по (userId,key,period), така че редът се
 * пресъздава с progress 0 при следващото четене/мач. Нулирана завършена мисия
 * може да се изпълни (и награди) отново — това е съзнателно действие на персонала.
 */
adminCrudRouter.delete(
  "/users/:id/quests/:questId",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const questId = idParam(req, "questId");
    const target = await loadMutableTarget(req, id);
    const quest = await prisma.quest.findFirst({ where: { id: questId, userId: id } });
    if (!quest) throw notFoundError("Няма такава мисия");
    await prisma.quest.delete({ where: { id: questId } });
    await auditAs(req, "quest_reset", id, {
      target: target.displayName,
      key: quest.key,
      period: quest.period,
      progress: quest.progress,
      completed: quest.completedAt !== null,
    });
    res.json({ ok: true });
  }),
);

// ── Рейтинги (четене: персонал; запис: ADMIN+) ──────────────────────────────

/** Начален рейтинг — съвпада с @default(1200) в схемата. */
const DEFAULT_MMR = 1200;

/** GET /api/admin/users/:id/ratings — MMR по игри. */
adminCrudRouter.get(
  "/users/:id/ratings",
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    await requireUser(id);
    const items = await prisma.ratingPerGame.findMany({ where: { userId: id }, orderBy: { game: "asc" } });
    res.json({ items });
  }),
);

const ratingPatchSchema = z.union([
  z.object({ mmr: z.number().int().min(0).max(4000) }).strict(),
  z.object({ reset: z.literal(true) }).strict(),
]);

/**
 * PATCH /api/admin/users/:id/ratings/:game — `{mmr}` (0..4000) или
 * `{reset:true}` (MMR 1200, 0 игри, 0 победи). Опреснява и класацията в Redis.
 */
adminCrudRouter.patch(
  "/users/:id/ratings/:game",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const game = z.enum(GAME_KEYS).parse(idParam(req, "game")) as GameKey;
    const input = ratingPatchSchema.parse(req.body);
    const target = await loadMutableTarget(req, id);
    const before = await prisma.ratingPerGame.findUnique({ where: { userId_game: { userId: id, game } } });
    const data = "reset" in input ? { mmr: DEFAULT_MMR, games: 0, wins: 0 } : { mmr: input.mmr };
    const rating = await prisma.ratingPerGame.upsert({
      where: { userId_game: { userId: id, game } },
      create: { userId: id, game, ...data },
      update: data,
    });
    // Класацията е производна (ZSET по рейтинг) — best-effort, без да блокира.
    try {
      await redis.zadd(leaderboardKey(game), rating.mmr, id);
    } catch (err) {
      logger.warn({ err, userId: id, game }, "admin rating: leaderboard update failed");
    }
    await auditAs(req, "reset" in input ? "rating_reset" : "rating_set", id, {
      target: target.displayName,
      game,
      from: before?.mmr ?? null,
      to: rating.mmr,
    });
    res.json({ rating });
  }),
);

// ── Известия до играч (четене: персонал; изпращане: ADMIN+) ─────────────────

/** GET /api/admin/users/:id/notifications — последните 30 известия. */
adminCrudRouter.get(
  "/users/:id/notifications",
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    await requireUser(id);
    const rows = await prisma.notification.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    res.json({
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        data: safeParse(n.data),
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    });
  }),
);

const notificationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
});

/** POST /api/admin/users/:id/notifications — системно известие от персонала. */
adminCrudRouter.post(
  "/users/:id/notifications",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const input = notificationSchema.parse(req.body);
    const target = await loadMutableTarget(req, id);
    const notification = await prisma.notification.create({
      data: {
        userId: id,
        type: "system",
        data: JSON.stringify({ kind: "admin_message", title: input.title, body: input.body }),
      },
    });
    await auditAs(req, "notification_send", id, { target: target.displayName, title: input.title });
    res.json({ notification: { ...notification, data: safeParse(notification.data) } });
  }),
);

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ── Абонамент на играч (четене: персонал) ───────────────────────────────────

/** GET /api/admin/users/:id/subscription — VIP абонаментът (или null). */
adminCrudRouter.get(
  "/users/:id/subscription",
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    await requireUser(id);
    const subscription = await prisma.subscription.findUnique({ where: { userId: id } });
    res.json({ subscription });
  }),
);

// ── Изтриване на акаунт (САМО OWNER) ────────────────────────────────────────

const eraseSchema = z.object({ confirmEmail: z.string().trim().min(3).max(320) });

/**
 * DELETE /api/admin/users/:id — GDPR изтриване от OWNER (анонимизация чрез
 * `eraseUser`, същото като самоизтриването). Изисква `{confirmEmail}` да съвпада
 * с имейла на играча. Не може себе си и не може друг OWNER. В одита НЕ пишем
 * имейл/име — изтритият не бива да оцелее като PII в одит-следата/Discord.
 */
adminCrudRouter.delete(
  "/users/:id",
  OWNER_ONLY,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const { confirmEmail } = eraseSchema.parse(req.body);
    if (id === req.user!.sub) throw forbidden("Не можеш да изтриеш собствения си акаунт оттук");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFoundError("Няма такъв играч");
    if (target.role === "OWNER") throw forbidden("OWNER акаунт не може да се изтрие");
    if (target.deletedAt) throw conflict("already_deleted", "Акаунтът вече е изтрит");
    if (confirmEmail.toLowerCase() !== target.email.toLowerCase()) {
      throw badRequest("email_mismatch", "Имейлът за потвърждение не съвпада");
    }
    await eraseUser(id);
    await auditAs(req, "user_erase", id, { role: target.role });
    res.json({ ok: true });
  }),
);

// ── Обяви и продукти: твърдо изтриване (ADMIN+) ─────────────────────────────

/** DELETE /api/admin/announcements/:id — изтрива обява завинаги. */
adminCrudRouter.delete(
  "/announcements/:id",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw notFoundError("Няма такава обява");
    await prisma.announcement.delete({ where: { id } });
    await auditAs(req, "announcement_delete", id, { title: existing.title });
    res.json({ ok: true });
  }),
);

/**
 * DELETE /api/admin/products/:id — само продукт без покупки. Purchase има
 * onDelete: Cascade към Product, затова изтриване на продаван продукт би
 * заличило историята на приходите → 409 с подсказка да се деактивира.
 */
adminCrudRouter.delete(
  "/products/:id",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = idParam(req, "id");
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw notFoundError("Няма такъв продукт");
    const purchases = await prisma.purchase.count({ where: { productId: id } });
    if (purchases > 0) {
      throw conflict("product_has_purchases", "Продуктът има покупки — деактивирай го вместо да го триеш");
    }
    await prisma.product.delete({ where: { id } });
    await auditAs(req, "product_delete", id, { sku: existing.sku });
    res.json({ ok: true });
  }),
);
