// Сканиране/набиране на код в POS екрана. Редът на разпознаване:
// 1) точен баркод; 2) тегловен/ценови баркод по маските (28/29…);
// 3) кратък PLU номер. Целта е < 200 ms — локална БД, без външни повиквания.

import { prisma } from "@/lib/db";
import { guard, jsonError, requireSession } from "@/lib/auth";
import { parseEmbeddedBarcode } from "@/lib/barcode";
import { getBarcodeMasks } from "@/lib/settings";

export async function GET(req: Request) {
  return guard(async () => {
    await requireSession();
    const code = new URL(req.url).searchParams.get("code")?.trim();
    if (!code) throw jsonError(400, "Липсва код.");

    // 1) точен баркод
    const byBarcode = await prisma.barcode.findUnique({
      where: { code },
      include: { product: true },
    });
    if (byBarcode && byBarcode.product.active) {
      return Response.json({ product: byBarcode.product, qtyMilli: 1000 });
    }

    // 2) тегловен/ценови баркод
    const masks = await getBarcodeMasks();
    const embedded = parseEmbeddedBarcode(code, masks);
    if (embedded) {
      const product = await prisma.product.findUnique({ where: { plu: embedded.plu } });
      if (!product || !product.active) {
        throw jsonError(404, `Няма стока с PLU ${embedded.plu} (от тегловния баркод).`);
      }
      if (embedded.kind === "weight") {
        return Response.json({ product, qtyMilli: embedded.qtyMilli });
      }
      // ценови баркод: количество = цена / единична цена (3 знака)
      const qtyMilli = product.priceCents > 0
        ? Math.round((embedded.value / product.priceCents) * 1000)
        : 1000;
      return Response.json({
        product,
        qtyMilli,
        priceLockedCents: embedded.value,
      });
    }

    // 3) кратък PLU
    if (/^\d{1,5}$/.test(code)) {
      const product = await prisma.product.findUnique({ where: { plu: parseInt(code, 10) } });
      if (product && product.active) {
        return Response.json({ product, qtyMilli: 1000 });
      }
    }

    throw jsonError(404, "Кодът не е намерен.");
  });
}
