import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";

export async function GET() {
  return guard(async () => {
    await requireSession();
    const suppliers = await prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
    return Response.json({ suppliers });
  });
}

const schema = z.object({
  name: z.string().min(1).max(160),
  eik: z.string().max(13).optional(),
  vatNumber: z.string().max(15).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  return guard(async () => {
    await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за доставчик.");
    const supplier = await prisma.supplier.create({ data: parsed.data });
    return Response.json({ supplier }, { status: 201 });
  });
}
