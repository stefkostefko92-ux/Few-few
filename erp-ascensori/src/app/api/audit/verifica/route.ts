// Проверка на целостта: преподписва редовете и сравнява HMAC.
// Несъвпадение = доказуема директна манипулация в базата.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { verificaAudit } from "@/lib/audit-hmac";

const schema = z.object({
  /** брой последни редове за проверка (по подразбиране 500) */
  limite: z.number().int().min(1).max(10000).optional(),
});

export const POST = gestito(async (req) => {
  await richiedeRuolo("ADMIN");
  const { limite = 500 } = await corpoValidato(req, schema);
  const chiave = process.env.AUDIT_HMAC_KEY;
  if (!chiave || chiave.length < 32) return ok({ errore: "AUDIT_HMAC_KEY non configurata" }, 500);

  const righe = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
  });
  const corrotte: string[] = [];
  for (const r of righe) {
    const valida = verificaAudit(
      {
        azione: r.azione,
        entita: r.entita,
        entitaId: r.entitaId,
        dettagli: r.dettagli ?? null,
        utenteId: r.utenteId,
        createdAt: r.createdAt,
      },
      r.hmac,
      chiave
    );
    if (!valida) corrotte.push(r.id);
  }
  return ok({ controllate: righe.length, corrotte, integro: corrotte.length === 0 });
});
