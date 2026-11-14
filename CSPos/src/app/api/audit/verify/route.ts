// Проверка на целостта на одиторския дневник (хеш верига). Четящ маршрут — достъпен за
// одиторския профил: проверяващият сам вижда дали записи са подменяни или изтривани.

import { guard, requireRead } from "@/lib/auth";
import { verifyAuditChain } from "@/lib/audit";

export async function GET() {
  return guard(async () => {
    await requireRead("MANAGER");
    const result = await verifyAuditChain();
    return Response.json({ result, checkedAt: new Date().toISOString() });
  });
}
