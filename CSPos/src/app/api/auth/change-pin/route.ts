// Смяна на собствения ПИН (КП-П.2, КП-П.3). Задължителна при първи вход от шаблонната база и
// след ПИН, зададен от администратор. Иска стария ПИН; грешният стар ПИН се брои като неуспешен
// вход (същото заключване след 5 опита), иначе маршрутът би бил заобиколен път за налучкване.
// Одиторският профил също сменя своя ПИН — затова не е зад `requireRole`.

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, guard, jsonError, requireSessionForPinChange } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { lockedFor, recordFail, recordSuccess } from "@/lib/login-throttle";
import { pinPolicyError } from "@/lib/pin-policy";

const schema = z.object({
  currentPin: z.string().regex(/^\d{4,8}$/),
  newPin: z.string(),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireSessionForPinChange();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Въведете стария и новия ПИН.");
    const { currentPin, newPin } = parsed.data;

    const lockMs = lockedFor(s.operatorCode);
    if (lockMs > 0) throw jsonError(429, `Твърде много опити. Опитайте отново след ${Math.ceil(lockMs / 1000)} сек.`);

    const user = await prisma.user.findUnique({ where: { id: s.userId } });
    if (!user || !user.active) throw jsonError(401, "Изисква се вход в системата.");
    if (!(await bcrypt.compare(currentPin, user.pinHash))) {
      recordFail(s.operatorCode);
      await audit(user.id, "LOGIN_FAILED", "User", String(user.operatorCode), { reason: "грешен стар ПИН при смяна" });
      throw jsonError(401, "Старият ПИН не е верен.");
    }
    recordSuccess(s.operatorCode);

    const policy = pinPolicyError(newPin, currentPin);
    if (policy) throw jsonError(400, policy);

    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: await bcrypt.hash(newPin, 10), mustChangePin: false },
    });
    await audit(user.id, "PIN_CHANGED", "User", user.id, { operatorCode: user.operatorCode, firstLogin: user.mustChangePin });
    await createSession({
      userId: user.id,
      name: user.name,
      role: s.role,
      operatorCode: user.operatorCode,
      readOnly: user.readOnly,
      mustChangePin: false,
    });
    return Response.json({ ok: true });
  });
}
