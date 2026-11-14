// Открита продажба: PUT — записва текущите редове от екрана (анулиранията се отчитат на
// сървъра, т. 12); POST — анулиране на цялата продажба, задържане или връщане.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { manualDiscountAllowed } from "@/lib/pricing";
import { cancelDraft, holdDraft, resumeDraft, syncDraft } from "@/lib/sale-draft";

const syncSchema = z.object({
  lines: z
    .array(
      z.object({
        uid: z.string().min(1).max(64),
        productId: z.string().min(1),
        qtyMilli: z.number().int().min(1).max(1_000_000_000),
        discountPermille: z.number().int().min(0).max(999).default(0),
        priceLockedCents: z.number().int().min(0).nullable().optional(),
      })
    )
    .max(500),
  customerCard: z.string().max(32).nullable().optional(),
});

async function operator(userId: string, operatorCode: number, role: "CASHIER" | "MANAGER" | "ADMIN") {
  const shift = await prisma.shift.findFirst({ where: { userId, closedAt: null } });
  if (!shift) throw jsonError(409, "Няма отворена смяна.");
  return { userId, operatorCode, role, shiftId: shift.id };
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const s = await requireRole("CASHIER");
    const { id } = await ctx.params;
    const parsed = syncSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни редове на бона.");

    // ръчна отстъпка над лимита на касиера иска управител (одитът: процентът не е клиентски)
    const policy = await getSetting("pos");
    const maxManual = Math.max(0, ...parsed.data.lines.map((l) => l.discountPermille));
    if (!manualDiscountAllowed(maxManual, s.role, policy.maxCashierDiscountPermille)) {
      throw jsonError(
        403,
        `Отстъпка над ${policy.maxCashierDiscountPermille / 10}% се дава от управител.`
      );
    }

    const op = await operator(s.userId, s.operatorCode, s.role);
    const r = await syncDraft(id, op, parsed.data.lines, { customerCard: parsed.data.customerCard });
    const totalCents = r.priced.reduce((a, l) => a + l.totalCents, 0);
    const vatCents = r.priced.reduce((a, l) => a + l.vatCents, 0);
    return Response.json({
      draft: r.draft,
      lines: r.priced.map((l, i) => ({
        uid: parsed.data.lines[i]!.uid,
        totalCents: l.totalCents,
        unitCents: l.unitCents,
        discountCents: l.discountCents,
        discountPermille: l.discountPermille,
      })),
      totalCents,
      vatCents,
    });
  });
}

const actionSchema = z.object({ action: z.enum(["cancel", "hold", "resume"]) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const s = await requireRole("CASHIER");
    const { id } = await ctx.params;
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидно действие.");

    if (parsed.data.action === "cancel") {
      await cancelDraft(id, { userId: s.userId, operatorCode: s.operatorCode });
      return Response.json({ ok: true });
    }
    const draft = await prisma.saleDraft.findUnique({ where: { id }, select: { unp: true } });
    if (parsed.data.action === "hold") {
      await holdDraft(id, { userId: s.userId });
      await audit(s.userId, "SALE_HELD", "SaleDraft", id, undefined, { unp: draft?.unp });
      return Response.json({ ok: true });
    }
    const resumed = await resumeDraft(id, { userId: s.userId });
    await audit(s.userId, "SALE_RESUMED", "SaleDraft", id, undefined, { unp: resumed.unp });
    return Response.json({ draft: resumed });
  });
}
