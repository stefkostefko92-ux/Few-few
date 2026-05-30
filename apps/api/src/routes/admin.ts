import { Router } from "express";
import { z } from "zod";
import { prisma } from "@aso/db";
import { asyncHandler, badRequest } from "../http.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const adminRouter: Router = Router();

// Moderation is restricted to staff roles (§14 authz).
adminRouter.use(requireAuth, requireRole("MODERATOR", "ADMIN", "OWNER"));

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

const reviewSchema = z.object({
  status: z.enum(["REVIEWING", "DISMISSED", "CONFIRMED"]),
});

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
    res.json({ flag });
  }),
);
