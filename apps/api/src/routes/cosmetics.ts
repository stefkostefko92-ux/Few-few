import { Router } from "express";
import { prisma } from "@aso/db";
import {
  buyCosmeticSchema,
  equipCosmeticSchema,
  cosmeticById,
  cosmeticsForGame,
  isGameKey,
  VIP_PERKS,
  type VipTier,
} from "@aso/shared";
import { asyncHandler, badRequest, conflict, forbidden, unauthorized } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const cosmeticsRouter: Router = Router();

cosmeticsRouter.use(requireAuth);

/** "GAME.TYPE.variant" -> the "GAME.TYPE." slot prefix (one equipped per slot). */
function slotPrefix(id: string): string {
  const parts = id.split(".");
  return `${parts[0]}.${parts[1]}.`;
}

/** Whether a tier may own/equip VIP-exclusive cosmetics (SILVER+). */
const canUseExclusive = (tier: VipTier): boolean => VIP_PERKS[tier].exclusiveCosmetics;

/** GET /api/cosmetics?game=CHESS — catalog for a game with owned/equipped flags. */
cosmeticsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const game = String(req.query.game ?? "").toUpperCase();
    if (!isGameKey(game)) throw badRequest("bad_game", "Непозната игра");

    const userId = req.user!.sub;
    const [user, inventory] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.inventoryItem.findMany({ where: { userId } }),
    ]);
    if (!user) throw unauthorized();

    const owned = new Map(inventory.map((i) => [i.cosmeticId, i.equipped]));
    const items = cosmeticsForGame(game).map((c) => ({
      ...c,
      owned: owned.has(c.id),
      equipped: owned.get(c.id) === true,
      locked: c.vipExclusive && !canUseExclusive(user.vipTier as VipTier),
    }));

    res.json({ game, gems: user.gems, vipTier: user.vipTier, items });
  }),
);

/** GET /api/cosmetics/equipped — every equipped cosmetic id (for applying visuals). */
cosmeticsRouter.get(
  "/equipped",
  asyncHandler(async (req, res) => {
    const inventory = await prisma.inventoryItem.findMany({
      where: { userId: req.user!.sub, equipped: true },
      select: { cosmeticId: true },
    });
    res.json({ equipped: inventory.map((i) => i.cosmeticId) });
  }),
);

/** POST /api/cosmetics/buy — spend gems to own a cosmetic. */
cosmeticsRouter.post(
  "/buy",
  asyncHandler(async (req, res) => {
    const { id } = buyCosmeticSchema.parse(req.body);
    const cosmetic = cosmeticById(id);
    if (!cosmetic) throw badRequest("unknown_cosmetic", "Непознат артикул");

    const userId = req.user!.sub;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized();

    if (cosmetic.vipExclusive && !canUseExclusive(user.vipTier as VipTier)) {
      throw forbidden("Този артикул е само за VIP (Silver и нагоре)");
    }

    const already = await prisma.inventoryItem.findUnique({
      where: { userId_cosmeticId: { userId, cosmeticId: id } },
    });
    if (already) throw conflict("already_owned", "Вече притежаваш този артикул");

    if (user.gems < cosmetic.gemPrice) {
      throw badRequest("insufficient_gems", "Нямаш достатъчно камъни");
    }

    // Atomic: guard the gem balance in the WHERE so concurrent buys can't
    // overspend; create the inventory row only if the debit landed.
    const debited = await prisma.user.updateMany({
      where: { id: userId, gems: { gte: cosmetic.gemPrice } },
      data: { gems: { decrement: cosmetic.gemPrice } },
    });
    if (debited.count !== 1) throw badRequest("insufficient_gems", "Нямаш достатъчно камъни");

    await prisma.inventoryItem.create({ data: { userId, cosmeticId: id } });

    const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { gems: true } });
    res.status(201).json({ gems: fresh?.gems ?? 0, ownedId: id });
  }),
);

/** POST /api/cosmetics/equip — equip an owned cosmetic, unequipping its slot mate. */
cosmeticsRouter.post(
  "/equip",
  asyncHandler(async (req, res) => {
    const { id } = equipCosmeticSchema.parse(req.body);
    const cosmetic = cosmeticById(id);
    if (!cosmetic) throw badRequest("unknown_cosmetic", "Непознат артикул");

    const userId = req.user!.sub;
    const owned = await prisma.inventoryItem.findUnique({
      where: { userId_cosmeticId: { userId, cosmeticId: id } },
    });
    if (!owned) throw badRequest("not_owned", "Не притежаваш този артикул");

    await prisma.$transaction([
      // One equipped item per (game, type) slot.
      prisma.inventoryItem.updateMany({
        where: { userId, cosmeticId: { startsWith: slotPrefix(id) }, equipped: true },
        data: { equipped: false },
      }),
      prisma.inventoryItem.update({
        where: { userId_cosmeticId: { userId, cosmeticId: id } },
        data: { equipped: true },
      }),
    ]);

    const equipped = await prisma.inventoryItem.findMany({
      where: { userId, equipped: true },
      select: { cosmeticId: true },
    });
    res.json({ equipped: equipped.map((i) => i.cosmeticId) });
  }),
);
