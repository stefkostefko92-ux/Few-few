import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, guard, jsonError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { lockedFor, recordFail, recordSuccess } from "@/lib/login-throttle";
import type { RoleKey } from "@/lib/constants";

const bodySchema = z.object({
  operatorCode: z.coerce.number().int().min(1).max(9999),
  pin: z.string().regex(/^\d{4,8}$/),
});

export async function POST(req: Request) {
  return guard(async () => {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за вход.");
    const { operatorCode, pin } = parsed.data;

    const lockMs = lockedFor(operatorCode);
    if (lockMs > 0) {
      throw jsonError(
        429,
        `Твърде много опити. Опитайте отново след ${Math.ceil(lockMs / 1000)} сек.`
      );
    }

    const user = await prisma.user.findUnique({ where: { operatorCode } });
    if (!user || !user.active || !(await bcrypt.compare(pin, user.pinHash))) {
      recordFail(operatorCode);
      await audit(null, "LOGIN_FAILED", "User", String(operatorCode));
      throw jsonError(401, "Грешен код на оператор или ПИН.");
    }
    recordSuccess(operatorCode);

    await createSession({
      userId: user.id,
      name: user.name,
      role: user.role as RoleKey,
      operatorCode: user.operatorCode,
      readOnly: user.readOnly,
    });
    await audit(user.id, "LOGIN");

    const openShift = await prisma.shift.findFirst({
      where: { userId: user.id, closedAt: null },
    });

    return Response.json({
      user: { name: user.name, role: user.role, operatorCode: user.operatorCode, readOnly: user.readOnly },
      hasOpenShift: Boolean(openShift),
    });
  });
}
