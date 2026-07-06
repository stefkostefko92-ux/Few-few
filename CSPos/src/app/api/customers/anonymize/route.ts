// GDPR чл. 17 (право на изтриване) съвместено с ЗСч чл. 12 / ДОПК (пазене на
// счетоводните данни ≥10 г.). Не трием продажбите — анонимизираме само
// идентификаторите на клиента (име/телефон). `Sale.customerId` остава за
// счетоводна проследимост. Разрешено само при нулево задължение (вересия).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({ id: z.string().min(1) });

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Липсва клиент.");

    const customer = await prisma.customer.findUnique({ where: { id: parsed.data.id } });
    if (!customer) throw jsonError(404, "Клиентът не е намерен.");
    if (customer.anonymizedAt) throw jsonError(409, "Клиентът вече е анонимизиран.");
    if (customer.balanceCents !== 0) {
      throw jsonError(409, "Не може да се анонимизира клиент с непогасена вересия.");
    }

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        name: "Анонимизиран клиент",
        phone: null,
        marketingConsent: false,
        consentAt: null,
        anonymizedAt: new Date(),
        active: false,
      },
    });
    // одитът пази само ID (без старите лични данни) — минимизация
    await audit(s.userId, "CUSTOMER_ANONYMIZED", "Customer", customer.id, {
      cardNumber: customer.cardNumber,
    });

    return Response.json({ customer: { id: updated.id, anonymizedAt: updated.anonymizedAt } });
  });
}
