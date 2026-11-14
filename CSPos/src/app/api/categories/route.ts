import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";

export async function GET() {
  return guard(async () => {
    await requireSession();
    const categories = await prisma.category.findMany({
      where: { active: true },
      orderBy: { sort: "asc" },
    });
    return Response.json({ categories });
  });
}

const schema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4a5a7d"),
  icon: z.string().max(40).default("Package"),
  sort: z.number().int().default(0),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за категория.");
    const category = await prisma.category.create({ data: parsed.data });
    await audit(s.userId, "CATEGORY_CREATE", "Category", category.id, { name: category.name });
    return Response.json({ category }, { status: 201 });
  });
}
