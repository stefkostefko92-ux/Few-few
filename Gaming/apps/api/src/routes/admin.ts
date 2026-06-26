import { Router } from "express";
import { z } from "zod";
import { prisma } from "@aso/db";
import { ROLES, VIP_TIERS } from "@aso/shared";
import { asyncHandler, badRequest, forbidden } from "../http.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { revokeUser, unrevokeUser } from "../auth/revocation.js";
import { discordEnabled, notifyAdminAction, notifyBroadcast, sendTest } from "../integrations/discord.js";

export const adminRouter: Router = Router();

// Staff-only (§14). Read access for MODERATOR+; mutations gated to ADMIN/OWNER
// per-route below.
adminRouter.use(requireAuth, requireRole("MODERATOR", "ADMIN", "OWNER"));

const STAFF_WRITE = requireRole("ADMIN", "OWNER");

/** Friendly actor label for the audit trail (display name, else the id). */
async function resolveActorName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  return u?.displayName ?? userId;
}

/** Record a staff mutation and mirror it to Discord. */
async function audit(
  actor: { sub: string },
  actorName: string,
  action: string,
  targetId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await prisma.adminAudit.create({
    data: { actorId: actor.sub, actorName, action, targetId, detail: JSON.stringify(detail) },
  });
  notifyAdminAction({
    actor: actorName,
    action,
    target: targetId ?? undefined,
    detail: JSON.stringify(detail),
  });
}

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** GET /api/admin/stats — dashboard metrics. */
adminRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const since = startOfToday();
    const [users, banned, newToday, openFlags, matchesToday, vipGroups, byProduct, products, gameGroups, audits] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { banned: true } }),
        prisma.user.count({ where: { createdAt: { gte: since } } }),
        prisma.collusionFlag.count({ where: { status: "OPEN" } }),
        prisma.match.count({ where: { startedAt: { gte: since } } }),
        prisma.user.groupBy({ by: ["vipTier"], _count: { _all: true } }),
        // Aggregate completed purchases by product (O(products)) instead of
        // loading every purchase row into memory.
        prisma.purchase.groupBy({ by: ["productId"], where: { status: "completed" }, _count: { _all: true } }),
        prisma.product.findMany({ select: { id: true, priceCents: true } }),
        prisma.match.groupBy({ by: ["game"], where: { startedAt: { gte: since } }, _count: { _all: true } }),
        prisma.adminAudit.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
      ]);

    const priceById = new Map(products.map((p) => [p.id, p.priceCents]));
    let revenueCents = 0;
    let purchases = 0;
    for (const g of byProduct) {
      revenueCents += (priceById.get(g.productId) ?? 0) * g._count._all;
      purchases += g._count._all;
    }
    const vip: Record<string, number> = {};
    for (const g of vipGroups) vip[g.vipTier] = g._count._all;
    const gamesToday: Record<string, number> = {};
    for (const g of gameGroups) gamesToday[g.game] = g._count._all;

    res.json({
      users,
      banned,
      newToday,
      openFlags,
      matchesToday,
      purchases,
      revenueCents,
      vip,
      gamesToday,
      audits,
    });
  }),
);

/** GET /api/admin/users?q=&take= — search players. */
adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const take = Math.min(Math.max(Number(req.query.take ?? 50), 1), 100);
    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { displayName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true, email: true, displayName: true, role: true, vipTier: true,
        banned: true, chips: true, gems: true, level: true, createdAt: true, lastSeenAt: true,
      },
    });
    res.json({ users: users.map((u) => ({ ...u, chips: u.chips.toString() })) });
  }),
);

/** GET /api/admin/users/:id — full detail. */
adminRouter.get(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        purchases: { include: { product: true }, orderBy: { createdAt: "desc" }, take: 20 },
        ratings: true,
        _count: { select: { inventory: true, matches: true } },
      },
    });
    if (!user) throw badRequest("not_found", "Няма такъв играч");
    const audits = await prisma.adminAudit.findMany({
      where: { targetId: id }, orderBy: { createdAt: "desc" }, take: 20,
    });
    const { passwordHash: _pw, ...safe } = user;
    res.json({ user: { ...safe, chips: user.chips.toString() }, audits });
  }),
);

const updateUserSchema = z.object({
  role: z.enum(ROLES).optional(),
  vipTier: z.enum(VIP_TIERS).optional(),
  banned: z.boolean().optional(),
  grantChips: z.number().int().gte(-1_000_000_000).lte(1_000_000_000).optional(),
  grantGems: z.number().int().gte(-1_000_000).lte(1_000_000).optional(),
});

/** PATCH /api/admin/users/:id — role / VIP / ban / grant currency (ADMIN+). */
adminRouter.patch(
  "/users/:id",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    const input = updateUserSchema.parse(req.body);
    const actorRole = req.user!.role;
    const actorName = await resolveActorName(req.user!.sub);

    // Only an OWNER may mint another OWNER.
    if (input.role === "OWNER" && actorRole !== "OWNER") {
      throw forbidden("Само OWNER може да дава OWNER роля");
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw badRequest("not_found", "Няма такъв играч");

    const data: Record<string, unknown> = {};
    if (input.role) data.role = input.role;
    if (input.vipTier) data.vipTier = input.vipTier;
    if (typeof input.banned === "boolean") data.banned = input.banned;
    // Credits use an ATOMIC increment so concurrent grants (or a grant racing a
    // webhook credit / daily claim) can't lose an update. Debits keep the
    // read-then-clamp (rare, staff-serialized) so the balance can't go negative.
    if (typeof input.grantChips === "number" && input.grantChips !== 0) {
      data.chips =
        input.grantChips > 0
          ? { increment: BigInt(input.grantChips) }
          : (() => {
              const next = target.chips + BigInt(input.grantChips);
              return next < 0n ? 0n : next;
            })();
    }
    if (typeof input.grantGems === "number" && input.grantGems !== 0) {
      data.gems = input.grantGems > 0 ? { increment: input.grantGems } : Math.max(0, target.gems + input.grantGems);
    }

    if (Object.keys(data).length === 0) throw badRequest("noop", "Няма промени");

    const updated = await prisma.user.update({ where: { id }, data });
    // Make a ban take effect immediately (revoke live access tokens); lift it
    // on unban.
    if (input.banned === true) await revokeUser(id);
    if (input.banned === false) await unrevokeUser(id);
    await audit(req.user!, actorName, "update_user", id, {
      target: target.displayName,
      ...input,
    });

    res.json({ user: { ...toAdminUser(updated) } });
  }),
);

function toAdminUser(u: {
  id: string; email: string; displayName: string; role: string; vipTier: string;
  banned: boolean; chips: bigint; gems: number; level: number;
}) {
  return {
    id: u.id, email: u.email, displayName: u.displayName, role: u.role,
    vipTier: u.vipTier, banned: u.banned, chips: u.chips.toString(), gems: u.gems, level: u.level,
  };
}

// ── Collusion flags (MODERATOR+) ────────────────────────────────────────────

/** GET /api/admin/flags?status=OPEN — collusion flags for review (§13.5). */
adminRouter.get(
  "/flags",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "OPEN").toUpperCase();
    const valid = ["OPEN", "REVIEWING", "DISMISSED", "CONFIRMED"];
    const flags = await prisma.collusionFlag.findMany({
      where: valid.includes(status) ? { status: status as "OPEN" } : {},
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
    res.json({ flags });
  }),
);

const reviewSchema = z.object({ status: z.enum(["REVIEWING", "DISMISSED", "CONFIRMED"]) });

/** PATCH /api/admin/flags/:id — triage a flag (never an auto-ban; §13.5). */
adminRouter.patch(
  "/flags/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!id) throw badRequest("missing_id", "Missing flag id");
    const { status } = reviewSchema.parse(req.body);
    const flag = await prisma.collusionFlag.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });
    const actorName = await resolveActorName(req.user!.sub);
    await audit(req.user!, actorName, "review_flag", id, { status });
    res.json({ flag });
  }),
);

// ── Discord (ADMIN/OWNER) ────────────────────────────────────────────────────

/** GET /api/admin/discord — webhook configured status. */
adminRouter.get("/discord", (_req, res) => {
  res.json({ enabled: discordEnabled() });
});

/** POST /api/admin/discord/test — send a test embed. */
adminRouter.post(
  "/discord/test",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const actorName = await resolveActorName(req.user!.sub);
    const sent = await sendTest(actorName);
    res.json({ sent, enabled: discordEnabled() });
  }),
);

const broadcastSchema = z.object({ message: z.string().trim().min(1).max(1800) });

/** POST /api/admin/broadcast — push an announcement to Discord. */
adminRouter.post(
  "/broadcast",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const { message } = broadcastSchema.parse(req.body);
    const actorName = await resolveActorName(req.user!.sub);
    notifyBroadcast(actorName, message);
    await audit(req.user!, actorName, "broadcast", null, { message });
    res.json({ sent: discordEnabled() });
  }),
);
