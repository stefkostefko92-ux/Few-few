import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  endDate: z.string().date().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const { id } = await ctx.params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни.");
    const { endDate, ...rest } = parsed.data;

    const promotion = await prisma.promotion.update({
      where: { id },
      data: {
        ...rest,
        ...(endDate ? { endDate: new Date(`${endDate}T23:59:59.999`) } : {}),
      },
    });
    await audit(s.userId, "PROMOTION_UPDATE", "Promotion", id, parsed.data);
    return Response.json({ promotion });
  });
}

// Без изтриване — промоцията се деактивира (одитна следа)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const { id } = await ctx.params;
    await prisma.promotion.update({ where: { id }, data: { active: false } });
    await audit(s.userId, "PROMOTION_DEACTIVATE", "Promotion", id);
    return Response.json({ ok: true });
  });
}
