// Открити продажби (Прил. № 29, т. 8, 9, 9.1): откриване при първия артикул и списък на
// откритите/задържаните продажби на оператора (екранът ги възстановява след презареждане).

import { prisma } from "@/lib/db";
import { guard, jsonError, requireRead, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireFiscalForOpen, fiscalNow } from "@/lib/fiscal/link";
import { listDrafts, openDraft } from "@/lib/sale-draft";

export async function GET() {
  return guard(async () => {
    const s = await requireRead("CASHIER");
    const drafts = await listDrafts(s.userId);
    return Response.json({ drafts });
  });
}

export async function POST() {
  return guard(async () => {
    const s = await requireRole("CASHIER");
    const shift = await prisma.shift.findFirst({ where: { userId: s.userId, closedAt: null } });
    if (!shift) throw jsonError(409, "Няма отворена смяна — първо отворете смяна.");

    // т. 8: ИН на ФУ от връзка до 2 часа назад; иначе проверка на живо, при неуспех — блок
    const serial = await requireFiscalForOpen();
    const draft = await openDraft(
      { userId: s.userId, operatorCode: s.operatorCode, role: s.role, shiftId: shift.id },
      serial,
      await fiscalNow()
    );
    await audit(s.userId, "SALE_OPENED", "SaleDraft", draft.id, undefined, { unp: draft.unp });
    return Response.json({ draft: { ...draft, lines: [] } }, { status: 201 });
  });
}
