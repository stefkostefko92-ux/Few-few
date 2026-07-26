// Подписване на отчета на място, от клиента.
//
// Подписът е ЕДНОКРАТЕН: веднъж положен, отчетът се заключва. Иначе подписът
// не доказва нищо — съдържанието под него може да се смени после.

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { firmaSchema } from "@/lib/entities";
import { validaFirma } from "@/lib/firma";

export const POST = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const { firmaCliente, firmatarioNome, firmatarioRuolo } = await corpoValidato(
    req,
    firmaSchema,
  );

  const esito = validaFirma(firmaCliente);
  if (!esito.valida)
    throw new ErroreHttp(400, esito.errore ?? "Firma non valida");

  const prima = await prisma.rapportino.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!prima) throw new ErroreHttp(404, "Rapportino non trovato");
  if (prima.firmatoAt)
    throw new ErroreHttp(
      409,
      "Rapportino già firmato: non può essere firmato di nuovo",
    );

  // Условен запис: две едновременни подписвания не могат да успеят и двете.
  const upd = await prisma.rapportino.updateMany({
    where: { id, firmatoAt: null },
    data: {
      firmaCliente,
      firmatarioNome,
      firmatarioRuolo: firmatarioRuolo ?? null,
      firmatoAt: new Date(),
    },
  });
  if (upd.count === 0) throw new ErroreHttp(409, "Rapportino già firmato");

  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "rapportini",
    entitaId: id,
    // Името на подписващия е доказателствената част — влиза в одита.
    dettagli: { valori: { firmato: { a: firmatarioNome } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return ok(await prisma.rapportino.findUniqueOrThrow({ where: { id } }));
});
