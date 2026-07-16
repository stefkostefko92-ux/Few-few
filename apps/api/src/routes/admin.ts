import { Router } from "express";
import { z } from "zod";
import { prisma } from "@aso/db";
import { ROLES, VIP_TIERS, type Role, type VipTier } from "@aso/shared";
import { asyncHandler, badRequest, forbidden } from "../http.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { revokeUser, unrevokeUser } from "../auth/revocation.js";
import { discordEnabled, notifyAdminAction, notifyBroadcast, sendTest } from "../integrations/discord.js";
import { getDiscordConfig, setDiscordConfig } from "../settings.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

export const adminRouter: Router = Router();

// Staff-only (§14). Read access for MODERATOR/SUPPORT+; mutations gated
// per-route below (flag/report triage: MODERATOR+; the rest: ADMIN/OWNER).
adminRouter.use(requireAuth, requireRole("MODERATOR", "SUPPORT", "ADMIN", "OWNER"));

const STAFF_WRITE = requireRole("ADMIN", "OWNER");
// Moderation triage (flags/reports) is moderator work; SUPPORT stays read-only.
const MOD_WRITE = requireRole("MODERATOR", "ADMIN", "OWNER");

/**
 * First-run owner bootstrap (§14): if BOOTSTRAP_OWNER_EMAIL is set, promote
 * that account to OWNER at boot (idempotent). Registration always grants
 * PLAYER, so a fresh deploy would otherwise need manual SQL before anyone can
 * open the admin panel. The user must re-login for the new role to enter the
 * access-token claims.
 */
export async function bootstrapOwner(): Promise<void> {
  const email = env.BOOTSTRAP_OWNER_EMAIL.trim().toLowerCase();
  if (!email) return;
  const res = await prisma.user.updateMany({
    where: { email, role: { not: "OWNER" } },
    data: { role: "OWNER" },
  });
  if (res.count > 0) {
    logger.info({ email }, "bootstrap: promoted BOOTSTRAP_OWNER_EMAIL to OWNER");
    await prisma.adminAudit.create({
      data: {
        actorId: "system",
        actorName: "system",
        action: "bootstrap_owner",
        targetId: null,
        detail: JSON.stringify({ email }),
      },
    });
  }
}

/**
 * Lazily lift expired temp bans (banned + banUntil in the past). Called from
 * the admin read paths so staff always see the effective state; the Redis
 * revocation entry self-expires (access-token TTL) and needs no cleanup.
 */
async function liftExpiredBans(): Promise<void> {
  await prisma.user.updateMany({
    where: { banned: true, banUntil: { not: null, lte: new Date() } },
    data: { banned: false, banReason: null, banUntil: null },
  });
}

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
    await liftExpiredBans();
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

interface DayCount {
  day: Date;
  n: number;
}

/** GET /api/admin/stats/timeseries?days=14 — per-day DAU (from lastSeenAt),
 *  registrations, matches and completed-purchase revenue, plus the top games
 *  by matches played in the window. Buckets are UTC days. */
adminRouter.get(
  "/stats/timeseries",
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days ?? 14), 1), 90);
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const [dauRows, regRows, matchRows, revRows, gameGroups] = await Promise.all([
      // DAU approximation: lastSeenAt is a single "last seen" timestamp, so a
      // player counts toward the day of their most recent visit in the window.
      prisma.$queryRaw<DayCount[]>`
        SELECT date_trunc('day', "lastSeenAt")::date AS day, COUNT(*)::int AS n
        FROM "User" WHERE "lastSeenAt" >= ${start} GROUP BY 1`,
      prisma.$queryRaw<DayCount[]>`
        SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::int AS n
        FROM "User" WHERE "createdAt" >= ${start} GROUP BY 1`,
      prisma.$queryRaw<DayCount[]>`
        SELECT date_trunc('day', "startedAt")::date AS day, COUNT(*)::int AS n
        FROM "Match" WHERE "startedAt" >= ${start} GROUP BY 1`,
      prisma.$queryRaw<(DayCount & { cents: number })[]>`
        SELECT date_trunc('day', p."createdAt")::date AS day, COUNT(*)::int AS n,
               COALESCE(SUM(pr."priceCents"), 0)::int AS cents
        FROM "Purchase" p JOIN "Product" pr ON pr."id" = p."productId"
        WHERE p."status" = 'completed' AND p."createdAt" >= ${start} GROUP BY 1`,
      prisma.match.groupBy({
        by: ["game"],
        where: { startedAt: { gte: start } },
        _count: { _all: true },
        orderBy: { _count: { game: "desc" } },
        take: 10,
      }),
    ]);

    const key = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
    const dau = new Map(dauRows.map((r) => [key(r.day), r.n]));
    const regs = new Map(regRows.map((r) => [key(r.day), r.n]));
    const matches = new Map(matchRows.map((r) => [key(r.day), r.n]));
    const rev = new Map(revRows.map((r) => [key(r.day), r]));

    const series = Array.from({ length: days }, (_, i) => {
      const k = key(new Date(start.getTime() + i * 86_400_000));
      return {
        day: k,
        dau: dau.get(k) ?? 0,
        registrations: regs.get(k) ?? 0,
        matches: matches.get(k) ?? 0,
        purchases: rev.get(k)?.n ?? 0,
        revenueCents: rev.get(k)?.cents ?? 0,
      };
    });
    res.json({
      days,
      series,
      topGames: gameGroups.map((g) => ({ game: g.game, matches: g._count._all })),
    });
  }),
);

/** GET /api/admin/users?q=&role=&banned=&vip=&take=&cursor= — search players
 *  with role/ban/VIP filters and cursor pagination. */
adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    await liftExpiredBans();
    const q = String(req.query.q ?? "").trim();
    const take = Math.min(Math.max(Number(req.query.take ?? 50), 1), 100);
    const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;
    const roleQ = String(req.query.role ?? "");
    const role = (ROLES as readonly string[]).includes(roleQ) ? (roleQ as Role) : undefined;
    const vipQ = String(req.query.vip ?? "");
    const vip = (VIP_TIERS as readonly string[]).includes(vipQ) ? (vipQ as VipTier) : undefined;
    const bannedQ = String(req.query.banned ?? "");
    const banned = bannedQ === "1" || bannedQ === "true" ? true : bannedQ === "0" || bannedQ === "false" ? false : undefined;

    const where = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { displayName: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(role ? { role } : {}),
      ...(vip ? { vipTier: vip } : {}),
      ...(banned !== undefined ? { banned } : {}),
    };
    const rows = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, email: true, displayName: true, role: true, vipTier: true,
        banned: true, banReason: true, banUntil: true, chips: true, gems: true,
        level: true, createdAt: true, lastSeenAt: true,
      },
    });
    const hasMore = rows.length > take;
    const users = (hasMore ? rows.slice(0, take) : rows).map((u) => ({ ...u, chips: u.chips.toString() }));
    res.json({ users, nextCursor: hasMore ? (users[users.length - 1]?.id ?? null) : null });
  }),
);

/** GET /api/admin/users/:id — full detail. */
adminRouter.get(
  "/users/:id",
  asyncHandler(async (req, res) => {
    await liftExpiredBans();
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

/** GET /api/admin/users/:id/matches — the player's match history (paginated). */
adminRouter.get(
  "/users/:id/matches",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    const take = Math.min(Math.max(Number(req.query.take ?? 20), 1), 50);
    const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;
    const rows = await prisma.matchPlayer.findMany({
      where: { userId: id },
      include: { match: true },
      orderBy: [{ match: { startedAt: "desc" } }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, take) : rows).map((mp) => ({
      id: mp.id,
      game: mp.match.game,
      mode: mp.match.mode,
      startedAt: mp.match.startedAt,
      endedAt: mp.match.endedAt,
      seat: mp.seat,
      result: mp.result,
      mmrDelta: mp.mmrDelta,
      chipsDelta: mp.chipsDelta.toString(),
    }));
    res.json({ items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null });
  }),
);

/** Above this absolute grant size a staff note is mandatory (server-enforced;
 *  the panel mirrors it client-side). Applies to both chips and gems. */
export const GRANT_NOTE_THRESHOLD = 10_000;

const updateUserSchema = z.object({
  role: z.enum(ROLES).optional(),
  vipTier: z.enum(VIP_TIERS).optional(),
  banned: z.boolean().optional(),
  // Required when banned:true; ignored otherwise. banUntil null/absent = permanent.
  banReason: z.string().trim().min(1).max(500).optional(),
  banUntil: z.string().datetime().nullish(),
  grantChips: z.number().int().gte(-1_000_000_000).lte(1_000_000_000).optional(),
  grantGems: z.number().int().gte(-1_000_000).lte(1_000_000).optional(),
  // Free-text "why" recorded in the audit trail (compensation, promo, test…).
  note: z.string().trim().max(300).optional(),
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
    const isSelf = id === req.user!.sub;
    const rank = (r: string) => ROLES.indexOf(r as (typeof ROLES)[number]);

    // Role assignment guard: an actor may never grant a role at or above their
    // own rank (an ADMIN must not be able to mint another ADMIN). Only an OWNER
    // may mint another OWNER — the sole role at OWNER rank they're allowed to set.
    if (input.role) {
      if (input.role === "OWNER") {
        if (actorRole !== "OWNER") throw forbidden("Само OWNER може да дава OWNER роля");
      } else if (rank(input.role) >= rank(actorRole)) {
        throw forbidden("Не може да присвоиш роля с равен или по-висок ранг от твоя");
      }
    }

    // A large grant must always carry a note (audit trail / abuse deterrent);
    // the client mirrors this threshold but the server is authoritative.
    const bigGrant =
      Math.abs(input.grantChips ?? 0) > GRANT_NOTE_THRESHOLD ||
      Math.abs(input.grantGems ?? 0) > GRANT_NOTE_THRESHOLD;
    if (bigGrant && (!input.note || input.note.trim().length < 3)) {
      throw badRequest("grant_note_required", "При голяма сума бележката (причина) е задължителна");
    }

    // Self-service abuse guard: staff may not grant themselves currency or change
    // their own role (privilege escalation / self-enrichment). VIP tweaks and
    // the like remain allowed.
    if (isSelf) {
      if (input.role && input.role !== actorRole) {
        throw forbidden("Не можеш да променяш собствената си роля");
      }
      if ((input.grantChips ?? 0) !== 0 || (input.grantGems ?? 0) !== 0) {
        throw forbidden("Не можеш да си начисляваш валута");
      }
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw badRequest("not_found", "Няма такъв играч");

    // No staff member may ban/demote/modify an account of equal-or-higher rank
    // (prevents an ADMIN from decapitating the OWNER or another ADMIN). Self-edit
    // is allowed (the guards above still constrain role/currency self-changes).
    if (!isSelf && rank(target.role) >= rank(actorRole)) {
      throw forbidden("Не може да променяш акаунт с равен или по-висок ранг");
    }

    const data: Record<string, unknown> = {};
    if (input.role) data.role = input.role;
    if (input.vipTier) data.vipTier = input.vipTier;
    // A ban always carries a reason (surfaced to staff + audit) and may carry
    // an expiry; unban clears both.
    if (input.banned === true) {
      if (!input.banReason) throw badRequest("ban_reason_required", "Причината за блокиране е задължителна");
      const until = input.banUntil ? new Date(input.banUntil) : null;
      if (until && until.getTime() <= Date.now()) {
        throw badRequest("ban_until_past", "Срокът на блокиране трябва да е в бъдещето");
      }
      data.banned = true;
      data.banReason = input.banReason;
      data.banUntil = until;
    } else if (input.banned === false) {
      data.banned = false;
      data.banReason = null;
      data.banUntil = null;
    }
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
  banned: boolean; banReason: string | null; banUntil: Date | null;
  chips: bigint; gems: number; level: number;
}) {
  return {
    id: u.id, email: u.email, displayName: u.displayName, role: u.role,
    vipTier: u.vipTier, banned: u.banned, banReason: u.banReason, banUntil: u.banUntil,
    chips: u.chips.toString(), gems: u.gems, level: u.level,
  };
}

// ── Collusion flags (MODERATOR+) ────────────────────────────────────────────

/** GET /api/admin/flags?status=OPEN&take=&cursor= — collusion flags for review
 *  (§13.5), cursor-paginated like the other queues. */
adminRouter.get(
  "/flags",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "OPEN").toUpperCase();
    const valid = ["OPEN", "REVIEWING", "DISMISSED", "CONFIRMED"];
    const take = Math.min(Math.max(Number(req.query.take ?? 50), 1), 100);
    const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;
    const rows = await prisma.collusionFlag.findMany({
      where: valid.includes(status) ? { status: status as "OPEN" } : {},
      orderBy: [{ score: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const flags = hasMore ? rows.slice(0, take) : rows;
    res.json({ flags, nextCursor: hasMore ? (flags[flags.length - 1]?.id ?? null) : null });
  }),
);

const reviewSchema = z.object({ status: z.enum(["REVIEWING", "DISMISSED", "CONFIRMED"]) });

/** PATCH /api/admin/flags/:id — triage a flag (never an auto-ban; §13.5). */
adminRouter.patch(
  "/flags/:id",
  MOD_WRITE,
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

// ── Chat reports (read: staff; triage: MODERATOR+) ──────────────────────────

const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;

/** GET /api/admin/reports?status=OPEN&take=&cursor= — chat report queue. */
adminRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "OPEN").toUpperCase();
    const take = Math.min(Math.max(Number(req.query.take ?? 50), 1), 100);
    const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;
    const rows = await prisma.chatReport.findMany({
      where: (REPORT_STATUSES as readonly string[]).includes(status) ? { status: status as "OPEN" } : {},
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    // Reporter ids are plain strings (no FK); resolve display names in one query.
    const ids = [...new Set(page.map((r) => r.fromUserId))];
    const reporters = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })
      : [];
    const nameById = new Map(reporters.map((u) => [u.id, u.displayName]));
    const items = page.map((r) => ({
      id: r.id,
      matchId: r.matchId,
      fromUserId: r.fromUserId,
      fromName: nameById.get(r.fromUserId) ?? null,
      targetSeat: r.targetSeat,
      text: r.text,
      status: r.status,
      createdAt: r.createdAt,
    }));
    res.json({ items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null });
  }),
);

const reportPatchSchema = z.object({ status: z.enum(REPORT_STATUSES) });

/** PATCH /api/admin/reports/:id — resolve/dismiss (or reopen) a chat report. */
adminRouter.patch(
  "/reports/:id",
  MOD_WRITE,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!id) throw badRequest("missing_id", "Missing report id");
    const { status } = reportPatchSchema.parse(req.body);
    const report = await prisma.chatReport.update({ where: { id }, data: { status } });
    const actorName = await resolveActorName(req.user!.sub);
    await audit(req.user!, actorName, "resolve_report", id, { status, matchId: report.matchId });
    res.json({ report });
  }),
);

// ── Discord (ADMIN/OWNER) ────────────────────────────────────────────────────

/** Parse an ISO/date query param; undefined when absent or invalid. */
function parseDateParam(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** GET /api/admin/audit — paginated staff audit log (most recent first).
 *  Filters: action (exact), actor (name contains / exact id), targetId,
 *  from/to (ISO timestamps). */
adminRouter.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const take = Math.min(Math.max(Number(req.query.take ?? 50), 1), 100);
    const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;
    const action = String(req.query.action ?? "").trim();
    const actor = String(req.query.actor ?? "").trim();
    const targetId = String(req.query.targetId ?? "").trim();
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);
    const where = {
      ...(action ? { action } : {}),
      ...(actor
        ? { OR: [{ actorName: { contains: actor, mode: "insensitive" as const } }, { actorId: actor }] }
        : {}),
      ...(targetId ? { targetId } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };
    const rows = await prisma.adminAudit.findMany({
      where,
      take: take + 1,
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, take) : rows).map((a) => ({
      id: a.id,
      actorName: a.actorName,
      action: a.action,
      targetId: a.targetId,
      detail: a.detail,
      createdAt: a.createdAt,
    }));
    res.json({ items, nextCursor: hasMore ? items[items.length - 1]?.id : null });
  }),
);

/** Mask a webhook URL so its secret token can't be read: keep the host and the
 *  last 4 characters, redact the rest. Empty stays empty. */
function maskWebhook(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/•••${url.slice(-4)}`;
  } catch {
    return "•••";
  }
}

/** GET /api/admin/discord — webhook config. ADMIN/OWNER see the full URL (they
 *  edit it); MODERATOR/SUPPORT get a masked URL so the secret token doesn't leak
 *  to lower-privileged staff who only need the connection status. */
adminRouter.get(
  "/discord",
  asyncHandler(async (req, res) => {
    const cfg = await getDiscordConfig(true);
    const role = req.user!.role;
    const canSeeSecret = role === "ADMIN" || role === "OWNER";
    res.json(canSeeSecret ? cfg : { ...cfg, webhookUrl: maskWebhook(cfg.webhookUrl), masked: true });
  }),
);

const discordConfigSchema = z.object({
  // Empty string clears it; otherwise must be a Discord webhook URL.
  webhookUrl: z
    .string()
    .trim()
    .max(400)
    .refine((v) => v === "" || /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(v), {
      message: "Must be a https://discord.com/api/webhooks/… URL",
    })
    .optional(),
  webhookName: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  events: z
    .object({
      registration: z.boolean(),
      purchase: z.boolean(),
      vip: z.boolean(),
      flag: z.boolean(),
      adminAction: z.boolean(),
      broadcast: z.boolean(),
    })
    .partial()
    .optional(),
});

/** PUT /api/admin/discord — update the webhook config (ADMIN/OWNER). */
adminRouter.put(
  "/discord",
  STAFF_WRITE,
  asyncHandler(async (req, res) => {
    const patch = discordConfigSchema.parse(req.body);
    const cfg = await setDiscordConfig(patch);
    const actorName = await resolveActorName(req.user!.sub);
    await audit(req.user!, actorName, "discord_config", null, {
      enabled: cfg.enabled,
      hasUrl: cfg.webhookUrl.length > 0,
    });
    res.json(cfg);
  }),
);

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
