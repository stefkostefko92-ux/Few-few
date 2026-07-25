// Смяна на статус на оферта — САМО по позволените преходи.
// APPROVATO се пази за RESPONSABILE+ (гл. Controlli amministrativi).

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeSessione, richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import {
  STATI_PREVENTIVO,
  transizionePreventivoAmmessa,
  type StatoPreventivo,
} from "@/lib/regole-fiscali";

const schema = z.object({ stato: z.enum(STATI_PREVENTIVO) });

export const PATCH = gestito(async (req, ctx) => {
  // Сесията се иска ПРЕДИ да се чете тялото: иначе анонимен клиент кара сървъра
  // да разбира и валидира произволен JSON, преди да получи 401.
  await richiedeSessione();
  const { stato } = await corpoValidato(req, schema);
  // одобрението на оферта е координационно решение → минимум RESPONSABILE
  const s = await richiedeRuolo(stato === "APPROVATO" ? "RESPONSABILE" : "OPERATORE");
  const { id } = await ctx.params;

  const dopo = await prisma.$transaction(async (tx) => {
    // с филтъра по фирма — иначе познат UUID сменя статуса на ЧУЖД документ
    const prima = await tx.preventivo.findFirst({ where: { id, ...filtroTenant(s) } });
    if (!prima) throw new ErroreHttp(404, "Preventivo non trovato");
    const da = prima.stato as StatoPreventivo;
    if (!transizionePreventivoAmmessa(da, stato))
      throw new ErroreHttp(409, `Transizione non ammessa: da «${da}» a «${stato}»`);
    const upd = await tx.preventivo.updateMany({ where: { id, stato: da }, data: { stato } });
    if (upd.count === 0)
      throw new ErroreHttp(409, "Stato modificato da un'altra operazione: riprovare");
    return tx.preventivo.findUniqueOrThrow({ where: { id } });
  });

  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "preventivi",
    entitaId: id,
    dettagli: { valori: { stato: { a: stato } } },
    utenteId: s.sub,
  });
  return ok(dopo);
});
