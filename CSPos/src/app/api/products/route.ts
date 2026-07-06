import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  return guard(async () => {
    await requireSession();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const categoryId = url.searchParams.get("categoryId") ?? undefined;
    const includeInactive = url.searchParams.get("all") === "1";

    const products = await prisma.product.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(categoryId ? { categoryId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                ...(/^\d+$/.test(q) ? [{ plu: parseInt(q, 10) }] : []),
              ],
            }
          : {}),
      },
      include: { category: true, barcodes: true },
      orderBy: [{ favorite: "desc" }, { name: "asc" }],
      take: 500,
    });
    return Response.json({ products });
  });
}

const productSchema = z.object({
  plu: z.number().int().min(1).max(99999),
  name: z.string().min(1).max(120),
  categoryId: z.string().min(1),
  unit: z.enum(["PCS", "KG"]),
  vatGroup: z.enum(["A", "B", "C", "D"]),
  priceCents: z.number().int().min(0),
  costCents: z.number().int().min(0).default(0),
  minStockMilli: z.number().int().min(0).default(0),
  favorite: z.boolean().default(false),
  barcodes: z.array(z.string().min(3).max(32)).default([]),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = productSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за стока.");
    const { barcodes, ...data } = parsed.data;

    const product = await prisma.product.create({
      data: {
        ...data,
        barcodes: { create: barcodes.map((code) => ({ code })) },
      },
      include: { barcodes: true, category: true },
    });
    await audit(s.userId, "PRODUCT_CREATE", "Product", product.id, {
      plu: product.plu,
      name: product.name,
      priceCents: product.priceCents,
    });
    return Response.json({ product }, { status: 201 });
  });
}
