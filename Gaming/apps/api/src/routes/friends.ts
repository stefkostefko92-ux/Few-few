import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@aso/db";
import { asyncHandler, badRequest, conflict } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { onlineStatus } from "../social/presence.js";
import { notify } from "./notifications.js";

export const friendsRouter: Router = Router();

friendsRouter.use(requireAuth);

const lite = { id: true, displayName: true, level: true, vipTier: true } as const;

/** GET /api/friends — accepted friends (with presence) + pending in/out. */
friendsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!.sub;
    const rows = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: me }, { addresseeId: me }] },
      include: { requester: { select: lite }, addressee: { select: lite } },
    });

    const accepted = rows.filter((r) => r.status === "ACCEPTED");
    const friendUsers = accepted.map((r) => (r.requesterId === me ? r.addressee : r.requester));
    const presence = await onlineStatus(friendUsers.map((u) => u.id));

    res.json({
      friends: accepted.map((r) => {
        const u = r.requesterId === me ? r.addressee : r.requester;
        return { friendshipId: r.id, ...u, online: presence[u.id] ?? false };
      }),
      incoming: rows
        .filter((r) => r.status === "PENDING" && r.addresseeId === me)
        .map((r) => ({ friendshipId: r.id, ...r.requester })),
      outgoing: rows
        .filter((r) => r.status === "PENDING" && r.requesterId === me)
        .map((r) => ({ friendshipId: r.id, ...r.addressee })),
    });
  }),
);

/** GET /api/friends/search?q= — find players to befriend (excludes existing). */
friendsRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const me = req.user!.sub;
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ users: [] });
      return;
    }
    const existing = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: me }, { addresseeId: me }] },
      select: { requesterId: true, addresseeId: true },
    });
    const linked = new Set<string>([me]);
    for (const f of existing) {
      linked.add(f.requesterId);
      linked.add(f.addresseeId);
    }
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { notIn: [...linked] },
        // Search by display name only. Matching on email would let anyone probe
        // whether a given address is registered (email enumeration), defeating
        // the anti-enumeration design of the auth/forgot-password flows.
        displayName: { contains: q, mode: "insensitive" },
      },
      select: lite,
      take: 10,
    });
    res.json({ users });
  }),
);

const requestSchema = z.object({ userId: z.string().min(1).max(64) });

/** POST /api/friends/request — send (or auto-accept a mutual) request. */
friendsRouter.post(
  "/request",
  asyncHandler(async (req, res) => {
    const me = req.user!.sub;
    const { userId } = requestSchema.parse(req.body);
    if (userId === me) throw badRequest("self", "Не можеш да добавиш себе си");

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.deletedAt) throw badRequest("not_found", "Няма такъв играч");

    // If they already requested me, accept that instead of creating a dupe.
    const reverse = await prisma.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId: userId, addresseeId: me } },
    });
    if (reverse) {
      if (reverse.status === "PENDING") {
        await prisma.friendship.update({ where: { id: reverse.id }, data: { status: "ACCEPTED" } });
        await notify(userId, "friend_accepted", { byId: me });
      }
      res.json({ status: "ACCEPTED" });
      return;
    }

    try {
      await prisma.friendship.create({ data: { requesterId: me, addresseeId: userId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("exists", "Вече има заявка или приятелство");
      }
      throw e;
    }
    await notify(userId, "friend_request", { fromId: me });
    res.status(201).json({ status: "PENDING" });
  }),
);

/** POST /api/friends/:id/accept — accept an incoming request. */
friendsRouter.post(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    const me = req.user!.sub;
    const id = String(req.params.id ?? "");
    const fr = await prisma.friendship.findUnique({ where: { id } });
    if (!fr || fr.addresseeId !== me || fr.status !== "PENDING") {
      throw badRequest("invalid", "Невалидна заявка");
    }
    await prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED" } });
    await notify(fr.requesterId, "friend_accepted", { byId: me });
    res.json({ ok: true });
  }),
);

/** POST /api/friends/:id/decline — decline (delete) an incoming request. */
friendsRouter.post(
  "/:id/decline",
  asyncHandler(async (req, res) => {
    const me = req.user!.sub;
    const id = String(req.params.id ?? "");
    const fr = await prisma.friendship.findUnique({ where: { id } });
    if (!fr || fr.addresseeId !== me) throw badRequest("invalid", "Невалидна заявка");
    await prisma.friendship.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

/** DELETE /api/friends/:userId — remove a friend (either direction). */
friendsRouter.delete(
  "/:userId",
  asyncHandler(async (req, res) => {
    const me = req.user!.sub;
    const other = String(req.params.userId ?? "");
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: me, addresseeId: other },
          { requesterId: other, addresseeId: me },
        ],
      },
    });
    res.json({ ok: true });
  }),
);
