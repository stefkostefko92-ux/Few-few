// Промоции — управление (роля управител). Обхват: точно стока ИЛИ категория.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  return guard(async () => {
    await requireSession();
    const promotions = await prisma.promotion.findMany({
      include: {
        product: { select: { name: true, plu: true } },
        category: { select: { name: true } },
      },
      orderBy: [{ active: "desc" }, { endDate: "desc" }],
    });
    return Response.json({ promotions });
  });
}

const schema = z
  .object({
    name: z.string().min(1).max(120),
    productId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    kind: z.enum(["PERCENT", "PRICE", "MXN"]),
    percent: z.number().int().min(1).max(1000).nullable().optional(),
    priceCents: z.number().int().min(0).nullable().optional(),
    buyQty: z.number().int().min(2).max(99).nullable().optional(),
    payQty: z.number().int().min(1).max(98).nullable().optional(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    startMinute: z.number().int().min(0).max(1439).nullable().optional(),
    endMinute: z.number().int().min(0).max(1439).nullable().optional(),
    minQtyMilli: z.number().int().min(0).default(0),
  })
  .refine((d) => Boolean(d.productId) !== Boolean(d.categoryId), {
    message: "Изберете точно стока ИЛИ категория.",
  })
  .refine(
    (d) =>
      d.kind === "PERCENT"
        ? d.percent != null
        : d.kind === "PRICE"
          ? d.priceCents != null
          : d.buyQty != null && d.payQty != null && d.buyQty > d.payQty,
    { message: "Липсват параметри според типа (процент / промо цена / M за N)." }
  )
  .refine((d) => d.startDate <= d.endDate, { message: "Крайната дата е преди началната." });

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      throw jsonError(400, parsed.error.issues[0]?.message ?? "Невалидни данни за промоция.");
    }
    const d = parsed.data;

    const promotion = await prisma.promotion.create({
      data: {
        name: d.name,
        productId: d.productId ?? null,
        categoryId: d.categoryId ?? null,
        kind: d.kind,
        percent: d.kind === "PERCENT" ? d.percent ?? null : null,
        priceCents: d.kind === "PRICE" ? d.priceCents ?? null : null,
        buyQty: d.kind === "MXN" ? d.buyQty ?? null : null,
        payQty: d.kind === "MXN" ? d.payQty ?? null : null,
        startDate: new Date(`${d.startDate}T00:00:00`),
        endDate: new Date(`${d.endDate}T23:59:59.999`),
        startMinute: d.startMinute ?? null,
        endMinute: d.endMinute ?? null,
        minQtyMilli: d.minQtyMilli,
      },
    });
    await audit(s.userId, "PROMOTION_CREATE", "Promotion", promotion.id, {
      name: d.name,
      kind: d.kind,
    });
    return Response.json({ promotion }, { status: 201 });
  });
}
